const { INK_PRIMARY, INK_SECONDARY, INK_MUTED, LINE } = require('./pdfTable');

// Same categorical palette + per-metric color identity as
// client/src/charts/colors.js, duplicated here because the server and
// client bundles are built and deployed independently. Keep these two
// files in sync if the palette ever changes.
const METRIC_COLORS = {
  callouts: '#2a78d6',
  ot: '#eb6834',
  moved: '#1baf7a',
  uncovered: '#e34948',
  workOrders: '#4a3aa7',
  incomingSupervisors: '#e87ba4',
  reports: '#0f4d99',
};

const LOCATION_COLORS = ['#2a78d6', '#1baf7a', '#eda100'];

function emptyNotice(doc, x, y, width, text = 'No data for the selected filters.') {
  doc.fontSize(9).fillColor(INK_MUTED).text(text, x, y, { width });
}

/**
 * A row of colored KPI tiles (value + label), wrapping to a new row every
 * `columns` tiles. Returns the y position immediately below the grid.
 */
function drawStatTiles(doc, { x, y, width, tiles, columns = 3, tileHeight = 56 }) {
  const gap = 10;
  const tileWidth = (width - gap * (columns - 1)) / columns;

  tiles.forEach((tile, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const tx = x + col * (tileWidth + gap);
    const ty = y + row * (tileHeight + gap);

    doc.roundedRect(tx, ty, tileWidth, tileHeight, 4).fillAndStroke('#f5f6f8', LINE);
    doc.fontSize(19).fillColor(tile.color || INK_PRIMARY).text(String(tile.value), tx + 10, ty + 8, { width: tileWidth - 20 });
    doc.fontSize(8).fillColor(INK_MUTED).text(tile.label, tx + 10, ty + 32, { width: tileWidth - 20 });
  });

  const rows = Math.ceil(tiles.length / columns);
  return y + rows * (tileHeight + gap);
}

/**
 * A small colored line/area chart for a date -> count trend, mirroring the
 * on-screen Recharts trend cards. Returns the y position below the chart.
 */
function drawLineChart(doc, { x, y, width, height, title, data, color }) {
  doc.fontSize(9).fillColor(INK_PRIMARY).text(title, x, y, { width });
  const chartTop = y + 14;
  const chartHeight = height - 14;
  const chartBottom = chartTop + chartHeight;

  doc.rect(x, chartTop, width, chartHeight).strokeColor(LINE).lineWidth(1).stroke();

  if (!data || data.length === 0) {
    emptyNotice(doc, x + 8, chartTop + chartHeight / 2 - 4, width - 16);
    return y + height + 10;
  }

  const counts = data.map((d) => Number(d.count || 0));
  const maxV = Math.max(...counts, 1);
  const innerLeft = x + 4;
  const innerWidth = width - 8;
  const stepX = data.length > 1 ? innerWidth / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    px: innerLeft + (data.length > 1 ? i * stepX : innerWidth / 2),
    py: chartBottom - (Number(d.count || 0) / maxV) * (chartHeight - 4) - 2,
  }));

  doc.save();
  doc.moveTo(points[0].px, chartBottom - 1);
  points.forEach((p) => doc.lineTo(p.px, p.py));
  doc.lineTo(points[points.length - 1].px, chartBottom - 1);
  doc.closePath();
  doc.fillOpacity(0.18).fill(color);
  doc.restore();

  doc.moveTo(points[0].px, points[0].py);
  points.slice(1).forEach((p) => doc.lineTo(p.px, p.py));
  doc.strokeColor(color).lineWidth(1.5).stroke();
  points.forEach((p) => doc.circle(p.px, p.py, 1.6).fill(color));

  doc.fontSize(7).fillColor(INK_MUTED);
  doc.text(String(data[0].date), x, chartBottom + 3, { width: width / 2 });
  doc.text(String(data[data.length - 1].date), x + width / 2, chartBottom + 3, { width: width / 2, align: 'right' });
  doc.text(`max ${maxV}`, x + width - 60, chartTop + 2, { width: 56, align: 'right' });

  return y + height + 14;
}

/**
 * A grouped, colored bar chart (one color per series/metric, one group per
 * category), with a small legend below - mirrors the on-screen "By Shift" /
 * "By Supervisor" comparison charts. Returns the y position below it.
 */
function drawGroupedBarChart(doc, { x, y, width, height, categories, series }) {
  if (!categories.length) {
    emptyNotice(doc, x, y, width);
    return y + 20;
  }

  const chartHeight = height - 34;
  const maxV = Math.max(1, ...series.flatMap((s) => s.values));
  const groupWidth = width / categories.length;
  const barGap = 2;
  const barWidth = Math.max(2, (groupWidth - 8) / series.length - barGap);

  categories.forEach((cat, ci) => {
    const groupX = x + ci * groupWidth + 4;
    series.forEach((s, si) => {
      const v = Number(s.values[ci] || 0);
      const barH = (v / maxV) * chartHeight;
      const barX = groupX + si * (barWidth + barGap);
      const barY = y + chartHeight - barH;
      if (barH > 0) doc.rect(barX, barY, barWidth, barH).fill(s.color);
    });
    doc.fontSize(7).fillColor(INK_MUTED).text(String(cat), groupX - 4, y + chartHeight + 4, { width: groupWidth, align: 'center' });
  });

  doc.moveTo(x, y + chartHeight).lineTo(x + width, y + chartHeight).strokeColor(LINE).stroke();

  let legendX = x;
  let legendY = y + chartHeight + 18;
  series.forEach((s) => {
    doc.rect(legendX, legendY + 1, 7, 7).fill(s.color);
    doc.fontSize(7).fillColor(INK_SECONDARY).text(s.label, legendX + 10, legendY, { width: 100 });
    legendX += 105;
    if (legendX > x + width - 90) { legendX = x; legendY += 12; }
  });

  return y + height + 6;
}

/**
 * A single-color horizontal bar chart for a label -> count breakdown,
 * mirroring the on-screen SimpleBarChart cards. Returns the y position
 * below the chart.
 */
function drawHorizontalBarChart(doc, { x, y, width, title, data, color, limit = 10 }) {
  if (title) {
    doc.fontSize(9).fillColor(INK_PRIMARY).text(title, x, y, { width });
    y += 14;
  }
  const rows = (data || []).slice(0, limit);
  if (!rows.length) {
    emptyNotice(doc, x, y, width);
    return y + 20;
  }

  const maxV = Math.max(...rows.map((r) => Number(r.count || 0)), 1);
  const labelWidth = 130;
  const barAreaWidth = width - labelWidth - 40;
  const rowHeight = 14;

  rows.forEach((r, i) => {
    const ry = y + i * rowHeight;
    doc.fontSize(8).fillColor(INK_PRIMARY).text(String(r.label ?? '—'), x, ry + 2, { width: labelWidth - 6 });
    const barW = (Number(r.count || 0) / maxV) * barAreaWidth;
    if (barW > 0) doc.rect(x + labelWidth, ry + 1, barW, rowHeight - 4).fill(color);
    doc.fontSize(8).fillColor(INK_SECONDARY).text(String(r.count ?? 0), x + labelWidth + barAreaWidth + 6, ry + 2, { width: 30 });
  });

  return y + rows.length * rowHeight + 6;
}

/**
 * A colored pie chart with a label + count legend to the right, mirroring
 * the on-screen "Work Orders by Location" chart. Returns the y position
 * below the chart.
 */
function drawPieChart(doc, { x, y, radius, data, colors, emptyText }) {
  const rows = data || [];
  const total = rows.reduce((sum, d) => sum + Number(d.count || 0), 0);
  const cx = x + radius;
  const cy = y + radius;

  if (!total) {
    emptyNotice(doc, x, y, radius * 2 + 160, emptyText);
    return y + 20;
  }

  let angle = -Math.PI / 2;
  rows.forEach((d, i) => {
    const frac = Number(d.count || 0) / total;
    const sweep = frac * Math.PI * 2;
    if (frac > 0) {
      const color = colors[i % colors.length];
      const steps = Math.max(2, Math.ceil(sweep / (Math.PI / 60)));
      doc.moveTo(cx, cy);
      for (let s = 0; s <= steps; s += 1) {
        const a = angle + (sweep * s) / steps;
        doc.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
      }
      doc.closePath();
      doc.fill(color);
    }
    angle += sweep;
  });

  let legendX = x + radius * 2 + 20;
  let legendY = y;
  rows.forEach((d, i) => {
    doc.rect(legendX, legendY + 2, 8, 8).fill(colors[i % colors.length]);
    doc.fontSize(9).fillColor(INK_PRIMARY).text(`${d.label} — ${d.count}`, legendX + 14, legendY, { width: 180 });
    legendY += 16;
  });

  return y + radius * 2 + 10;
}

module.exports = {
  METRIC_COLORS,
  LOCATION_COLORS,
  drawStatTiles,
  drawLineChart,
  drawGroupedBarChart,
  drawHorizontalBarChart,
  drawPieChart,
};

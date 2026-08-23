const PDFDocument = require('pdfkit');

const INK_PRIMARY = '#0b0b0b';
const INK_SECONDARY = '#52514e';
const INK_MUTED = '#898781';
const LINE = '#c3c2b7';

/**
 * Streams a simple, paginated table PDF straight to the response.
 * Column widths are split evenly across the page; row height is computed
 * from the tallest cell so wrapped text doesn't overlap the next row.
 */
function renderTablePdf(res, { filename, title, subtitle, columns, rows, landscape }) {
  const doc = new PDFDocument({ margin: 40, size: 'LETTER', layout: landscape ? 'landscape' : 'portrait' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom;
  const colWidth = (right - left) / columns.length;

  doc.fontSize(16).fillColor(INK_PRIMARY).text(title);
  if (subtitle) {
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor(INK_SECONDARY).text(subtitle);
  }
  doc.fontSize(8).fillColor(INK_MUTED).text(`Generated ${new Date().toLocaleString()}`);
  doc.moveDown(0.6);

  function drawHeaderRow() {
    const y = doc.y;
    doc.fontSize(9).fillColor(INK_PRIMARY);
    columns.forEach((col, i) => {
      doc.text(col.label, left + i * colWidth, y, { width: colWidth - 6 });
    });
    doc.y = y + 14;
    doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(LINE).stroke();
    doc.moveDown(0.3);
  }

  drawHeaderRow();

  if (!rows.length) {
    doc.fontSize(9).fillColor(INK_MUTED).text('No records match the selected filters.', left, doc.y);
  }

  for (const row of rows) {
    const cellTexts = columns.map((col) => String(row[col.key] ?? '—'));
    const rowHeight = Math.max(...cellTexts.map((text) => doc.heightOfString(text, { width: colWidth - 6, fontSize: 8 })), 12);

    if (doc.y + rowHeight + 6 > bottom) {
      doc.addPage();
      drawHeaderRow();
    }

    const y = doc.y;
    doc.fontSize(8).fillColor(INK_PRIMARY);
    cellTexts.forEach((text, i) => {
      doc.text(text, left + i * colWidth, y, { width: colWidth - 6 });
    });
    doc.y = y + rowHeight + 6;
  }

  doc.end();
}

module.exports = { renderTablePdf, INK_PRIMARY, INK_SECONDARY, INK_MUTED, LINE };

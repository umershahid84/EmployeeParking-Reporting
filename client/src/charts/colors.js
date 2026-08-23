// Reference categorical palette (light mode) from the dataviz skill's
// validated default - fixed hue order, never cycled or reassigned per-chart.
export const CATEGORICAL = {
  blue: '#2a78d6',
  orange: '#eb6834',
  aqua: '#1baf7a',
  yellow: '#eda100',
  magenta: '#e87ba4',
  green: '#008300',
  violet: '#4a3aa7',
  red: '#e34948',
};

// One fixed color per metric, reused across every chart so the same metric
// always reads as the same series identity (never reassigned by rank/filter).
export const METRIC_COLORS = {
  callouts: CATEGORICAL.blue,
  ot: CATEGORICAL.orange,
  moved: CATEGORICAL.aqua,
  uncovered: CATEGORICAL.red,
  workOrders: CATEGORICAL.violet,
  incomingSupervisors: CATEGORICAL.magenta,
};

export const METRIC_LABELS = {
  callouts: 'Driver Call-Outs',
  ot: 'Shift Covered with OT',
  moved: 'Moved from Another Shuttle',
  uncovered: 'Shift Not Covered (Bus Issue)',
  workOrders: 'Work Orders',
  incomingSupervisors: 'Incoming Supervisor Handoffs',
};

export const CHART_INK = {
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  surface: '#fcfcfb',
};

export const LOCATION_COLORS = [CATEGORICAL.blue, CATEGORICAL.aqua, CATEGORICAL.yellow];

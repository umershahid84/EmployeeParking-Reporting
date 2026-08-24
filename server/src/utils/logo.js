const fs = require('fs');
const path = require('path');

// The Port of Seattle logo, used in PDF exports and the report-submission
// email. pdfkit and most email clients only support raster images, so this
// is a PNG rasterized from client/public/port-of-seattle-logo.svg (the
// client renders the crisp SVG directly; the server needs this raster copy).
const LOGO_PATH = path.resolve(__dirname, '..', 'assets', 'port-of-seattle-logo.png');

function logoExists() {
  return fs.existsSync(LOGO_PATH);
}

module.exports = { LOGO_PATH, logoExists };

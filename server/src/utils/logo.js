const fs = require('fs');
const path = require('path');

// The Port of Seattle logo, used in PDF exports and the report-submission
// email. Same file as client/public/port-of-seattle-logo.png (duplicated
// since the client and server are served/deployed independently).
const LOGO_PATH = path.resolve(__dirname, '..', 'assets', 'port-of-seattle-logo.png');

function logoExists() {
  return fs.existsSync(LOGO_PATH);
}

module.exports = { LOGO_PATH, logoExists };

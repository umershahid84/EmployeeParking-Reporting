require('./config/env');
const app = require('./app');

const port = process.env.PORT || 4000;
// Binds to every network interface (not just localhost) by default, so the
// app is reachable at the server's LAN/public IP - set HOST in .env to pin
// it to one specific interface instead.
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  console.log(`Employee Parking Reporting API listening on ${host}:${port}`);
});

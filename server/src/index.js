require('./config/env');
const app = require('./app');
const { scheduleWeeklyReport } = require('./jobs/weeklyReport');

// APP_URL is stamped into every link the app emails out (account setup,
// password reset, "view this report"). If it's plain http:// against a
// real host in production, those links will look broken/insecure to
// users even though the app itself works fine - this is easy to miss
// since nothing else about the app fails, so warn loudly at startup.
if (process.env.NODE_ENV === 'production' && process.env.APP_URL) {
  try {
    const url = new URL(process.env.APP_URL);
    const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol === 'http:' && !isLocal) {
      console.warn(
        `WARNING: APP_URL="${process.env.APP_URL}" uses http:// in production. ` +
        'Emailed links (account setup, password reset, "view report") will use ' +
        'this same scheme - if users actually reach this app over https://, set ' +
        'APP_URL to https:// as well so those links match.'
      );
    }
  } catch {
    console.warn(`WARNING: APP_URL="${process.env.APP_URL}" is not a valid URL.`);
  }
}

const port = process.env.PORT || 4000;
// Binds to every network interface (not just localhost) by default, so the
// app is reachable at the server's LAN/public IP - set HOST in .env to pin
// it to one specific interface instead.
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  console.log(`Employee Parking Reporting API listening on ${host}:${port}`);
  scheduleWeeklyReport();
});

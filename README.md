# Employee Parking Daily Reporting Application

A web application for Employee Parking Supervisors to document daily
operational activities — incoming supervisor handoff, driver call-outs,
shift coverage, work orders, and shift notes — across the four Employee
Parking shifts (Day, Swing, Graveyard, Bridge). Managers and Administrators
review reports, leave comments, and manage users, drivers, shuttles, and
the email notification distribution list.

This is packaged as **one application**: the Express API serves the built
React client itself, so there's a single install, a single build, and a
single start command — no separate frontend/backend processes.

## Stack

- **Backend:** Node.js / Express, MariaDB (via `mysql2`), JWT auth, bcrypt password hashing, nodemailer for password-reset email.
- **Frontend:** React (Vite), React Router, Recharts (Analytics dashboard) — built to static assets and served by the backend.

## Project layout

```
package.json     root workspace - install/build/start orchestrate both sides
server/          Express API, MariaDB schema/scripts, and (in production) serves client/dist
client/          React (Vite) single-page app
deploy/          systemd unit + deployment instructions
```

## Configuration

Copy `.env.example` to `.env` at the repo root and fill in real values:

```bash
cp .env.example .env
```

This single `.env` file configures the database, email, and authentication
settings — see the comments in `.env.example` for every variable. It's
loaded by `server/src/config/env.js`, which resolves the repo root
regardless of the process's working directory, so it works the same way
whether you run `npm start`, a systemd service, or the `migrate`/`seed:admin`
scripts directly.

`.env` is gitignored — never commit real secrets. Generate a strong
`JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Follow these steps to copy into /opt/epreport/ folder for the application to run on VPN using apache
```bash
sudo systemctl stop epreport
sudo cp -r /home/umer/epreport/. /opt/epreport/   # (or the rsync version above)
sudo chown -R epreport:epreport /opt/epreport
cd /opt/epreport
sudo -u epreport npm install
sudo -u epreport npm run migrate
sudo -u epreport npm run build
sudo systemctl restart epreport
sudo systemctl status epreport --no-pager

### Making the app reachable on the network, not just localhost

The app listens on `HOST` (default `0.0.0.0`, i.e. every network interface)
and `PORT` (default `4000`), so once it's started it's already reachable at
the server's own address — e.g. `http://10.78.4.13:4000` — from any other
machine on the network, not just `localhost` on the server itself. If it's
still not reachable, check the server's firewall (`ufw`/`firewalld`/security
group) allows inbound traffic on `PORT`.

Separately, set `APP_URL` in `.env` to that same real address (e.g.
`APP_URL=http://10.78.4.13:4000`). This is **not** about network binding —
it's the URL the app stamps into links it emails out (account setup links,
"view this report" links). Leaving `APP_URL` at its default
`http://localhost:4000` means every emailed link resolves to "localhost" on
whatever computer opens the email, not your server, so those links will
never work for anyone. Restart the app after changing `HOST`, `PORT`, or
`APP_URL`.

### Reverse proxy under a sub-path (Apache)

To make the app available through an existing Apache server (e.g. a VPN
portal) at a sub-path like `https://vpn.example.com/epreport` instead of
its own dedicated port, three settings in `.env` all need to be set
together — **all three, every time**, not just `BASE_PATH`:

```bash
BASE_PATH=/epreport
APP_URL=https://vpn.example.com/epreport
TRUST_PROXY=1
```

- **`BASE_PATH`** is baked into the built client (asset URLs, client-side
  routing) and read by the server at startup to mount the whole app —
  static files and every `/api/*` route — under that same prefix, so both
  sides agree on where the app lives. **Rebuild after changing it** — it's
  compiled into the JS/HTML, not read at runtime:
  ```bash
  npm run build
  sudo systemctl restart epreport
  ```
- **`APP_URL`** must be the exact address a real user's browser uses to
  reach the app — same scheme (`http` vs `https`), same host, same
  sub-path. This is what gets stamped into every link the app emails out
  (account setup, password reset, "view this report"). Get any part of
  it wrong and the app will otherwise seem to work fine (you can browse
  it), while every emailed link silently 404s or times out for
  everyone — see the troubleshooting checklist below, this is the single
  most common thing to get wrong in this whole setup.
- **`TRUST_PROXY=1`** tells Express to trust the `X-Forwarded-For` header
  Apache adds. **This one is not optional and not just cosmetic:**
  without it, `express-rate-limit` (used on login/password-reset)
  throws inside an unhandled async rejection the moment a proxied
  request hits a rate-limited endpoint, which **crashes the entire
  Node process**, not just that request — systemd then restarts it a
  few seconds later, so the app appears to be randomly, intermittently
  unreachable. If you only remember one thing from this section, make
  it this one.

On the Apache side, enable the proxy modules if they aren't already
(`sudo a2enmod proxy proxy_http` on Debian/Ubuntu, or the equivalent
`LoadModule proxy_module` / `proxy_http_module` lines on other
distributions, already on by default on many RHEL/Rocky installs), then
add this to the relevant `<VirtualHost>` block:

```apache
ProxyPass /epreport/ "http://10.78.4.13:9000/epreport/"
ProxyPassReverse /epreport/ "http://10.78.4.13:9000/epreport/"
```

Substitute the app server's real address and port. **Critically: figure
out which machine actually terminates the connection your users'
browsers make** — on a VPN, that is very often a *different box* from
the one running this app (e.g. users hit `vpn.example.com`, which is a
separate gateway/reverse-proxy machine that then forwards to the app
server's internal IP). If so, this `ProxyPass` block belongs in *that*
gateway machine's Apache config, not the app server's — adding it to the
wrong machine's config is a real trap: the app will still be reachable
by IP:port directly, giving no obvious sign that the actual public entry
point was never configured at all.

Reload Apache (`sudo systemctl reload apache2` / `httpd`) after adding
this — always run `apachectl configtest` first and confirm "Syntax OK"
before reloading; a config with a mistake in it just keeps the last-known-good
config running silently, which looks identical to "my change didn't do
anything." The app itself keeps listening on `HOST`/`PORT` as before —
Apache is simply forwarding requests to it; the app does not need to
handle TLS itself, since Apache/the gateway terminates that.

To go back to serving from the domain root, remove (or comment out)
`BASE_PATH`, `APP_URL`'s sub-path, and `TRUST_PROXY` in `.env`, rebuild,
and restart.

#### Troubleshooting checklist

Work through these in order — each rules out one layer before moving to
the next:

1. **Is the app itself even running?**
   ```bash
   sudo systemctl status epreport --no-pager
   sudo journalctl -u epreport -n 50 --no-pager
   ```
   Look for a crash loop (`Scheduled restart job, restart counter is at N`
   climbing) — if you see `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` in the log,
   that's the `TRUST_PROXY` issue above; add it and restart before
   anything else.

2. **Does `systemd`'s service file actually point at where your code
   lives?** A generic "Failed to load environment files: No such file or
   directory" / "resources" failure almost always means
   `WorkingDirectory`/`EnvironmentFile`/`User` in
   `/etc/systemd/system/epreport.service` don't match your real deploy
   path:
   ```bash
   cat /etc/systemd/system/epreport.service | grep -E 'WorkingDirectory|EnvironmentFile|User='
   ls -la <that WorkingDirectory>/.env
   ```
   **Keep exactly one canonical deployment directory.** If you copy the
   app to a second location while debugging (e.g. from `/home/you/app` to
   `/opt/epreport`) and keep editing the original, the two will silently
   drift apart — systemd will keep running the stale copy's `.env` and
   build while you keep changing the one that isn't actually live. Pick
   one path, update the service file to match it, and only ever edit
   `.env`/rebuild there.

3. **On SELinux-enforcing distros (Rocky/RHEL/CentOS/Fedora), avoid
   deploying under a user's home directory.** systemd services run in
   the `init_t` domain, which the default targeted policy does not allow
   to read files labeled `user_home_t` (i.e. anything under `/home/*`),
   regardless of Unix file permissions looking correct. This surfaces as
   the same generic "resources"/"No such file or directory" failure as
   above even when the path and permissions are actually right. Check:
   ```bash
   getenforce
   sudo ausearch -m avc -ts recent   # look for "denied" lines naming your .env or app path
   ```
   If you see `avc: denied` referencing your app's path: either move the
   deployment to `/opt/epreport` (matches the default service file and
   the policy's expectations — the simplest fix), or relabel the path
   you want to keep using:
   ```bash
   sudo semanage fcontext -a -t bin_t "/home/you/epreport(/.*)?"
   sudo restorecon -Rv /home/you/epreport
   ```

4. **Confirm the built assets actually have `BASE_PATH` baked in** — a
   stale build (from before `BASE_PATH` was set, or a rebuild that ran
   against the wrong copy per #2 above) serves a blank page, because the
   HTML references `/assets/...` instead of `/epreport/assets/...`, and
   nothing outside `/epreport/*` is proxied:
   ```bash
   grep -o 'src="[^"]*"' <WorkingDirectory>/client/dist/index.html
   ```
   Should show `/epreport/assets/...`, not `/assets/...`. If it doesn't,
   `BASE_PATH` wasn't set in `.env` *at the time you last ran*
   `npm run build` in that directory — fix `.env` and rebuild again.

5. **Test each hop separately, from the right machine, with the right
   scheme** — the most common mistake in this whole checklist is testing
   the wrong thing and drawing the wrong conclusion from it:
   ```bash
   # From the app server itself - confirms the app/BASE_PATH/systemd side:
   curl -s http://localhost:<PORT>/epreport/api/health

   # From a workstation on the actual client network - confirms the
   # proxy/gateway side. Use the SAME scheme (http/https) your users'
   # browsers actually use - browsers silently upgrade http-to-https via
   # HSTS/redirects often enough that "it works in my browser" doesn't
   # prove the http:// URL you emailed actually resolves to anything:
   curl -v https://vpn.example.com/epreport/api/health
   ```
   Both should return `{"ok":true}`. `curl`ing the gateway's address
   *from the app server itself* usually proves nothing (`No route to
   host` there is often just normal network segmentation between the
   two boxes) - always test the gateway from a client machine.

6. **Does `APP_URL` exactly match what #5 just proved works?** Whatever
   URL/scheme you confirmed reaches the app from a real client machine in
   step 5 is what `APP_URL` must be, byte for byte (`http` vs `https`
   included). Mismatch here is invisible until someone clicks an emailed
   link and it hangs or 404s — the app itself works fine the whole time,
   which is what makes this particular bug so easy to miss:
   ```bash
   grep '^APP_URL' .env
   sudo systemctl restart epreport   # runtime setting - no rebuild needed
   ```

### Database name

`DB_NAME` in `.env` sets the MariaDB database the app uses — it defaults to
`epreport` in `.env.example`. `npm run migrate` creates this database
automatically (via `CREATE DATABASE IF NOT EXISTS`) and applies the schema
to it, so you don't need to create it by hand first; just make sure
`DB_USER` has permission to create databases, or pre-create `epreport`
yourself and grant that user access to it.

## Getting started (single application)

```bash
npm install        # installs both server and client dependencies (npm workspaces)
npm run migrate     # creates the database and applies the schema
npm run seed:admin  # creates the first administrator account
npm run build       # builds the React client into client/dist
npm start           # starts the Express API, which also serves the built client
```

That's it — one process serves both the API (under `/api/*`) and the web
app, on the port set by `PORT` in `.env` (default `4000`).

`npm run seed:admin` reads `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` /
`SEED_ADMIN_NAME` from `.env` (defaults shown in `.env.example`). Change the
password immediately after first login.

### Seeding sample daily reports

For local development or demoing the Analytics dashboard with realistic
volume, `npm run seed:reports` generates random Daily Reports (submitted,
with call-outs, shift coverage, work orders, and incoming supervisors):

```bash
npm run seed:reports          # seeds 100 random reports (the default)
npm run seed:reports -- 250   # or pass a count
```

It creates whatever sample supervisors, drivers, and shuttles are needed to
support that volume (reusing what already exists instead of duplicating
it), spreads the reports over the last 90 days, and is safe to run more
than once — each run only adds new reports, it never touches existing data.
Not intended for production use.

### Local development

If you'd rather run the Vite dev server (hot reload) alongside the API
while developing, use:

```bash
npm run dev
```

This runs both `server` (nodemon) and `client` (vite) concurrently, with
the Vite dev server proxying `/api` requests to the backend. This is purely
a development convenience — it is not how the app runs in production.

## Roles

- **Supervisor** — creates, drafts, and submits Daily Reports; views all
  reports; can only edit reports they personally submitted.
- **Manager** — views/searches/filters all reports, adds comments, views
  the Analytics dashboard. Cannot create or submit Daily Reports.
- **Administrator** — all Manager permissions, plus user/driver/shuttle
  management, the email notification distribution list, and audit log
  access. **Cannot create or submit Daily Reports either** — Daily Reports
  are an operational Supervisor function. An Administrator can still open
  and correct an existing (already-submitted) report, but cannot create a
  new one or push a draft to "submitted"; both restrictions are enforced
  server-side (`POST /api/reports` requires the `supervisor` role exactly,
  and `PUT /api/reports/:id` rejects a draft→submitted transition from an
  Administrator), not just hidden in the UI.

Report edit permission is enforced server-side: a supervisor can only edit
a report they personally submitted (administrators can edit any report,
subject to the submit restriction above). Every edit is appended to an
immutable report history; deactivated drivers and shuttles remain visible
on historical reports but drop out of new-entry dropdowns.

## Daily report sections

- **Incoming Supervisor(s)** — multi-select from active Supervisor accounts.
- **Driver Call-Outs** — shuttle/bus, driver, comments; add/remove rows.
- **Shift Coverage** — one of three types per entry, with fields that adapt
  to the selection: *Shift Covered with OT* (shuttle, driver, comments),
  *Moved from Another Shuttle* (shuttle, driver, original shuttle,
  comments), or *Shift Not Covered for Bus Issues* (affected shuttle,
  comments — no driver). Multiple entries per report.
- **Work Order Placed** — location (`LOT - A`, `LOT - C`, or
  `North Employee Parking Lot`) plus comments; date/time and the entering
  supervisor are recorded automatically. Multiple entries per report.
- Bus issues, significant shift activity, and additional notes remain
  free-text fields.

Every one of these — incoming supervisors, call-outs, shift coverage, and
work orders — is versioned in the report's history alongside who changed it
and when.

## Email notifications

The app sends three kinds of email, all through the SMTP relay configured
in `.env` (`EMAIL_*`), and all recorded in the `email_log` table (status
`sent`/`failed`/`skipped`) as a permanent audit trail:

1. **New account created** — when a Manager/Administrator creates a user
   (or triggers **Reset Account**), the app never emails a plain-text
   password. Instead it emails a one-time secure link
   (`/setup-password?...`, valid for `ACCOUNT_SETUP_TOKEN_TTL_HOURS`,
   default 48h) that lets the user set their own password.
2. **Password reset** — the existing 6-digit forgot-password code.
3. **Daily report submitted** — when a Supervisor submits a report (on
   initial submit, not on later edits), every **active** address in the
   Admin Portal's **Email Notifications** distribution list receives a
   summary (report ID, date, shift, submitting/incoming supervisors) with a
   link to the report. Administrators manage that list — add, edit, remove,
   enable/disable — entirely through the UI; nothing is hard-coded, so no
   code change or redeploy is needed to change who gets notified.

Set `SEND_EMAILS=false` to disable outbound mail entirely — every email is
logged instead of sent (still recorded in `email_log` with status
`skipped`), so no mail server is required for local development.

**Troubleshooting `certificate has expired` / `ESOCKET`:** Nodemailer tries
STARTTLS opportunistically whenever the mail relay advertises it, even with
`EMAIL_SECURE=false` — so a relay with an expired or self-signed certificate
(common for an internal-only relay) fails to connect. Set
`EMAIL_IGNORE_TLS=true` in `.env` to skip TLS entirely (plaintext, fine for
a trusted internal network), or `EMAIL_TLS_REJECT_UNAUTHORIZED=false` to
keep opportunistic TLS but stop validating the certificate. Restart the app
after changing either.

## Analytics & Trends dashboard

Available to Managers and Administrators (`/analytics`, gated server-side by
`GET /api/analytics` requiring `manager` role or above) — not Supervisors.
Every chart is computed live from MariaDB (no manually-maintained numbers),
so submitting or editing a Daily Report is immediately reflected the next
time the dashboard is loaded or a filter changes.

- **Filters** (combine together, and every chart updates from one request
  when any of them changes): date (Today / Yesterday / Last 7, 30, 90 Days /
  This Month / Previous Month / Custom Range), Supervisor (multi-select, or
  All), Shift (multi-select, or All), Driver, Shuttle/Bus.
- **Overview** — stat tiles: total reports, call-outs, OT coverage, driver
  movements, uncovered shifts, work orders.
- **Trends** — one line chart per metric over the selected date range
  (call-outs, OT coverage, driver movements, bus issues, work orders,
  incoming supervisor handoffs).
- **Comparisons** — grouped bar charts across all five metrics **by Shift**
  and **by Supervisor** (select two supervisors to directly compare them —
  the "All Supervisors" default just shows every supervisor with activity
  in range), plus top-shuttle and top-driver breakdowns, and a work-orders-
  by-location pie chart.
- **Detailed Analysis** — a Driver Movement Details table (driver, from/to
  shuttle, date, shift, supervisor, comments) and a Bus Issue Details table,
  each row linking to the underlying report.
- **Drill-down** — clicking a trend point or a comparison bar navigates to
  **All Reports** pre-filtered to that date/supervisor/shift/shuttle/driver.

## Export & Print

Both **All Reports** and **Analytics & Trends** have **Export CSV**,
**Export PDF**, and **Print** buttons that respect whatever filters are
currently applied.

- **Export CSV** — `GET /api/reports/export.csv` (report list) and
  `GET /api/analytics/export.csv` (per-report metric counts) stream a CSV
  built from the same filtered query as the on-screen data.
- **Export PDF** — `GET /api/reports/export.pdf` renders the filtered report
  list as a paginated table; `GET /api/analytics/export.pdf` mirrors every
  section of the on-screen dashboard in the same order - the colored KPI
  tiles, trend line charts, by-shift/by-supervisor comparison bar charts,
  shuttle/driver/location breakdown charts, the work-orders-by-location pie
  chart, and the Driver Movement / Bus Issue detailed-analysis tables -
  using the same color per metric as the dashboard, so **Export PDF** and
  **Print** always produce the same report. Both are generated server-side
  with `pdfkit` drawing vector shapes directly
  (`server/src/utils/pdfCharts.js`) — no
  headless browser dependency.
- **Print** — a plain `window.print()` using a print stylesheet that hides
  navigation, filter controls, and action buttons, leaving just the table
  (Reports) or the stat tiles/charts/tables (Analytics).

All three actions honor the exact filters selected at the time — e.g. Date:
August 1–22, Shift: Graveyard, Supervisor: Supervisor A produces an export
containing only that data. Excel export is not implemented — CSV opens
directly in Excel and covers the same filtered data in the meantime.

## Password reset

`Forgot Password?` on the login page sends a 6-digit code via the SMTP
relay configured in `.env` (`EMAIL_*`). It expires after
`PASSWORD_RESET_CODE_TTL_MINUTES` minutes, can only be used once, and is
rate-limited against brute-force attempts.

## Branding

The app uses a dark navy color scheme (`client/src/styles.css`, all CSS
custom properties on `:root`) with the official Port of Seattle logo in the
header on every page, on the login/password-reset pages, and on
printed/PDF/emailed reports.

The logo ships in two forms, since the web app and the server-generated
PDF/email output have different needs:

```
client/public/port-of-seattle-logo.svg     # web app - crisp vector, any size
server/src/assets/port-of-seattle-logo.svg # source copy, kept for reference/re-rasterizing
server/src/assets/port-of-seattle-logo.png # PDF export + email attachment (pdfkit and email clients need raster)
```

If the logo is ever replaced, update the `.svg` at both locations, then
regenerate the `.png` from it (any SVG-to-PNG tool works — a transparent
background at a few hundred pixels wide is plenty for the PDF/email use).
If either server-side file is ever missing, the app falls back gracefully:
PDF exports simply omit the logo and the email uses no attachment — nothing
breaks. The client falls back to a plain "PORT OF SEATTLE" text badge if its
SVG is missing. Once the files are in place, `npm run build` + restart picks
them up everywhere automatically: header, auth pages, browser print output,
PDF exports (`GET /api/reports/export.pdf`, `GET /api/analytics/export.pdf`),
and the daily-report-submission email.

Printing (`window.print()` / "Save as PDF" from the browser) always
renders on a light background regardless of the app's dark on-screen
theme — the print stylesheet re-pins every color token to a light palette
so printed pages stay readable and professional rather than inverting the
dark theme onto paper.

The internal database Report ID is never shown in the UI, printed reports,
PDF exports, or emails — reports are identified to users by date, shift,
and supervisor instead. It's still used internally for routing, database
relationships, and audit history.

## Running continuously as a Linux service (systemd)

See [`deploy/README.md`](deploy/README.md) for full instructions. Summary:

```bash
sudo cp deploy/epreport.service /etc/systemd/system/epreport.service
sudo systemctl daemon-reload
sudo systemctl enable epreport
sudo systemctl start epreport
```

Then manage it with the standard commands:

```bash
sudo systemctl start epreport
sudo systemctl stop epreport
sudo systemctl restart epreport
sudo systemctl status epreport
sudo journalctl -u epreport
sudo journalctl -u epreport -f
```

The service runs under a dedicated non-root `epreport` system account,
restarts automatically on crash (5s delay), starts on boot once enabled,
and logs to the systemd journal.

## Notes on scope

This build covers the core workflow end-to-end (auth, RBAC, daily reports
with incoming supervisors/call-outs/shift coverage/work orders, edit
history, manager comments, admin management of users/drivers/shuttles/email
recipients, audit logging, password reset, account setup and report
submission email notifications, and a live Analytics/Trends dashboard with
filtering, drill-down, and CSV/PDF export/print). The architecture is
modular (separate route/table per concern) so future sections —
equipment/vehicle inspections, incident reporting, Excel export, scheduled
email digests, etc. — can be added without restructuring what's here.

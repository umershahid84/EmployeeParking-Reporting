# Employee Parking Daily Reporting Application

A web application for Employee Parking Supervisors to document daily
operational activities — driver call-outs, shift coverage, bus issues, work
orders, and shift notes — across the four Employee Parking shifts (Day,
Swing, Graveyard, Bridge). Managers and Administrators review reports,
leave comments, and manage users, drivers, and shuttles.

This is packaged as **one application**: the Express API serves the built
React client itself, so there's a single install, a single build, and a
single start command — no separate frontend/backend processes.

## Stack

- **Backend:** Node.js / Express, MariaDB (via `mysql2`), JWT auth, bcrypt password hashing, nodemailer for password-reset email.
- **Frontend:** React (Vite), React Router — built to static assets and served by the backend.

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

- **Supervisor** — creates/edits their own daily reports, views all reports.
- **Manager** — views all reports, filters/searches, adds comments.
- **Administrator** — all Manager permissions, plus user/driver/shuttle
  management and audit log access.

Report edit permission is enforced server-side: a supervisor can only edit
a report they personally submitted (administrators can edit any report).
Every edit is appended to an immutable report history; deactivated drivers
and shuttles remain visible on historical reports but drop out of new-entry
dropdowns.

## Password reset

`Forgot Password?` on the login page sends a 6-digit code via the SMTP
relay configured in `.env` (`EMAIL_*`). It expires after
`PASSWORD_RESET_CODE_TTL_MINUTES` minutes, can only be used once, and is
rate-limited against brute-force attempts. Set `SEND_EMAILS=false` to
disable outbound mail entirely (the code is written to the application log
instead) — no separate mail server process is required either way.

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
with call-outs/shift-fills, edit history, manager comments, admin
management of users/drivers/shuttles, audit logging, password reset). The
architecture is modular (separate route/table per concern) so future
sections — equipment/vehicle inspections, incident reporting, exports,
dashboard charts, etc. — can be added without restructuring what's here.

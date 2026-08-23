# Employee Parking Daily Reporting Application

A web application for Employee Parking Supervisors to document daily
operational activities — driver call-outs, shift coverage, bus issues, work
orders, and shift notes — across the four Employee Parking shifts (Day,
Swing, Graveyard, Bridge). Managers and Administrators review reports,
leave comments, and manage users, drivers, and shuttles.

## Stack

- **Backend:** Node.js / Express, MariaDB (via `mysql2`), JWT auth, bcrypt password hashing, nodemailer for password-reset email.
- **Frontend:** React (Vite), React Router.

## Project layout

```
server/   Express API + MariaDB schema and scripts
client/   React (Vite) single-page app
```

## Getting started

### 1. Database

Create a MariaDB user/database and apply the schema:

```bash
cd server
cp .env.example .env   # fill in DB credentials, JWT secret, SMTP settings
npm install
npm run migrate         # applies server/src/db/schema.sql
npm run seed:admin      # creates the first administrator account
```

`npm run seed:admin` reads `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` /
`SEED_ADMIN_NAME` from the environment (falls back to
`admin@example.com` / `ChangeMe123!`). Change the password immediately
after first login.

### 2. Backend API

```bash
cd server
npm run dev      # nodemon, http://localhost:4000
```

### 3. Frontend

```bash
cd client
npm install
npm run dev       # http://localhost:5173, proxies /api to the backend
```

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

`Forgot Password?` on the login page sends a 6-digit code (via SMTP,
configured in `server/.env`) that expires after
`PASSWORD_RESET_CODE_TTL_MINUTES` minutes, can only be used once, and is
rate-limited against brute-force attempts.

## Notes on scope

This build covers the core workflow end-to-end (auth, RBAC, daily reports
with call-outs/shift-fills, edit history, manager comments, admin
management of users/drivers/shuttles, audit logging, password reset). The
architecture is modular (separate route/table per concern) so future
sections — equipment/vehicle inspections, incident reporting, exports,
dashboard charts, etc. — can be added without restructuring what's here.

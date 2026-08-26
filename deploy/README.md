# Deploying `epreport` as a systemd service

These steps assume a Linux host with Node.js and MariaDB already installed,
and that you're deploying the app to `/opt/epreport` (adjust paths in
`epreport.service` if you use a different location).

**Deploy to exactly one directory and never move it later.** Copying the
app to a second location partway through setup (e.g. from your home
directory to `/opt/epreport` while troubleshooting) is the single most
common source of confusing, hard-to-diagnose failures: the two copies
silently drift apart (different `.env`, different build), and whichever
one `systemd`'s `WorkingDirectory`/`EnvironmentFile` actually points at
is the one that's live — not necessarily the one you're still editing.
If you do need to relocate, update `epreport.service` immediately and
delete the old copy so there's no ambiguity about which is real.

**On SELinux-enforcing distros (Rocky/RHEL/CentOS/Fedora — check with
`getenforce`), deploy under `/opt`, not a user's home directory.**
systemd services run in a domain that the default policy does not allow
to read files under `/home/*` (labeled `user_home_t`), regardless of
correct Unix permissions — this fails with a generic
"resources"/"No such file or directory" error that looks identical to a
wrong path or a missing `.env`. `/opt/epreport` (as used throughout this
guide) avoids the issue entirely.

## 1. Get the code and build it

```bash
sudo mkdir -p /opt/epreport
sudo chown "$USER" /opt/epreport
git clone <your-repo-url> /opt/epreport
cd /opt/epreport

cp .env.example .env
# edit .env with real DB/EMAIL/JWT values - see the main README

npm install
npm run migrate       # creates the database and applies the schema
npm run seed:admin    # creates the first administrator account
npm run build          # builds the React client into client/dist
```

Confirm it runs manually first:

```bash
npm start
```

Visit the server's address in a browser, then Ctrl+C to stop it.

## 2. Create a dedicated service account

Running as root is avoided; the app runs as its own unprivileged user
instead.

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin epreport
sudo chown -R epreport:epreport /opt/epreport
```

## 3. Install the systemd unit

```bash
sudo cp deploy/epreport.service /etc/systemd/system/epreport.service
sudo systemctl daemon-reload
```

If you deployed to a path other than `/opt/epreport`, or want to run as a
different user, edit `/etc/systemd/system/epreport.service` (the
`WorkingDirectory`, `EnvironmentFile`, and `User` lines) before continuing.

## 4. Start it and enable it on boot

```bash
sudo systemctl enable epreport
sudo systemctl start epreport
sudo systemctl status epreport
```

## 5. Everyday management

```bash
sudo systemctl restart epreport      # after deploying a new build
sudo systemctl stop epreport
sudo journalctl -u epreport          # view logs
sudo journalctl -u epreport -f       # follow logs live
```

## Deploying an update

```bash
cd /opt/epreport
git pull
npm install
npm run migrate    # always run this - see note below
npm run build
sudo systemctl restart epreport
```

**Always run `npm run migrate` on every update, even if you don't think this
release touched the database.** The schema (`server/src/db/schema.sql`) is
applied with `CREATE TABLE IF NOT EXISTS`, which only creates tables that
don't exist yet - it does not alter a table that's already there. Any
column added or changed on an existing table (like `daily_reports`) ships
as an explicit, idempotent `ALTER TABLE ... ADD/DROP COLUMN IF [NOT]
EXISTS` alongside the `CREATE TABLE` statements, specifically so `npm run
migrate` stays safe to run on every deploy and brings an older database
fully up to date. Skipping it after a release that changed the schema will
surface as reports failing to save with a database column error.

## Deploying behind a VPN/reverse proxy (Apache, at a sub-path)

If the app needs to live at a sub-path like `/epreport` behind Apache
(e.g. a VPN portal) rather than its own dedicated port, see the main
README's ["Reverse proxy under a sub-path (Apache)"](../README.md#reverse-proxy-under-a-sub-path-apache)
section — it covers the three `.env` settings that all need to be set
together (`BASE_PATH`, `APP_URL`, `TRUST_PROXY`), the Apache config, and
a step-by-step troubleshooting checklist for exactly this kind of setup.

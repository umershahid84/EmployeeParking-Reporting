# Deploying `epreport` as a systemd service

These steps assume a Linux host with Node.js and MariaDB already installed,
and that you're deploying the app to `/opt/epreport` (adjust paths in
`epreport.service` if you use a different location).

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
npm run build
sudo systemctl restart epreport
```

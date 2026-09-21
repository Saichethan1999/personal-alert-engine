# BookMyShow → ntfy (Node.js)

This Node.js version checks the configured BookMyShow page on an interval and sends a priority-5 ntfy notification listing each theater's shows before 10:00 AM.

## Phone setup

1. Install the official ntfy app from Google Play.
2. Subscribe to a new, long, random topic such as `bms-toxic-2026-8fK29xQp91mL4zT8`.
3. Configure ntfy Android notification priority 5 to use sound and vibration.
4. Keep the app's notification permission enabled.

Public ntfy topic names are public identifiers. Use a long random topic and do not reuse it elsewhere.

## Laptop setup (PowerShell)

Node.js 22 or newer is required.

```powershell
Set-Location .\nodejs
nvs use v22
npm install
npm run install:browser
Copy-Item .env.example .env
```

Edit `.env` and put your chosen topic in `NTFY_TOPIC`. Update `BOOKMYSHOW_URL` whenever the movie, city, or date changes.

Leave `BROWSER_HEADLESS=false` if BookMyShow displays a Cloudflare or access-check page. The visible browser window lets you complete the site check manually.

## Run the unit tests

```powershell
npm test
```

The tests use mocks and do not contact BookMyShow or ntfy.

## Test the phone notification

```powershell
npm run test:notification
```

If the phone receives the message, the notification path works.

## Start monitoring

```powershell
npm start
```

The bot keeps sending the theater-wise morning show list on the configured interval. Keep the laptop awake, online, and the terminal running.

No AWS, Telegram, Twilio, Tasker, PWA, or custom Android APK is required. Do not disable TLS verification if a corporate network causes certificate errors; troubleshoot the corporate CA or network instead.
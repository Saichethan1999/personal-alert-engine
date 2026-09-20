# Personal Alert Engine v2

Two projects:
- `backend/`: Node.js + Playwright API. `/check` opens a supplied URL in Chromium and reports whether an enabled visible `Book tickets` control is present.
- `android/`: Android app with a foreground monitoring service. Every N minutes it calls the backend, receives JSON, and raises the alert locally when `bookTicketsVisible=true`.

The backend uses `HEADLESS=false` by default because the earlier BookMyShow headless mode was blocked. On Linux, use the included Dockerfile; it runs headed Chromium under Xvfb. This does not guarantee that a site will always permit automation; anti-bot behavior can change.

## Backend local

```powershell
cd backend
npm install
npx playwright install chromium
copy .env.example .env
npm start
```

Health:
```powershell
Invoke-RestMethod http://localhost:8787/health
```

Manual check:
```powershell
Invoke-RestMethod -Method Post http://localhost:8787/check -ContentType 'application/json' -Body '{"url":"https://in.bookmyshow.com/movies/warangal/toxic-a-fairy-tale-for-grown-ups/ET00378770"}'
```

If you set `CHECK_API_KEY`, the Android app must send the same bearer secret.

## Backend Docker

```powershell
cd backend
docker build -t personal-alert-backend .
docker run --rm -p 8787:8787 -e CHECK_API_KEY="your-secret" personal-alert-backend
```

For a public deployment use HTTPS and keep the API key secret. Do not disable TLS verification or expose an unauthenticated HTTP endpoint publicly.

## Android

Open `android/` in Android Studio and build:
`Build -> Build Bundle(s) / APK(s) -> Build APK(s)`

APK: `app/build/outputs/apk/debug/app-debug.apk`

No USB is required to build or to install the APK manually.

The app lets you enter backend URL, secret, target URL, and interval (minimum 15 minutes), then starts an Android foreground service. Android displays a persistent monitoring notification while it is running.

The first MVP uses the backend's `bookTicketsVisible` field as the condition. The next iteration can make the condition user-configurable and add multiple alerts/plugins.

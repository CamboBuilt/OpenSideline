# Install OpenSideline and score offline (v0.3 alpha)

OpenSideline includes a **Progressive Web App (PWA)** manifest, a lightweight install icon, and a service worker to cache the first-party scorer interface. It does not require a Supabase account to score locally.

## How to install

- **iPhone / iPad (Safari):** Open the deployed OpenSideline site while online. Use **Share → Add to Home Screen**, then launch it from the home screen.
- **Android (Chrome):** Open the site while online and use the browser's **Install app** or **Add to Home screen** option, if offered.
- **Desktop (supported browsers):** Look for the browser's install icon or app installation menu.

The installed web app uses the same browser storage origin as the regular site. It is not yet an App Store or Play Store native app.

## Offline checklist (use fictional games first)

1. Open OpenSideline with a working internet connection and **finish loading the scorer**.
2. Install the app / reopen once so the installed service worker can cache the app shell.
3. While still online, create a fictional game and export a JSON backup.
4. Enable airplane mode or disconnect internet.
5. Reopen the installed app and score a ball, strike, hit and out. Local browser storage should retain the updated game on refresh.
6. Reconnect internet and reopen. The latest first-party web code should be fetched on the next compatible service worker version, while the local journal remains on the device.

The service worker caches only OpenSideline's HTML, JavaScript modules, CSS, icon, and manifest. It does **not** cache team records, cloud API responses, auth tokens, or remote service URLs.

## Important limitations

- Offline availability depends on the browser successfully installing and caching the complete shell during an online visit; device storage restrictions can still evict cached assets or games.
- The scorer's **game data is in localStorage**, independent of the service worker cache. Clearing site data, deleting the web app, using private browsing or resetting the device can remove game records.
- The app does **not** yet have a background/offline cloud write queue. When offline, record plays locally and **explicitly save to cloud** after reconnecting. If another device changed the same cloud game, the server rejects the stale save.
- Signing out of cloud does not erase local game data. Take care on shared phones and tablets.
- During an in-progress game, app updates are not forced over the running scorer. Close and reopen to activate a new service worker when available.
- **Export JSON backups regularly**, especially before a new game, device change or clearing browser data.
- Full battery/device testing on mobile and live field use are still pending. Do not rely exclusively on this alpha for official game records.

For cloud setup and the required authorization tests, see [Cloud setup guide](CLOUD-SETUP.md).

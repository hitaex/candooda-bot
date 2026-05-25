Aternos Proxy Bot
=================

This module provides `AternosProxyBot` — a small automation helper that uses `puppeteer-real-browser` to control an Aternos server page. It is implemented to run inside the `candooda-bot` project under `src/features/minecraft`.

Setup
-----

1. Install dependencies (run in your project root):

```bash
npm install puppeteer-real-browser
```

Note: `puppeteer-real-browser` downloads its own Chromium. If you prefer a system Chromium, follow that package's docs.

2. Configure environment variables. Copy the example `.env` in `src/features/minecraft/.env` and set your credentials and options.

Usage
-----

Run the script directly:

```bash
node src/features/minecraft/aternos.js
```

Or import the class into another module:

```js
const { AternosProxyBot } = require('./src/features/minecraft/aternos');

const bot = new AternosProxyBot({ username, password, serverId, headless: true });
await bot.runFlow();
```

Behavior
--------
- Logs into Aternos using the provided credentials.
- Navigates to the specified server page and checks the server status.
- If the server is offline, it will attempt to start it, keep it online for `MC_KEEP_ONLINE_MIN` minutes, then stop it.
- Uses a proxy if `MC_USE_PROXY` is enabled. You can pass a JSON array via `MC_PROXIES_JSON` in the `.env` file to override the default proxy list.

Security
--------
- Avoid committing real credentials into version control. Use environment variables or a secrets manager in production.

Notes
-----
- This automation is fragile by nature; Aternos page structure or anti-bot measures (Cloudflare/Turnstile) can break the script.
- Adjust timeouts in the `.env` if you encounter frequent navigation timeouts.

'use strict';

// Aternos control utility using puppeteer-real-browser
// Loads configuration from .env in the same folder (see .env.example)

const path = require('path');
const fs = require('fs').promises;
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });

const { realBrowser } = require('puppeteer-real-browser');

const DEFAULT_PROXIES = [
  { ip: '94.97.22.170', port: 5678, protocol: 'socks5', country: 'Saudi Arabia', city: 'Jeddah' },
  { ip: '93.112.43.242', port: 5678, protocol: 'socks5', country: 'Saudi Arabia', city: 'Riyadh' },
  { ip: '31.167.220.106', port: 5678, protocol: 'socks5', country: 'Saudi Arabia', city: 'Jeddah' },
  { ip: '37.156.104.178', port: 3327, protocol: 'socks5', country: 'Iraq', city: 'Erbil' },
];

function parseBool(v, def = false) {
  if (v === undefined || v === null) return def;
  return String(v).toLowerCase() === 'true';
}

function parseIntEnv(v, def) {
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
}

function loadProxies() {
  const env = process.env.MC_PROXIES_JSON;
  if (!env) return DEFAULT_PROXIES;
  try {
    const parsed = JSON.parse(env);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch (e) {
    // fall through to default on parse error
  }
  return DEFAULT_PROXIES;
}

class AternosProxyBot {
  constructor({ username, password, serverId, headless = true, keepOnlineMin = 2, maxRetries = 3, useProxy = true }) {
    this.username = username;
    this.password = password;
    this.serverId = serverId;
    this.browser = null;
    this.page = null;

    this.proxies = loadProxies();
    this.currentProxy = null;

    this.headless = headless;
    this.keepOnlineMin = keepOnlineMin;
    this.maxRetries = maxRetries;
    this.useProxy = useProxy;
  }

  getRandomProxy() {
    if (!this.proxies || !this.proxies.length) return null;
    return this.proxies[Math.floor(Math.random() * this.proxies.length)];
  }

  getProxyString(proxy) {
    if (!proxy) return null;
    // Normalize protocol names
    let proto = (proxy.protocol || '').toLowerCase();
    if (proto === 'socks4' || proto === 'socks5' || proto === 'socks') proto = proto.replace(/^socks(?!5)/, 'socks5');
    if (!proto) proto = 'socks5';
    return `${proto}://${proxy.ip}:${proxy.port}`;
  }

  async init(useProxy = this.useProxy) {
    console.log('[minecraft] Initializing browser...');

    let proxyUrl = null;
    if (useProxy) {
      this.currentProxy = this.getRandomProxy();
      if (this.currentProxy) {
        proxyUrl = this.getProxyString(this.currentProxy);
        console.log(`[minecraft] Selected proxy: ${this.currentProxy.country}/${this.currentProxy.city} - ${proxyUrl}`);
      }
    }

    const headless = this.headless;

    // Build launch options — pass proxy via --proxy-server when available
    const launchOptions = {
      headless: headless ? 'new' : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    };

    if (proxyUrl) launchOptions.args.push(`--proxy-server=${proxyUrl}`);

    // puppeteer-real-browser wraps puppeteer and applies stealth/fingerprint features
    const rbOptions = {
      launch: launchOptions,
      fingerprint: true,
      // turnstile support improves Cloudflare handling if available in the library
      turnstile: true,
    };

    const { browser, page } = await realBrowser(rbOptions);
    this.browser = browser;
    this.page = page;

    await this.page.setViewport({ width: 1920, height: 1080 });
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': process.env.MC_ACCEPT_LANG || 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
    });

    console.log('[minecraft] Browser initialized');
  }

  async login() {
    if (!this.page) throw new Error('Browser not initialized');
    console.log('[minecraft] Navigating to Aternos login');

    await this.page.goto('https://aternos.org/go/', { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});

    // Wait a short while to let Cloudflare/turnstile settle
    await this.page.waitForTimeout(3000);

    // Wait for the login form
    await this.page.waitForSelector('#user, input[name="user"]', { timeout: 15000 });

    // Fill credentials
    await this.page.focus('#user, input[name="user"]');
    await this.page.keyboard.type(this.username, { delay: 30 });
    await this.page.focus('#password, input[name="password"]');
    await this.page.keyboard.type(this.password, { delay: 30 });

    // Click remember if available
    const remember = await this.page.$('#remember, input[name="remember"]');
    if (remember) await remember.click().catch(() => {});

    // Submit and wait for navigation
    await Promise.all([
      this.page.click('#login, button[type="submit"], input[type="submit"]').catch(() => {}),
      this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
    ]);

    // After login, navigate to server URL
    await this.page.goto(`https://aternos.org/server/${this.serverId}`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});

    // Try to obtain AJAX token
    const ajaxToken = await this.page.evaluate(() => {
      try {
        return window.AJAX_TOKEN || document.querySelector('script')?.textContent?.match(/AJAX_TOKEN\s*=\s*"([^"]+)"/)?.[1] || null;
      } catch (e) { return null; }
    }).catch(() => null);

    console.log('[minecraft] Login complete; AJAX token:', ajaxToken ? '[FOUND]' : '[NOT FOUND]');
    return ajaxToken;
  }

  async getServerStatus() {
    if (!this.page) throw new Error('Browser not initialized');
    const result = await this.page.evaluate(() => {
      const statusDiv = document.querySelector('.server-status');
      const isOnline = statusDiv?.classList.contains('online');
      const isOffline = statusDiv?.classList.contains('offline');
      const isStarting = statusDiv?.classList.contains('starting');
      let status = 'unknown';
      if (isOnline) status = 'online';
      else if (isOffline) status = 'offline';
      else if (isStarting) status = 'starting';

      const playersElement = document.querySelector('#players, .players-count, .statusplayerbadge');
      const players = playersElement?.textContent?.trim() || '0/20';

      const ipElement = document.querySelector('#ip, .server-address, .server-ip');
      const ip = ipElement?.textContent?.trim() || '';

      return { status, players, ip };
    }).catch(() => ({ status: 'unknown', players: '0/0', ip: '' }));

    console.log(`[minecraft] Server status: ${result.status} — players: ${result.players}`);
    return result;
  }

  async clickSelector(selectors) {
    for (const sel of selectors) {
      const el = await this.page.$(sel).catch(() => null);
      if (el) return el.click().catch(() => null);
    }
    return null;
  }

  async startServer() {
    console.log('[minecraft] Attempting to start server');
    const clicked = await this.clickSelector(['#start', 'button.start', '.btn-success']);
    if (!clicked) throw new Error('Start button not found');
    // Wait until online
    return this.waitForStatus('online', parseIntEnv(process.env.MC_START_TIMEOUT_MS, 120000));
  }

  async stopServer() {
    console.log('[minecraft] Attempting to stop server');
    const clicked = await this.clickSelector(['#stop', 'button.stop', '.btn-danger']);
    if (!clicked) throw new Error('Stop button not found');
    // Wait until offline
    return this.waitForStatus('offline', parseIntEnv(process.env.MC_STOP_TIMEOUT_MS, 60000));
  }

  async waitForStatus(target, timeoutMs = 120000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { status } = await this.getServerStatus();
      if (status === target) return true;
      await this.page.waitForTimeout(3000);
    }
    return false;
  }

  async takeScreenshot(outPath) {
    if (!this.page) return null;
    const dest = outPath || `aternos-${Date.now()}.png`;
    await this.page.screenshot({ path: dest, fullPage: true }).catch(() => null);
    console.log('[minecraft] Screenshot saved to', dest);
    return dest;
  }

  async close() {
    if (this.browser) {
      try { await this.browser.close(); } catch (e) { /* ignore */ }
      this.browser = null;
      this.page = null;
      console.log('[minecraft] Browser closed');
    }
  }

  async runFlow() {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        await this.init(this.useProxy);
        await this.login();
        const { status } = await this.getServerStatus();
        await this.takeScreenshot('before-action.png');

        if (status === 'offline') {
          await this.startServer();
          // keep online for configured minutes
          const ms = Math.max(0, this.keepOnlineMin) * 60 * 1000;
          console.log(`[minecraft] Keeping server online for ${this.keepOnlineMin} minute(s)`);
          await this.page.waitForTimeout(ms);
          await this.stopServer();
        } else {
          console.log('[minecraft] Server not offline — skipping start flow');
        }

        await this.takeScreenshot('after-action.png');
        console.log('[minecraft] Flow completed');
        break;
      } catch (err) {
        console.error('[minecraft] Error in runFlow:', err?.message || err);
        retries += 1;
        await this.close();
        if (retries < this.maxRetries) {
          console.log('[minecraft] Retrying with new proxy in 5s...');
          await new Promise(r => setTimeout(r, 5000));
          // rotate proxy on retry
          this.currentProxy = this.getRandomProxy();
        } else {
          console.error('[minecraft] Max retries reached');
          throw err;
        }
      } finally {
        // ensure closed between iterations
        await this.close();
      }
    }
  }
}

// If run directly, execute using environment variables
if (require.main === module) {
  (async () => {
    const username = process.env.MC_USERNAME;
    const password = process.env.MC_PASSWORD;
    const serverId = process.env.MC_SERVER_ID;
    if (!username || !password || !serverId) {
      console.error('Missing required environment variables. See .env.example in this folder.');
      process.exit(1);
    }

    const bot = new AternosProxyBot({
      username,
      password,
      serverId,
      headless: parseBool(process.env.MC_HEADLESS, true),
      keepOnlineMin: parseIntEnv(process.env.MC_KEEP_ONLINE_MIN, 2),
      maxRetries: parseIntEnv(process.env.MC_MAX_RETRIES, 3),
      useProxy: parseBool(process.env.MC_USE_PROXY, true),
    });

    try {
      await bot.runFlow();
      process.exit(0);
    } catch (e) {
      console.error('Fatal error:', e);
      process.exit(2);
    }
  })();
}

module.exports = { AternosProxyBot };

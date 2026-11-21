const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
let server;
let chrome;
let cdp;

function serveStatic() {
  return new Promise((resolve, reject) => {
    server = http.createServer((request, response) => {
      const requested = decodeURIComponent((request.url || '/').split('?')[0]);
      const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
      const file = path.resolve(root, relative);
      if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        response.writeHead(404); response.end('Not found'); return;
      }
      const contentType = file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(file).pipe(response);
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    server.on('error', reject);
  });
}

async function waitFor(predicate, timeoutMs = 10000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw lastError || new Error('Timed out waiting for browser state');
}

class CdpClient {
  constructor(url) { this.url = url; this.nextId = 0; this.pending = new Map(); this.socket = new WebSocket(url); }
  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  command(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error(details.exception?.description || details.text || 'Browser evaluation failed');
    }
    return result.result && result.result.value;
  }
  close() { this.socket.close(); }
}

async function browserJson(port, endpoint) {
  const response = await fetch(`http://127.0.0.1:${port}${endpoint}`);
  return response.json();
}

async function startBrowser(port, pagePort) {
  const debugPort = 10000 + Math.floor(Math.random() * 2000);
  chrome = spawn('chromium', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--remote-allow-origins=*', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=/tmp/streamapp-e2e-${process.pid}`, `http://127.0.0.1:${pagePort}/index.html`
  ], { stdio: 'ignore' });
  const targetUrl = `http://127.0.0.1:${pagePort}/index.html`;
  await waitFor(() => browserJson(debugPort, '/json/list').then(list => list.find(item => item.type === 'page' && item.webSocketDebuggerUrl && item.url === targetUrl)), 15000);
  const pages = await browserJson(debugPort, '/json/list');
  cdp = new CdpClient(pages.find(item => item.type === 'page' && item.url === targetUrl).webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.command('Runtime.enable');
  await waitFor(() => cdp.evaluate('document.readyState === "complete" && document.scripts.length > 0 && document.body && document.body.children.length > 0'));
  return port;
}

test.before(async () => {
  const pagePort = await serveStatic();
  await startBrowser(null, pagePort);
});

test.after(async () => {
  cdp?.close();
  if (chrome && !chrome.killed) chrome.kill('SIGTERM');
  await new Promise(resolve => server?.close(resolve));
});

test('opens Search Series and confirms season and episode in the in-app picker', { concurrency: false }, async () => {
  const result = await cdp.evaluate(`(() => {
    window.__pickerSelection = null;
    window.__realPlayMovieApiItem = playMovieApiItem;
    window.playMovieApiItem = (...args) => { window.__pickerSelection = args; };
    openSearch('movieapi-tv');
    renderMovieApiResults([{ id: '77', title: 'Test Series', description: 'Test description' }], 'tv');
    document.querySelector('#api-results .api-card').click();
    return {
      heading: document.getElementById('search-head-title').textContent,
      pickerVisible: document.getElementById('movie-api-episode-overlay').style.display === 'flex',
      seasonOptions: document.getElementById('movie-api-season').options.length,
      episodeOptions: document.getElementById('movie-api-episode').options.length
    };
  })()`);
  assert.equal(result.heading, '📺 SEARCH SERIES');
  assert.equal(result.pickerVisible, true);
  assert.equal(result.seasonOptions, 99);
  assert.equal(result.episodeOptions, 999);

  const selection = await cdp.evaluate(`(() => {
    document.getElementById('movie-api-season').value = '2';
    document.getElementById('movie-api-episode').value = '7';
    document.getElementById('movie-api-episode-confirm').click();
    return new Promise(resolve => setTimeout(() => resolve({ visible: document.getElementById('movie-api-episode-overlay').style.display, args: window.__pickerSelection }), 50));
  })()`);
  assert.equal(selection.visible, 'none');
  assert.equal(selection.args[0], '77');
  assert.equal(selection.args[2], 'tv');
  assert.equal(selection.args[3], 2);
  assert.equal(selection.args[4], 7);
  await cdp.evaluate('window.playMovieApiItem = window.__realPlayMovieApiItem');
});

test('keeps trailer playback explicit when full Movie API playback is blocked', { concurrency: false }, async () => {
  const state = await cdp.evaluate(`(async () => {
    window.__trailerPlayed = null;
    window.__restrictionBanner = null;
    movieApiFetch = async () => { const error = new Error('Provider access blocked'); error.code = 'UPSTREAM_ACCESS_BLOCKED'; error.retryable = false; throw error; };
    movieApiTrailer = () => 'https://www.youtube.com/watch?v=test-trailer';
    playDirectMedia = (...args) => { window.__trailerPlayed = args; return true; };
    showProviderRestrictionBanner = (...args) => { window.__restrictionBanner = args; };
    await playMovieApiItem('77', 'Test Series', 'tv', 2, 7, { id: '77', title: 'Test Series' });
    return {
      status: document.getElementById('player-status').textContent,
      actions: [...document.querySelectorAll('#player-status .player-action')].map(button => button.textContent),
      trailerPlayedBeforeClick: Boolean(window.__trailerPlayed),
      bannerTitle: window.__restrictionBanner && window.__restrictionBanner[0]
    };
  })()`);
  assert.match(state.status, /Full episode S2 E7 playback is blocked/);
  assert.deepEqual(state.actions, ['▶ PLAY OFFICIAL TRAILER']);
  assert.equal(state.trailerPlayedBeforeClick, false);
  assert.equal(state.bannerTitle, 'Test Series');

  const afterClick = await cdp.evaluate(`(() => {
    document.querySelector('#player-status .player-action').click();
    return { trailerPlayed: window.__trailerPlayed, status: document.getElementById('player-status').textContent };
  })()`);
  assert.equal(afterClick.trailerPlayed[0], 'https://www.youtube.com/watch?v=test-trailer');
  assert.match(afterClick.status, /Playing the official trailer/);
  assert.match(afterClick.status, /Full episode playback is still unavailable/);
});

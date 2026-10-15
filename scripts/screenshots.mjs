// Renders the webview in headless Chrome with VS Code theme colors and saves README screenshots.
// Usage: npm run build && node scripts/screenshots.mjs
// Set CHROME to the Chrome binary if it is not in the default macOS location.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const outDir = join(root, 'docs', 'images');
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const THEMES = {
  dark: {
    bodyClass: 'vscode-dark',
    vars: {
      'editor-background': '#1f1f1f',
      'editor-foreground': '#cccccc',
      'sideBar-background': '#181818',
      'panel-border': '#2b2b2b',
      'widget-border': '#313131',
      'widget-shadow': 'rgba(0, 0, 0, 0.36)',
      descriptionForeground: '#9d9d9d',
      focusBorder: '#0078d4',
      'button-background': '#0078d4',
      'button-foreground': '#ffffff',
      'button-border': 'rgba(255, 255, 255, 0.07)',
      'button-secondaryBackground': '#313131',
      'button-secondaryForeground': '#cccccc',
      'button-secondaryHoverBackground': '#3c3c3c',
      'input-background': '#313131',
      'input-border': '#3c3c3c',
      'list-hoverBackground': '#2a2d2e',
      'list-activeSelectionBackground': '#04395e',
      'list-activeSelectionForeground': '#ffffff',
      'badge-background': '#616161',
      'badge-foreground': '#f8f8f8',
      'textLink-foreground': '#4daafc',
      errorForeground: '#f85149',
      'editorWidget-background': '#202020',
      'editorWidget-border': '#454545',
      'editorSuggestWidget-background': '#202020',
      'editorSuggestWidget-border': '#454545',
      'editorLineNumber-foreground': '#6e7681',
      'inputOption-activeBackground': 'rgba(36, 137, 219, 0.51)',
      'inputOption-activeBorder': '#2488db',
      'inputOption-activeForeground': '#ffffff',
      'charts-blue': '#3794ff',
      'charts-purple': '#b180d7',
      'charts-green': '#89d185',
      'charts-yellow': '#cca700',
      'charts-orange': '#d18616',
      'terminal-ansiCyan': '#11a8cd',
      'gitDecoration-addedResourceForeground': '#81b88b',
      'gitDecoration-deletedResourceForeground': '#c74e39',
      'gitDecoration-modifiedResourceForeground': '#e2c08d',
    },
  },
  light: {
    bodyClass: 'vscode-light',
    vars: {
      'editor-background': '#ffffff',
      'editor-foreground': '#3b3b3b',
      'sideBar-background': '#f8f8f8',
      'panel-border': '#e5e5e5',
      'widget-border': '#e5e5e5',
      'widget-shadow': 'rgba(0, 0, 0, 0.16)',
      descriptionForeground: '#3b3b3b',
      focusBorder: '#005fb8',
      'button-background': '#005fb8',
      'button-foreground': '#ffffff',
      'button-border': 'rgba(0, 0, 0, 0.1)',
      'button-secondaryBackground': '#e5e5e5',
      'button-secondaryForeground': '#3b3b3b',
      'button-secondaryHoverBackground': '#cccccc',
      'input-background': '#ffffff',
      'input-border': '#cecece',
      'list-hoverBackground': '#f2f2f2',
      'list-activeSelectionBackground': '#e8e8e8',
      'list-activeSelectionForeground': '#000000',
      'badge-background': '#cccccc',
      'badge-foreground': '#3b3b3b',
      'textLink-foreground': '#005fb8',
      errorForeground: '#f85149',
      'editorWidget-background': '#f8f8f8',
      'editorWidget-border': '#c8c8c8',
      'editorSuggestWidget-background': '#f8f8f8',
      'editorSuggestWidget-border': '#c8c8c8',
      'editorLineNumber-foreground': '#6e7681',
      'inputOption-activeBackground': 'rgba(190, 213, 236, 0.4)',
      'inputOption-activeBorder': '#005fb8',
      'inputOption-activeForeground': '#000000',
      'charts-blue': '#1a85ff',
      'charts-purple': '#652d90',
      'charts-green': '#388a34',
      'charts-yellow': '#bf8803',
      'charts-orange': '#d18616',
      'terminal-ansiCyan': '#0598bc',
      'gitDecoration-addedResourceForeground': '#587c0c',
      'gitDecoration-deletedResourceForeground': '#ad0707',
      'gitDecoration-modifiedResourceForeground': '#895503',
    },
  },
};

const example = (name) => ({
  text: readFileSync(join(root, 'examples', name), 'utf8'),
  fileName: name,
  uri: `file:///examples/${name}`,
  baseIri: 'file:///examples/coffee.ttl',
  title: name,
});

const single = { kind: 'single', language: 'en', source: example('coffee.ttl') };
const diff = {
  kind: 'diff',
  language: 'en',
  before: { ...example('coffee.ttl'), title: 'main' },
  after: { ...example('coffee-v2.ttl'), title: 'feature/mocha' },
};

/** Each shot runs `actions` in the page after the first render, then waits for the layout to settle. */
const SHOTS = [
  {
    name: 'graph-dark',
    theme: 'dark',
    request: single,
    actions: `click('.text-button', 'Minimap')`,
  },
  { name: 'graph-light', theme: 'light', request: single, actions: `select('Latte')` },
  { name: 'hierarchy-dark', theme: 'dark', request: single, actions: `hierarchyDiagram()` },
  { name: 'diff-dark', theme: 'dark', request: diff, actions: `sleep(0)` },
  { name: 'diff-light', theme: 'light', request: diff, actions: `select('Mocha')` },
];

const PAGE_HELPERS = `
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const click = (selector, text) => {
    const target = [...document.querySelectorAll(selector)].find(
      (element) => !text || element.textContent.trim() === text,
    );
    if (!target) throw new Error('No element ' + selector + ' ' + (text ?? ''));
    target.click();
  };
  async function select(label) {
    const input = document.querySelector('.search-input');
    input.focus();
    input.value = label;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(100);
    document.querySelector('.search-results li').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(800);
    document.querySelector('.graph').focus();
    document.querySelector('.graph').dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
  }
  async function hierarchyDiagram() {
    click('.segment', 'Hierarchy');
    await sleep(100);
    const mode = [...document.querySelectorAll('.hierarchy select')].find((select) => select.querySelector('option[value=diagram]'));
    mode.value = 'diagram';
    mode.dispatchEvent(new Event('change'));
  }
`;

function harnessHtml(shot) {
  const theme = THEMES[shot.theme];
  const vars = Object.entries(theme.vars)
    .map(([name, value]) => `--vscode-${name}: ${value};`)
    .join('\n');
  const message = JSON.stringify({ type: 'analyze', request: shot.request, viewMode: 'graph' });
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<style>:root { ${vars}
  --vscode-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --vscode-font-size: 13px;
  --vscode-editor-font-family: Menlo, Monaco, monospace; }</style>
<link rel="stylesheet" href="/media/webview.css">
</head>
<body class="${theme.bodyClass}" data-worker-uri="/dist/webview/worker.js">
<script>
  window.acquireVsCodeApi = () => ({
    postMessage(message) {
      if (message.type === 'ready') window.postMessage(${message}, '*');
    },
    getState: () => undefined,
    setState() {},
  });
</script>
<script src="/dist/webview/main.js"></script>
</body></html>`;
}

const CONTENT_TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };

function serve() {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const shot = SHOTS.find((candidate) => path === `/${candidate.name}.html`);
    if (shot) {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(harnessHtml(shot));
      return;
    }
    const file = normalize(join(root, path));
    if (!file.startsWith(join(root, 'dist')) && !file.startsWith(join(root, 'media'))) {
      response.writeHead(404).end();
      return;
    }
    try {
      response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(file)] ?? 'text/plain' });
      response.end(readFileSync(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), 'triples-shots-'));
  const child = spawn(chrome, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--hide-scrollbars',
    '--no-first-run',
    'about:blank',
  ]);
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stderr.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
      if (match) resolve(Number(match[1]));
    });
    child.on('exit', () => reject(new Error(`Chrome exited:\n${output}`)));
  });
  const close = async () => {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await exited;
    rmSync(profile, { recursive: true, force: true });
  };
  return { port, close };
}

async function openPage(port) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new`, { method: 'PUT' })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(message.error.message));
    else callback.resolve(message.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  return { send, close: () => socket.close() };
}

async function evaluate(page, expression) {
  const { result, exceptionDetails } = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? expression);
  return result.value;
}

async function capture(page, baseUrl, shot) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 860,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await page.send('Page.navigate', { url: `${baseUrl}/${shot.name}.html` });
  await evaluate(
    page,
    `new Promise((resolve, reject) => {
      const started = Date.now();
      const poll = () => {
        if (document.querySelector('.search-input') && document.querySelector('.overlay')?.hidden) resolve();
        else if (Date.now() - started > 15000) reject(new Error('Timed out waiting for render'));
        else setTimeout(poll, 100);
      };
      poll();
    })`,
  );
  await evaluate(page, `(async () => { ${PAGE_HELPERS}; await ${shot.actions}; })()`);
  await evaluate(page, 'new Promise((resolve) => setTimeout(resolve, 900))');
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, `${shot.name}.png`), Buffer.from(data, 'base64'));
  process.stdout.write(`docs/images/${shot.name}.png\n`);
}

mkdirSync(outDir, { recursive: true });
const server = await serve();
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await launchChrome();
try {
  const page = await openPage(browser.port);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  const only = process.argv[2];
  for (const shot of SHOTS.filter((candidate) => !only || candidate.name === only)) {
    await capture(page, baseUrl, shot);
  }
  page.close();
} finally {
  await browser.close();
  server.close();
}

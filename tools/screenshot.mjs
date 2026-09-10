// Full-page screenshot at a true CSS viewport width, via CDP device emulation.
// Chrome's --screenshot flag clamps the layout viewport to 500px minimum, which
// silently crops anything narrower. Emulation.setDeviceMetricsOverride does not.
// Zero dependencies: Node 22+ ships a global WebSocket.

const [url, outPath, widthArg, scaleArg, mobileArg] = process.argv.slice(2);
const WIDTH = Number(widthArg || 390);
const SCALE = Number(scaleArg || 2);
const MOBILE = mobileArg !== 'desktop';
const PORT = 9222 + (process.pid % 500);

const { spawn } = await import('node:child_process');
const fs = await import('node:fs/promises');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + (await fs.mkdtemp('/tmp/cdp-')),
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function targetWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find(t => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('Chrome did not expose a page target');
}

const ws = new WebSocket(await targetWs());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
const events = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  } else if (msg.method && events.has(msg.method)) {
    events.get(msg.method)();
    events.delete(msg.method);
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => { pending.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const once = (method) => new Promise(res => events.set(method, res));

await send('Page.enable');
// mobile:true so meta viewport is honoured exactly as a phone would.
await send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH, height: 900, deviceScaleFactor: SCALE, mobile: MOBILE,
});

const loaded = once('Page.loadEventFired');
await send('Page.navigate', { url });
await loaded;
await sleep(1200); // webfonts + the starfield build

const { contentSize } = await send('Page.getLayoutMetrics');
const height = Math.ceil(contentSize.height);

const { data } = await send('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: true,
  // deviceScaleFactor already supplies the 2x, so clip scale stays 1.
  clip: { x: 0, y: 0, width: WIDTH, height, scale: 1 },
});

await fs.writeFile(outPath, Buffer.from(data, 'base64'));
console.log(`wrote ${outPath} — ${WIDTH}x${height} CSS px at ${SCALE}x`);

ws.close();
chrome.kill();
process.exit(0);

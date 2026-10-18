// Screenshots and runtime-error checks through the Chrome DevTools Protocol. No dependencies (Node 22+).
// Needs the dev server first: pnpm dev (tools/serve.mjs serves source/ on port 8734).
// usage: node tools/preview.mjs '<json>'  e.g. '{"w":1440,"h":900,"steps":[{"wait":4000},{"shot":"hero.png"}]}'   steps: {w,h,dpr,mobile,flags:[...chromium flags],media:{'prefers-color-scheme':'light'},init:'js rodando antes da página',url,steps:[{wait:ms}|{shot:file}|{eval:js}|{scroll:y}|{click:selector}|{mouse:[x,y]}|{down:[x,y]}|{up:[x,y]}|{tap:[x,y]}|{drag:[[x,y],[x,y],...]}|{key:...}]}
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const cfg = JSON.parse(process.argv[2]);
const port = 9300 + Math.floor(Math.random() * 500);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-'));
const chrome = spawn(
  'chromium',
  [
    '--headless=new',
    '--no-sandbox',
    '--hide-scrollbars',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${dir}`,
    `--window-size=${cfg.w},${cfg.h}`,
    ...(cfg.flags || []),
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let info;
for (let i = 0; i < 60; i++) {
  try {
    info = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    if (info?.length) break;
  } catch {}
  await sleep(250);
}
const page = info.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
    return;
  }
  if (m.method === 'Runtime.exceptionThrown')
    console.log(
      'EXCEPTION:',
      m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text,
    );
  if (m.method === 'Runtime.consoleAPICalled')
    console.log(
      'CONSOLE',
      m.params.type + ':',
      m.params.args.map((a) => a.value ?? a.description).join(' '),
    );
};
await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: cfg.w,
  height: cfg.h,
  deviceScaleFactor: cfg.dpr || 1,
  mobile: !!cfg.mobile,
});
if (cfg.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
if (cfg.media)
  await send('Emulation.setEmulatedMedia', {
    features: Object.entries(cfg.media).map(([name, value]) => ({ name, value })),
  });
if (cfg.init) await send('Page.addScriptToEvaluateOnNewDocument', { source: cfg.init });
await send('Page.navigate', { url: cfg.url || 'http://127.0.0.1:8734/index.html' });
for (const s of cfg.steps) {
  if (s.wait) await sleep(s.wait);
  if (s.eval) {
    const r = await send('Runtime.evaluate', {
      expression: s.eval,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result?.value !== undefined) console.log('EVAL:', JSON.stringify(r.result.value));
    if (r.exceptionDetails) console.log('EVAL EXC:', r.exceptionDetails.exception?.description);
  }
  if (s.scroll !== undefined)
    await send('Runtime.evaluate', {
      expression: `scrollTo({top:${s.scroll},behavior:'instant'})`,
    });
  if (s.click)
    await send('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(s.click)}).click()`,
    });
  if (s.mouse)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: s.mouse[0], y: s.mouse[1] });
  if (s.down)
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: s.down[0],
      y: s.down[1],
      button: 'left',
      clickCount: 1,
    });
  if (s.up)
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: s.up[0],
      y: s.up[1],
      button: 'left',
      clickCount: 1,
    });
  if (s.drag) {
    const [a, ...rest] = s.drag;
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: a[0],
      y: a[1],
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    for (const q of rest) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: q[0],
        y: q[1],
        button: 'left',
        buttons: 1,
      });
      await sleep(30);
    }
    const z = rest.at(-1) || a;
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: z[0],
      y: z[1],
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
  }
  if (s.tap) {
    await send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: s.tap[0], y: s.tap[1] }],
    });
    await sleep(60);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  if (s.key)
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: s.key,
      code: s.code || s.key,
      modifiers: s.mod || 0,
      windowsVirtualKeyCode: s.vk || 0,
    });
  if (s.shot) {
    const r = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: !!s.full,
    });
    fs.writeFileSync(s.shot, Buffer.from(r.data, 'base64'));
    console.log('SHOT', s.shot);
  }
}
ws.close();
chrome.kill();
await sleep(400);
try {
  fs.rmSync(dir, { recursive: true, force: true });
} catch {}

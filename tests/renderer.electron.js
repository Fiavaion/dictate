'use strict';
// Renderer test, run inside Electron: npm run test:renderer
// Overlapping diagram renders must leave the DOM prototypes untouched and raise no CSP reports.
// Needs network access for the pinned Mermaid build (cdn.jsdelivr.net).
const { app, BrowserWindow } = require('electron');
const { startServer } = require('../electron/server.js');

const NATIVE = `(fn) => typeof fn === 'function' && /\\[native code\\]/.test(Function.prototype.toString.call(fn))`;

app.whenReady().then(async () => {
  let failed = false;
  const check = (ok, name, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
    if (!ok) failed = true;
  };
  try {
    const server = await startServer(0, app);
    const win = new BrowserWindow({ show: false, webPreferences: { partition: 'renderer-test', contextIsolation: true, nodeIntegration: false, sandbox: true } });
    const cspMessages = [];
    win.webContents.on('console-message', (e) => {
      if (/Content Security Policy|Refused to/i.test(e.message)) cspMessages.push(e.message.slice(0, 160));
    });
    await win.loadURL(`http://localhost:${server.address().port}`);

    const result = await win.webContents.executeJavaScript(`(async () => {
      const isNative = ${NATIVE};
      const violations = [];
      document.addEventListener('securitypolicyviolation', e => violations.push(e.violatedDirective));
      const { DiagramRenderer } = await import('/js/ui/diagram-renderer.js');
      for (const id of ['diagA', 'diagB', 'diagC', 'diagD', 'diagE']) {
        const el = document.createElement('div'); el.id = id; document.body.appendChild(el);
      }
      const allNative = () => isNative(Element.prototype.setAttribute) && isNative(Node.prototype.appendChild)
        && isNative(Node.prototype.insertBefore) && isNative(DOMParser.prototype.parseFromString)
        && isNative(Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML').set);
      const sleep = ms => new Promise(r => setTimeout(r, ms));

      const a = new DiagramRenderer(), b = new DiagramRenderer(), c = new DiagramRenderer();
      // Three overlapping renders, started without awaiting each other.
      await Promise.all([
        a.render('graph TD; A[Start]-->B{Choice}; B-->|yes| C[Done]', 'diagA'),
        b.render('sequenceDiagram; U->>App: speak; App-->>U: text', 'diagB'),
        c.render('graph TD; A-->', 'diagC'),
      ]);
      await sleep(200);
      const out = {
        setAttribute: isNative(Element.prototype.setAttribute),
        appendChild: isNative(Node.prototype.appendChild),
        insertBefore: isNative(Node.prototype.insertBefore),
        innerHTML: isNative(Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML').set),
        parseFromString: isNative(DOMParser.prototype.parseFromString),
        flowRendered: !!document.querySelector('#diagA svg'),
        sequenceRendered: !!document.querySelector('#diagB svg'),
        errorShown: !!document.querySelector('#diagC .diagram-error'),
      };

      // A render that never settles, then a normal one queued behind it.
      const realRender = window.mermaid.render;
      let settleLate;
      window.mermaid.render = () => new Promise(resolve => { settleLate = resolve; });
      const started = Date.now();
      const stalled = new DiagramRenderer({ timeoutMs: 1000 }).render('graph TD; X-->Y', 'diagD')
        .then(() => 'resolved', e => 'rejected: ' + e.message);
      const next = new DiagramRenderer().render('graph TD; P[After]-->Q[Stall]', 'diagE');
      await sleep(100);
      out.patchedWhileStalled = !allNative();
      window.mermaid.render = realRender; // the queued render uses the real Mermaid
      out.stalledOutcome = await stalled;
      out.stalledMs = Date.now() - started;
      out.nativeAfterTimeout = allNative();
      out.timeoutErrorShown = !!document.querySelector('#diagD .diagram-error');
      await next;
      out.nextRendered = !!document.querySelector('#diagE svg');
      settleLate({ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }); // late settle must not re-patch
      await sleep(200);
      out.nativeAfterLateSettle = allNative();
      out.violations = violations;
      return out;
    })()`);

    for (const key of ['setAttribute', 'appendChild', 'insertBefore', 'innerHTML', 'parseFromString']) {
      check(result[key], `${key} restored to native after overlapping renders`);
    }
    check(result.flowRendered, 'flowchart rendered');
    check(result.sequenceRendered, 'sequence diagram rendered');
    check(result.errorShown, 'invalid diagram shows the error block');
    check(result.patchedWhileStalled, 'stalled render is in progress (prototypes patched)');
    check(/^rejected: Diagram render timed out/.test(result.stalledOutcome) && result.stalledMs < 3000,
      'stalled render rejects with a timeout', `${result.stalledOutcome}, ${result.stalledMs} ms`);
    check(result.nativeAfterTimeout, 'prototypes restored when the render times out');
    check(result.timeoutErrorShown, 'timed-out diagram shows the error block');
    check(result.nextRendered, 'render queued behind the stalled one still completes');
    check(result.nativeAfterLateSettle, 'late-settling render does not re-patch');
    check(result.violations.length === 0 && cspMessages.length === 0, 'no CSP violations', [...result.violations, ...cspMessages].join(' | '));
    server.close();
  } catch (e) {
    check(false, 'renderer test ran', e.message);
  }
  app.exit(failed ? 1 : 0);
});

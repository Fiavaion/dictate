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
      for (const id of ['diagA', 'diagB', 'diagC']) {
        const el = document.createElement('div'); el.id = id; document.body.appendChild(el);
      }
      const a = new DiagramRenderer(), b = new DiagramRenderer(), c = new DiagramRenderer();
      // Three overlapping renders, started without awaiting each other.
      await Promise.all([
        a.render('graph TD; A[Start]-->B{Choice}; B-->|yes| C[Done]', 'diagA'),
        b.render('sequenceDiagram; U->>App: speak; App-->>U: text', 'diagB'),
        c.render('graph TD; A-->', 'diagC'),
      ]);
      await new Promise(r => setTimeout(r, 200));
      return {
        setAttribute: isNative(Element.prototype.setAttribute),
        appendChild: isNative(Node.prototype.appendChild),
        insertBefore: isNative(Node.prototype.insertBefore),
        innerHTML: isNative(Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML').set),
        parseFromString: isNative(DOMParser.prototype.parseFromString),
        flowRendered: !!document.querySelector('#diagA svg'),
        sequenceRendered: !!document.querySelector('#diagB svg'),
        errorShown: !!document.querySelector('#diagC .diagram-error'),
        violations,
      };
    })()`);

    for (const key of ['setAttribute', 'appendChild', 'insertBefore', 'innerHTML', 'parseFromString']) {
      check(result[key], `${key} restored to native after overlapping renders`);
    }
    check(result.flowRendered, 'flowchart rendered');
    check(result.sequenceRendered, 'sequence diagram rendered');
    check(result.errorShown, 'invalid diagram shows the error block');
    check(result.violations.length === 0 && cspMessages.length === 0, 'no CSP violations', [...result.violations, ...cspMessages].join(' | '));
    server.close();
  } catch (e) {
    check(false, 'renderer test ran', e.message);
  }
  app.exit(failed ? 1 : 0);
});

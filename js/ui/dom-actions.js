/**
 * DOM actions — wires the declarative data-* attributes in index.html to the
 * window.* functions app.js exposes. Replaces inline on* attributes so the page
 * runs under a Content-Security-Policy without 'unsafe-inline' scripts.
 *
 *   data-click="fnA fnB" [data-arg="x"]  → click: fnA(x); fnB(x)  (arg omitted if absent)
 *   data-input="fn"                      → input: fn(element)
 *   data-change="fn"                     → change: fn(element.value)
 *
 * Imported first by app.js so these listeners register before any app.js
 * listeners on the same elements, matching the old inline-handler order.
 * Functions are looked up at event time, after app.js has exposed them.
 */

function call(names, args) {
  for (const name of names.split(' ')) window[name](...args);
}

for (const el of document.querySelectorAll('[data-click]')) {
  el.addEventListener('click', () => {
    const arg = el.dataset.arg;
    call(el.dataset.click, arg === undefined ? [] : [arg]);
  });
}

for (const el of document.querySelectorAll('[data-input]')) {
  el.addEventListener('input', () => call(el.dataset.input, [el]));
}

for (const el of document.querySelectorAll('[data-change]')) {
  el.addEventListener('change', () => call(el.dataset.change, [el.value]));
}

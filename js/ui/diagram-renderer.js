/**
 * Diagram Renderer
 * Renders Mermaid.js diagrams into a container element.
 * Loads the Mermaid library dynamically from CDN on first use.
 * Themed to match FiavaionDictate's dark UI.
 */

// Pinned exact version + Subresource Integrity; electron/server.js allows this exact URL in its CSP.
const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.8/dist/mermaid.min.js';
const MERMAID_SRI = 'sha384-N3QqR/7q+xm3BGX+CBbNI8AUmRRqcsDzToy+0z1NLDI0QmTKW8zvwLvqulJgk3dP';

let mermaidLoaded = false;
let mermaidLoadPromise = null;

/**
 * Dynamically load the Mermaid.js library from CDN.
 * Initialises with dark theme and Fiavaion colour palette.
 * Safe to call multiple times — only loads once.
 */
async function loadMermaid() {
  if (mermaidLoaded) return;
  if (mermaidLoadPromise) return mermaidLoadPromise;

  mermaidLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = MERMAID_CDN;
    script.integrity = MERMAID_SRI;
    script.crossOrigin = 'anonymous';

    script.onload = () => {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          primaryColor: '#35C280',
          primaryTextColor: '#E8E6E3',
          primaryBorderColor: '#2A2D35',
          lineColor: '#A78BFA',
          secondaryColor: '#2DD4BF',
          tertiaryColor: '#1E2028',
          mainBkg: '#1E2028',
          nodeBorder: '#3D3F4A',
          clusterBkg: '#252832',
          titleColor: '#E8E6E3',
          edgeLabelBackground: '#1E2028',
        },
        flowchart: { curve: 'basis', padding: 16 },
        sequence: { mirrorActors: false },
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 13,
      });
      mermaidLoaded = true;
      resolve();
    };

    script.onerror = () => {
      mermaidLoadPromise = null; // allow retry
      reject(new Error('Failed to load Mermaid.js from CDN'));
    };

    document.head.appendChild(script);
  });

  return mermaidLoadPromise;
}

// Mermaid writes its CSS through <style> elements and style="" attributes. The page's
// Content-Security-Policy (no 'unsafe-inline' styles) blocks both, and also reports any
// markup with style="" that is parsed, even inertly. CSSOM is not restricted, so while
// Mermaid renders, the same CSS is routed through CSSOM: a constructed stylesheet for
// <style> text and element.style for style attributes. The rendered result is unchanged.
const diagramSheet = new CSSStyleSheet();
document.adoptedStyleSheets = [...document.adoptedStyleSheets, diagramSheet];

const STYLE_ATTR = 'data-csp-style';

const isStyleElement = node => node instanceof HTMLStyleElement || node instanceof SVGStyleElement;

/** Rename style="" to data-csp-style="" inside tags, so parsing the markup applies no inline style. */
const renameStyleAttrs = markup =>
  String(markup).replace(/<[^<>]*>/g, tag => tag.replace(/(\s)style=/gi, `$1${STYLE_ATTR}=`));

/** Apply data-csp-style values through element.style and drop the attribute. */
function applyStyleAttrs(root) {
  if (!root) return;
  const elements = [...root.querySelectorAll(`[${STYLE_ATTR}]`)];
  if (root.hasAttribute?.(STYLE_ATTR)) elements.unshift(root);
  for (const el of elements) {
    el.style.cssText = el.getAttribute(STYLE_ATTR);
    el.removeAttribute(STYLE_ATTR);
  }
}

/**
 * Run fn with style writes routed through CSSOM: setAttribute('style', v) sets
 * element.style.cssText, markup given to innerHTML or DOMParser has its style
 * attributes applied through CSSOM, and <style> elements stay out of the DOM with
 * their CSS passed to onCss. Everything is restored afterwards.
 */
async function withCssomStyles(fn, onCss) {
  const { setAttribute } = Element.prototype;
  const { insertBefore, appendChild } = Node.prototype;
  const innerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  const { parseFromString } = DOMParser.prototype;
  Element.prototype.setAttribute = function (name, value) {
    if (String(name).toLowerCase() === 'style') { this.style.cssText = value; return; }
    setAttribute.call(this, name, value);
  };
  Node.prototype.insertBefore = function (node, ref) {
    if (isStyleElement(node)) { onCss(node.textContent); return node; }
    return insertBefore.call(this, node, ref);
  };
  Node.prototype.appendChild = function (node) {
    if (isStyleElement(node)) { onCss(node.textContent); return node; }
    return appendChild.call(this, node);
  };
  Object.defineProperty(Element.prototype, 'innerHTML', {
    ...innerHTML,
    set(markup) {
      innerHTML.set.call(this, renameStyleAttrs(markup));
      applyStyleAttrs(this instanceof HTMLTemplateElement ? this.content : this);
    },
  });
  DOMParser.prototype.parseFromString = function (markup, type) {
    const doc = parseFromString.call(this, renameStyleAttrs(markup), type);
    applyStyleAttrs(doc.documentElement);
    return doc;
  };
  try {
    return await fn();
  } finally {
    Element.prototype.setAttribute = setAttribute;
    Node.prototype.insertBefore = insertBefore;
    Node.prototype.appendChild = appendChild;
    Object.defineProperty(Element.prototype, 'innerHTML', innerHTML);
    DOMParser.prototype.parseFromString = parseFromString;
  }
}

/**
 * Turn Mermaid's SVG markup into a live node without inline-style violations:
 * <style> text is returned as css, style="" values are applied through CSSOM.
 */
function importSvg(svgMarkup) {
  const parsed = new DOMParser().parseFromString(`<body>${renameStyleAttrs(svgMarkup)}</body>`, 'text/html');
  const svg = parsed.body.querySelector('svg');
  const css = [...svg.querySelectorAll('style')].map(s => { s.remove(); return s.textContent; });
  const node = document.importNode(svg, true);
  applyStyleAttrs(node);
  return { node, css };
}

let renderQueue = Promise.resolve();
let renderCount = 0;

export class DiagramRenderer {
  constructor() {
    /** @type {HTMLElement|null} */
    this._container = null;

    /** @type {string} */
    this._currentMermaid = '';

    /** @type {string} CSS of the current diagram (applied via diagramSheet) */
    this._css = '';
  }

  /**
   * Render Mermaid syntax into a container element.
   *
   * @param {string} mermaidSyntax   Valid Mermaid.js code
   * @param {string} containerId     DOM id of the target container
   */
  render(mermaidSyntax, containerId) {
    // withCssomStyles patches shared prototypes, so renders must never overlap:
    // each one waits for the previous to finish (whatever its outcome).
    const run = renderQueue.then(() => this._render(mermaidSyntax, containerId));
    renderQueue = run.catch(() => {});
    return run;
  }

  async _render(mermaidSyntax, containerId) {
    await loadMermaid();

    this._container = document.getElementById(containerId) || this._container;
    if (!this._container) return;

    this._currentMermaid = mermaidSyntax;

    try {
      // Unique render id to avoid collisions
      const id = `mermaid-${Date.now()}-${++renderCount}`;
      const collected = [];
      const { svg } = await withCssomStyles(
        () => window.mermaid.render(id, mermaidSyntax),
        css => { collected.push(css); diagramSheet.replaceSync(collected.join('\n')); },
      );

      const { node, css } = importSvg(svg);
      this._css = [...collected, ...css].join('\n');
      diagramSheet.replaceSync(this._css);

      const wrapper = document.createElement('div');
      wrapper.className = 'diagram-wrapper';
      wrapper.appendChild(node);
      this._container.replaceChildren(wrapper);

      // Make the rendered SVG responsive
      node.style.maxWidth = '100%';
      node.style.height = 'auto';
    } catch (e) {
      this._container.innerHTML = `
        <div class="diagram-error">
          <div class="diagram-error-title">Diagram render error</div>
          <div class="diagram-error-message">${this._escHtml(e.message)}</div>
          <pre class="diagram-error-source">${this._escHtml(mermaidSyntax)}</pre>
        </div>
      `;
    }
  }

  /**
   * Export the current rendered diagram as a standalone SVG string (with its CSS).
   * @returns {string} SVG markup or empty string
   */
  toSvg() {
    const svg = this._container?.querySelector('svg');
    if (!svg) return '';
    const copy = svg.cloneNode(true);
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = this._css;
    copy.prepend(style);
    return copy.outerHTML;
  }

  /**
   * Get the raw Mermaid source that was last rendered.
   * @returns {string}
   */
  getMermaidSource() {
    return this._currentMermaid;
  }

  /**
   * Clear the rendered diagram from the container.
   */
  clear() {
    if (this._container) this._container.innerHTML = '';
    this._currentMermaid = '';
    this._css = '';
    diagramSheet.replaceSync('');
  }

  /**
   * Escape HTML special characters.
   * @param {string} str
   * @returns {string}
   */
  _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

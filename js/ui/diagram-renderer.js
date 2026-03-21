/**
 * Diagram Renderer
 * Renders Mermaid.js diagrams into a container element.
 * Loads the Mermaid library dynamically from CDN on first use.
 * Themed to match FiavaionDictate's dark UI.
 */

const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';

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

export class DiagramRenderer {
  constructor() {
    /** @type {HTMLElement|null} */
    this._container = null;

    /** @type {string} */
    this._currentMermaid = '';
  }

  /**
   * Render Mermaid syntax into a container element.
   *
   * @param {string} mermaidSyntax   Valid Mermaid.js code
   * @param {string} containerId     DOM id of the target container
   */
  async render(mermaidSyntax, containerId) {
    await loadMermaid();

    this._container = document.getElementById(containerId) || this._container;
    if (!this._container) return;

    this._currentMermaid = mermaidSyntax;

    try {
      // Unique render id to avoid collisions
      const id = 'mermaid-' + Date.now();
      const { svg } = await window.mermaid.render(id, mermaidSyntax);

      this._container.innerHTML = `
        <div class="diagram-wrapper" style="padding:16px;overflow:auto;text-align:center">
          ${svg}
        </div>
      `;

      // Make the rendered SVG responsive
      const svgEl = this._container.querySelector('svg');
      if (svgEl) {
        svgEl.style.maxWidth = '100%';
        svgEl.style.height = 'auto';
      }
    } catch (e) {
      this._container.innerHTML = `
        <div style="color:var(--danger);font-family:var(--mono);font-size:0.75rem;padding:16px">
          <div style="margin-bottom:8px;font-weight:600">Diagram render error</div>
          <div style="margin-bottom:12px;color:var(--muted)">${this._escHtml(e.message)}</div>
          <pre style="color:var(--dim);white-space:pre-wrap;background:var(--surface);padding:12px;border-radius:4px;border:1px solid var(--border)">${this._escHtml(mermaidSyntax)}</pre>
        </div>
      `;
    }
  }

  /**
   * Export the current rendered diagram as an SVG string.
   * @returns {string} SVG markup or empty string
   */
  toSvg() {
    return this._container?.querySelector('svg')?.outerHTML || '';
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

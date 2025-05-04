// content/content_script.js

const MDPI_DOMAIN = 'mdpi.com';
const MDPI_DOI    = '10.3390';
const domains     = window.MDPIFilterDomains;
const debounce    = window.debounce;

// Load user mode (highlight or hide)
chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
  const highlightStyle = '2px solid red';

  // A: Style search-site results
  const styleSearch = el => {
    if (!el) return;
    if (mode === 'hide') el.style.display = 'none';
    else {
      el.style.border = highlightStyle;
      el.style.padding = '5px';
    }
  };

  // B: Style inline <sup> footnotes
  const styleSup = sup => {
    sup.style.color      = '#E2211C';
    sup.style.fontWeight = 'bold';
  };

  // C: Style MDPI reference-list entries
  const styleRef = item => {
    item.style.border  = highlightStyle;
    item.style.padding = '5px';
    const label = item.querySelector('.label') || item.firstChild;
    if (label?.style) {
      label.style.color      = '#E2211C';
      label.style.fontWeight = 'bold';
    }
  };

  // 1. Search-site filtering
  function processSearchSites() {
    const h = location.hostname;
    for (const cfg of Object.values(domains)) {
      const matchHost = cfg.host ? h === cfg.host : cfg.hostRegex.test(h);
      const matchPath = !cfg.path || cfg.path.test(location.pathname);
      if (matchHost && matchPath) {
        if (cfg.itemSelector && cfg.doiPattern) {
          // PubMed‐style
          document.querySelectorAll(cfg.itemSelector).forEach(item => {
            if (item.textContent.includes(cfg.doiPattern)) {
              styleSearch(item);
            }
          });
        } else {
          // Google/WebSchol
          document.querySelectorAll(
            `${cfg.container} ${cfg.linkSelector}`
          ).forEach(a => {
            const row = a.closest(cfg.container);
            styleSearch(row);
          });
        }
      }
    }
  }

  // 2. Inline citations globally
  function processInlineCitations() {
    document
      .querySelectorAll('a[role="doc-biblioref"] sup, a[data-test="citation-ref"] sup')
      .forEach(sup => {
        const anchor = sup.closest('a');
        const frag   = anchor?.href.split('#')[1];
        const refEl  = frag && document.getElementById(frag);
        if (refEl?.innerHTML.includes(MDPI_DOMAIN) ||
            refEl?.innerHTML.includes(MDPI_DOI)) {
          styleSup(sup);
        }
      });
  }

  // 3. Reference-list entries globally
  function processReferenceLists() {
    const sel = [
      'li.c-article-references__item',
      'ol>li', 'ul>li',
      'div.citation', 'div.reference',
      'li.separated-list-item'
    ].join(',');
    document.querySelectorAll(sel).forEach(item => {
      if (item.querySelector(
        `a[href*="${MDPI_DOMAIN}"], a[href*="${MDPI_DOI}"], a[data-track-item_id*="${MDPI_DOI}"]`
      )) {
        styleRef(item);
      }
    });
  }

  // Orchestrator
  function runAll() {
    processSearchSites();
    processInlineCitations();
    processReferenceLists();
  }

  // Initial + dynamic
  runAll();
  new MutationObserver(debounce(runAll)).observe(document.body, {
    childList: true,
    subtree:   true
  });
});

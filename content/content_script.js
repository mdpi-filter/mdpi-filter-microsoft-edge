// content/content_script.js

const MDPI_DOMAIN = 'mdpi.com';
const MDPI_DOI    = '10.3390';
const domains     = window.MDPIFilterDomains;
const debounce    = window.debounce;

// Retrieve user preference (default = highlight)
chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
  const highlightStyle = '2px solid red';

  // A: Hide or highlight a search‐result element
  const styleSearch = el => {
    if (!el) return;
    if (mode === 'hide') el.style.display = 'none';
    else {
      el.style.border  = highlightStyle;
      el.style.padding = '5px';
    }
  };

  // B: Color an inline footnote (<sup> or <a>) red
  const styleSup = supOrA => {
    supOrA.style.color      = '#E2211C';
    supOrA.style.fontWeight = 'bold';
  };

  // C: Outline an entry in a reference list
  const styleRef = item => {
    item.style.border  = highlightStyle;
    item.style.padding = '5px';
    const label = item.querySelector('.label') || item.firstChild;
    if (label?.style) {
      label.style.color      = '#E2211C';
      label.style.fontWeight = 'bold';
    }
  };

  // 1. Process search‐site results *only* on the four engines
  function processSearchSites() {
    const host = location.hostname;
    for (const cfg of Object.values(domains)) {
      const matchHost = cfg.host
        ? host === cfg.host
        : cfg.hostRegex?.test(host);
      const matchPath = !cfg.path || cfg.path.test(location.pathname);
      if (!matchHost || !matchPath) continue;

      if (cfg.itemSelector && cfg.doiPattern) {
        // PubMed style: look for DOI in text
        document.querySelectorAll(cfg.itemSelector).forEach(item => {
          if (item.textContent.includes(cfg.doiPattern)) {
            styleSearch(item);
          }
        });

      } else if (cfg.itemSelector && cfg.htmlContains) {
        // EuropePMC style: look for HTML snippet
        document.querySelectorAll(cfg.itemSelector).forEach(item => {
          if (item.innerHTML.includes(cfg.htmlContains)) {
            styleSearch(item);
          }
        });

      } else if (cfg.container && cfg.linkSelector) {
        // Google / Scholar style: hide row if MDPI link found
        document
          .querySelectorAll(`${cfg.container} ${cfg.linkSelector}`)
          .forEach(a => {
            const row = a.closest(cfg.container);
            styleSearch(row);
          });
      }
    }
  }

  // 2. Process inline footnotes everywhere
  function processInlineCitations() {
    // Grab all anchors that point to a fragment
    document.querySelectorAll('a[href*="#"]').forEach(a => { // Changed selector from 'a[href^="#"]'
      const href = a.getAttribute('href');
      if (!href || !href.includes('#')) return; // Ensure href exists and contains #
      const frag = href.slice(href.lastIndexOf('#') + 1); // Extract fragment after the last #
      if (!frag) return; // Skip if fragment is empty

      const refEl = document.getElementById(frag) || document.getElementsByName(frag)[0];
      if (!refEl) return;

      const html = refEl.innerHTML;
      if (html.includes(MDPI_DOMAIN) || html.includes(MDPI_DOI)) {
        // If there's a <sup> inside, style that; otherwise style the <a>
        const sup = a.querySelector('sup');
        styleSup(sup || a);
      }
    });
  }

  // 3. Process reference‐list entries everywhere
  function processReferenceLists() {
    const selectors = [
      'li.c-article-references__item',
      'div.References p.ReferencesCopy1',
      'ol > li',
      'ul > li',
      'div.citation',
      'div.reference',
      'li.separated-list-item'
    ].join(',');
    document.querySelectorAll(selectors).forEach(item => {
      // Detect MDPI by link, DOI or data-track-item_id
      if (item.querySelector(
        `a[href*="${MDPI_DOMAIN}"], a[href*="${MDPI_DOI}"], a[data-track-item_id*="${MDPI_DOI}"]`
      )) {
        styleRef(item);
      }
    });
  }

  // Run all three
  function runAll() {
    processSearchSites();
    processInlineCitations();
    processReferenceLists();
  }

  // Initial + dynamic (SPA/infinite scroll, etc.)
  runAll();
  new MutationObserver(debounce(runAll)).observe(document.body, {
    childList: true,
    subtree:   true
  });
});

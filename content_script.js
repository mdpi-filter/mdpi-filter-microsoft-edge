// content_script.js

const MDPI_DOMAIN     = 'mdpi.com';
const MDPI_DOI_PREFIX = '10.3390';

// Load user choice: hide vs highlight (default: highlight)
chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
  const highlightStyle = '2px solid red';

  // (A) Search-site result styling
  function styleSearchResult(el) {
    if (!el) return;
    if (mode === 'hide') el.style.display = 'none';
    else {
      el.style.border  = highlightStyle;
      el.style.padding = '5px';
    }
  }

  // (B) Inline <sup> citation styling (always)
  function styleInlineSup(sup) {
    sup.style.color      = '#E2211C';
    sup.style.fontWeight = 'bold';
  }

  // (C) Reference-list entry styling (always)
  function styleRefEntry(item) {
    item.style.border  = highlightStyle;
    item.style.padding = '5px';
    const label = item.querySelector('.label') || item.firstChild;
    if (label?.style) {
      label.style.color      = '#E2211C';
      label.style.fontWeight = 'bold';
    }
  }

  // 1. Search-site filters
  function processSearchSites() {
    const h = location.hostname;
    if (h === 'www.google.com' && location.pathname.startsWith('/search')) {
      document
        .querySelectorAll(`div.g a[href*="${MDPI_DOMAIN}"]`)
        .forEach(link => styleSearchResult(link.closest('div.g')));
    }
    if (h === 'scholar.google.com') {
      document
        .querySelectorAll(`div.gs_r a[href*="${MDPI_DOMAIN}"]`)
        .forEach(link => styleSearchResult(link.closest('div.gs_r')));
    }
    if (h === 'pubmed.ncbi.nlm.nih.gov') {
      document
        .querySelectorAll('article.full-docsum')
        .forEach(item => {
          const cit = item.querySelector('.docsum-journal-citation.full-journal-citation');
          if (cit?.textContent.includes(MDPI_DOI_PREFIX)) {
            styleSearchResult(item);
          }
        });
    }
    if (h.endsWith('europepmc.org')) {
      document
        .querySelectorAll('li.separated-list-item .citation')
        .forEach(citDiv => {
          if (citDiv.innerHTML.includes('<b>MDPI</b>')) {
            styleSearchResult(citDiv.closest('li.separated-list-item'));
          }
        });
    }
  }

  // 2. Universal inline <sup> citation styling
  function processInlineCitations() {
    // jissn-style footnote anchors
    document
      .querySelectorAll('a[data-test="citation-ref"]')
      .forEach(a => {
        // Get only the text node or <sup> inside
        const sup = a.querySelector('sup') || a;
        // Resolve the fragment to find the reference paragraph
        const frag = a.getAttribute('href')?.split('#')[1];
        const p    = frag && document.getElementById(frag);
        if (p?.innerHTML.includes(MDPI_DOMAIN) || p?.innerHTML.includes(MDPI_DOI_PREFIX)) {
          styleInlineSup(sup);
        }
      });
  }

  // 3. Universal reference-list styling
  function processReferenceLists() {
    const selectors = [
      'li.c-article-references__item',
      'ol > li',
      'ul > li',
      'div.citation',
      'div.reference',
      'li.separated-list-item'
    ].join(',');
    document.querySelectorAll(selectors).forEach(item => {
      if (item.querySelector(
        `a[href*="${MDPI_DOMAIN}"], a[href*="${MDPI_DOI_PREFIX}"], a[data-track-item_id*="${MDPI_DOI_PREFIX}"]`
      )) {
        styleRefEntry(item);
      }
    });
  }

  // Run all routines
  function runAll() {
    processSearchSites();
    processInlineCitations();
    processReferenceLists();
  }

  runAll();
  new MutationObserver(runAll).observe(document.body, {
    childList: true,
    subtree:   true
  });
});

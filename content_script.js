// content_script.js

const MDPI_DOMAIN     = 'mdpi.com';
const MDPI_DOI_PREFIX = '10.3390/';

// Load the user’s choice: hide vs highlight
chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
  const highlightStyle = '2px solid red';

  // (A) Applies only to search-site results
  function styleSearchResult(el) {
    if (!el) return;
    if (mode === 'hide') {
      el.style.display = 'none';
    } else {
      el.style.border  = highlightStyle;
      el.style.padding = '5px';
    }
  }

  // (B) Always run on every page: color inline <sup> citations red
  function styleInlineSup(sup) {
    sup.style.color      = '#E2211C';
    sup.style.fontWeight = 'bold';
  }

  // (C) Always run on every page: outline MDPI entries in reference lists
  function styleRefEntry(item) {
    item.style.border  = highlightStyle;
    item.style.padding = '5px';
    const label = item.querySelector('.label') || item.firstChild;
    if (label?.style) {
      label.style.color      = '#E2211C';
      label.style.fontWeight = 'bold';
    }
  }

  // 1. Search-site filters (only if hostname matches)
  function processSearchSites() {
    const h = location.hostname;
    if (h === 'www.google.com' && location.pathname.startsWith('/search')) {
      document.querySelectorAll(`div.g a[href*="${MDPI_DOMAIN}"]`)
        .forEach(link => styleSearchResult(link.closest('div.g')));
    }
    if (h === 'scholar.google.com') {
      document.querySelectorAll(`div.gs_r a[href*="${MDPI_DOMAIN}"]`)
        .forEach(link => styleSearchResult(link.closest('div.gs_r')));
    }
    if (h === 'pubmed.ncbi.nlm.nih.gov') {
      document.querySelectorAll('article.full-docsum').forEach(item => {
        const cit = item.querySelector('.docsum-journal-citation.full-journal-citation');
        if (cit?.textContent.includes(MDPI_DOI_PREFIX)) {
          styleSearchResult(item);
        }
      });
    }
    if (h.endsWith('europepmc.org')) {
      document.querySelectorAll('li.separated-list-item .citation').forEach(citDiv => {
        if (citDiv.innerHTML.includes('<b>MDPI</b>')) {
          styleSearchResult(citDiv.closest('li.separated-list-item'));
        }
      });
    }
  }

  // 2. Universal in-page citation styling
  function processInlineCitations() {
    document.querySelectorAll('a[role="doc-biblioref"] sup')
      .forEach(styleInlineSup);
  }

  // 3. Universal reference-list styling
  function processReferenceLists() {
    const sel = ['ol > li','ul > li','div.citation','div.reference','li.separated-list-item']
      .join(',');
    document.querySelectorAll(sel).forEach(item => {
      if (item.querySelector(`a[href*="${MDPI_DOMAIN}"], a[href*="${MDPI_DOI_PREFIX}"]`)) {
        styleRefEntry(item);
      }
    });
  }

  // Run everything
  function runAll() {
    processSearchSites();    // only hides/highlights MDPI on search sites
    processInlineCitations(); 
    processReferenceLists();
  }

  runAll();
  new MutationObserver(runAll).observe(document.body, { childList: true, subtree: true });
});

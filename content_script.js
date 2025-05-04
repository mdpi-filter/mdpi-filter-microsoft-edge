// content_script.js

const MDPI_DOMAIN     = 'mdpi.com';
const MDPI_DOI_PREFIX = '10.3390/';

// Load mode
chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
  const highlightStyle = '2px solid red';

  // Only applied to search‐site result containers
  function styleSearchResult(el) {
    if (!el) return;
    if (mode === 'hide') {
      el.style.display = 'none';
    } else {
      el.style.border  = highlightStyle;
      el.style.padding = '5px';
    }
  }

  // Always applied to in‐paper citations & reference lists
  function styleCitationSup(sup) {
    sup.style.color      = '#E2211C';
    sup.style.fontWeight = 'bold';
  }
  function styleReferenceEntry(item) {
    item.style.border  = highlightStyle;
    item.style.padding = '5px';
  }

  // 1. Search‐site filters
  function processGoogleWeb() {
    document.querySelectorAll(`div.g a[href*="${MDPI_DOMAIN}"]`)
      .forEach(link => styleSearchResult(link.closest('div.g')));
  }
  function processScholar() {
    document.querySelectorAll(`div.gs_r a[href*="${MDPI_DOMAIN}"]`)
      .forEach(link => styleSearchResult(link.closest('div.gs_r')));
  }
  function processPubmed() {
    document.querySelectorAll('article.full-docsum').forEach(item => {
      const cit = item.querySelector('.docsum-journal-citation.full-journal-citation');
      if (cit && cit.textContent.includes(MDPI_DOI_PREFIX)) {
        styleSearchResult(item);
      }
    });
  }
  function processEuropePMC() {
    document.querySelectorAll('li.separated-list-item .citation')
      .forEach(citDiv => {
        if (citDiv.innerHTML.includes('<b>MDPI</b>')) {
          styleSearchResult(citDiv.closest('li.separated-list-item'));
        }
      });
  }

  // 2. In‐paper citation styling (always)
  function processInlineCitations() {
    document.querySelectorAll('a[role="doc-biblioref"] sup')
      .forEach(styleCitationSup);
  }

  // 3. Reference‐list entries (always)
  function processReferenceLists() {
    const sel = ['ol > li','ul > li','div.citation','div.reference','li.separated-list-item']
      .join(',');
    document.querySelectorAll(sel).forEach(item => {
      if (item.querySelector(`a[href*="${MDPI_DOMAIN}"], a[href*="${MDPI_DOI_PREFIX}"]`)) {
        styleReferenceEntry(item);
        const label = item.querySelector('.label') || item.firstChild;
        if (label && label.style) {
          label.style.color      = '#E2211C';
          label.style.fontWeight = 'bold';
        }
      }
    });
  }

  // Dispatch based on host
  function processAll() {
    const h = location.hostname;
    if (h==='www.google.com' && location.pathname.startsWith('/search')) processGoogleWeb();
    if (h==='scholar.google.com')  processScholar();
    if (h==='pubmed.ncbi.nlm.nih.gov') processPubmed();
    if (h.endsWith('europepmc.org')) processEuropePMC();
    // always style in‐paper
    processInlineCitations();
    processReferenceLists();
  }

  processAll();
  new MutationObserver(processAll)
    .observe(document.body, { childList: true, subtree: true });
});

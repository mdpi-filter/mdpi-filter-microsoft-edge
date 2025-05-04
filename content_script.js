// content_script.js

// ——————————————————————————
// 1. MDPI detection patterns
// ——————————————————————————
const MDPI_DOMAIN     = 'mdpi.com';
const MDPI_DOI_PREFIX = '10.3390/';

// ——————————————————————————
// 2. Load user preference (default: highlight)
// ——————————————————————————
chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
  const highlightStyle = '2px solid red';

  // helper to either hide or highlight an element
  function styleResult(el) {
    if (!el) return;
    if (mode === 'hide') {
      el.style.display = 'none';
    } else {
      el.style.border  = highlightStyle;
      el.style.padding = '5px';
    }
  }

  // ——————————————————————————
  // 3. MDPI filters for search sites
  // ——————————————————————————

  function processGoogleWeb() {
    document
      .querySelectorAll(`div.g a[href*="${MDPI_DOMAIN}"]`)
      .forEach(link => styleResult(link.closest('div.g')));
  }

  function processScholar() {
    document
      .querySelectorAll(`div.gs_r a[href*="${MDPI_DOMAIN}"]`)
      .forEach(link => styleResult(link.closest('div.gs_r')));
  }

  function processPubmed() {
    document
      .querySelectorAll('article.full-docsum')
      .forEach(item => {
        const cit = item.querySelector('.docsum-journal-citation.full-journal-citation');
        if (cit && cit.textContent.includes(MDPI_DOI_PREFIX)) {
          styleResult(item);
        }
      });
  }

  function processEuropePMC() {
    document
      .querySelectorAll('li.separated-list-item .citation')
      .forEach(citDiv => {
        if (citDiv.innerHTML.includes('<b>MDPI</b>')) {
          styleResult(citDiv.closest('li.separated-list-item'));
        }
      });
  }

  // ——————————————————————————
  // 4. Citation styling everywhere
  // ——————————————————————————

  // 4.a In-text <sup> citations (color only)
  function processInlineCitations() {
    document
      .querySelectorAll('a[role="doc-biblioref"] sup')
      .forEach(sup => {
        sup.style.color      = '#E2211C';
        sup.style.fontWeight = 'bold';
      });
  }

  // 4.b Reference-list entries (outline only MDPI ones)
  function processReferenceLists() {
    // common reference-list selectors across journals
    const refSelectors = [
      'ol > li',                // numbered lists
      'ul > li',                // bullet lists
      'div.citation',           // EuropePMC & others
      'div.reference',          // generic
      'li.separated-list-item'  // EuropePMC
    ];
    document
      .querySelectorAll(refSelectors.join(','))
      .forEach(item => {
        // if there's a direct MDPI link or DOI in here
        if (item.querySelector(`a[href*="${MDPI_DOMAIN}"], a[href*="${MDPI_DOI_PREFIX}"]`)) {
          styleResult(item);

          // also color the leading number/label if present
          const label = item.querySelector('.label') || // some sites
                        item.querySelector('> span')   || // fallback
                        item.firstChild;                 // very fallback
          if (label && label.style) {
            label.style.color      = '#E2211C';
            label.style.fontWeight = 'bold';
          }
        }
      });
  }

  // ——————————————————————————
  // 5. Dispatch based on host & then global citation styling
  // ——————————————————————————
  function processAll() {
    const host = location.hostname;

    if (host === 'www.google.com' && location.pathname.startsWith('/search')) {
      processGoogleWeb();
    }
    if (host === 'scholar.google.com') {
      processScholar();
    }
    if (host === 'pubmed.ncbi.nlm.nih.gov') {
      processPubmed();
    }
    if (host.endsWith('europepmc.org')) {
      processEuropePMC();
    }

    // Citation tweaks on **any** page:
    processInlineCitations();
    processReferenceLists();
  }

  // initial run + dynamic updates
  processAll();
  new MutationObserver(processAll)
    .observe(document.body, { childList: true, subtree: true });
});

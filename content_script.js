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
    if (mode === 'hide') {
      el.style.display = 'none';
    } else {
      el.style.border  = highlightStyle;
      el.style.padding = '5px';
    }
  }

  // ——————————————————————————
  // 3. Per-site processing functions
  // ——————————————————————————

  // 3.a Google Web Search
  function processGoogleWeb() {
    document
      .querySelectorAll(`div.g a[href*="${MDPI_DOMAIN}"]`)
      .forEach(link => {
        const row = link.closest('div.g');
        if (row) styleResult(row);
      });
  }

  // 3.b Google Scholar
  function processScholar() {
    document
      .querySelectorAll(`div.gs_r a[href*="${MDPI_DOMAIN}"]`)
      .forEach(link => {
        const row = link.closest('div.gs_r');
        if (row) styleResult(row);
      });
  }

  // 3.c PubMed (by DOI prefix)
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

  // 3.d Europe PMC (by bolded “MDPI”)
  function processEuropePMC() {
    document
      .querySelectorAll('li.separated-list-item .citation')
      .forEach(citDiv => {
        if (citDiv.innerHTML.includes('<b>MDPI</b>')) {
          const row = citDiv.closest('li.separated-list-item');
          if (row) styleResult(row);
        }
      });
  }

  // 3.e In-text reference citations (outline & red sup)
  function processInlineCitations() {
    // Any anchor that acts as a bibliographic reference control
    document
      .querySelectorAll('a[role="doc-biblioref"]')
      .forEach(a => {
        // outline the entire dropBlock if present, otherwise the <a> itself
        const dropBlock = a.closest('.dropBlock') || a;
        dropBlock.style.outline       = highlightStyle;
        dropBlock.style.outlineOffset = '2px';

        // find the <sup> inside and color it red
        const sup = a.querySelector('sup');
        if (sup) {
          sup.style.color = '#E2211C';
          sup.style.fontWeight = 'bold';
        }
      });
  }

  // ——————————————————————————
  // 4. Dispatch based on host
  // ——————————————————————————
  function processAll() {
    const host = location.hostname;

    if (host === 'www.google.com' && location.pathname === '/search') {
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

    // run inline-citation styling on **any** page
    processInlineCitations();
  }

  // Initial run
  processAll();

  // Re-run on dynamic updates (infinite scroll, AJAX, etc.)
  new MutationObserver(processAll)
    .observe(document.body, { childList: true, subtree: true });
});

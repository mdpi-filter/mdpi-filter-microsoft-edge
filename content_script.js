// content_script.js

// ——————————————————————————
// 1. MDPI detection patterns
// ——————————————————————————
const MDPI_DOMAIN     = 'mdpi.com';
const MDPI_DOI_PREFIX = '10.3390/';

// ——————————————————————————
// 2. Load user preference
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

  // 3.a Google.com web search (results live under <div class="g">…)
  function processGoogleWeb() {
    document
      .querySelectorAll(`div.g a[href*="${MDPI_DOMAIN}"]`)
      .forEach(link => {
        const row = link.closest('div.g');
        if (row) styleResult(row);
      });
  }

  // 3.b Google Scholar (<div class="gs_r">…)
  function processScholar() {
    document
      .querySelectorAll(`div.gs_r a[href*="${MDPI_DOMAIN}"]`)
      .forEach(link => {
        const row = link.closest('div.gs_r');
        if (row) styleResult(row);
      });
  }

  // 3.c PubMed (look for DOI prefix 10.3390/ in the full-citation span)
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

  // 3.d Europe PMC (any <li.separated-list-item> whose .citation text includes “MDPI”)
  function processEuropePMC() {
    document
      .querySelectorAll('li.separated-list-item .citation')
      .forEach(citDiv => {
        // many EuropePMC citations bold “MDPI” in the description
        if (citDiv.innerHTML.includes('<b>MDPI</b>')) {
          const row = citDiv.closest('li.separated-list-item');
          if (row) styleResult(row);
        }
      });
  }

  // ——————————————————————————
  // 4. Dispatch based on host
  // ——————————————————————————
  function processAll() {
    const host = location.hostname;

    // Google Web
    if (host === 'www.google.com' && location.pathname === '/search') {
      processGoogleWeb();
    }

    // Google Scholar
    if (host === 'scholar.google.com') {
      processScholar();
    }

    // PubMed
    if (host === 'pubmed.ncbi.nlm.nih.gov') {
      processPubmed();
    }

    // Europe PMC
    if (host.endsWith('europepmc.org')) {
      processEuropePMC();
    }
  }

  // run once now…
  processAll();

  // …and whenever the page mutates (infinite scroll, AJAX, etc.)
  new MutationObserver(processAll)
    .observe(document.body, { childList: true, subtree: true });
});

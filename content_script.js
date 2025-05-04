// content_script.js

// 1. MDPI detection patterns
const MDPI_DOMAIN     = 'mdpi.com';
const MDPI_DOI_PREFIX = '10.3390/';

// 2. Load user preference (default: highlight)
chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
  const highlightStyle = '2px solid red';

  // helper to hide or highlight an element
  function styleResult(el) {
    if (!el) return;
    if (mode === 'hide') {
      el.style.display = 'none';
    } else {
      el.style.border  = highlightStyle;
      el.style.padding = '5px';
    }
  }

  // 3. Search-site filters (unchanged)
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

  // 4.a Inline <sup> citations — only if they point to MDPI
  function processInlineCitations() {
    document
      .querySelectorAll('a[role="doc-biblioref"]')
      .forEach(a => {
        const sup = a.querySelector('sup');
        if (!sup) return;

        // Find the associated dropBlock holder by matching data-db-target
        const targetFor = a.getAttribute('data-db-target-for');
        let citationNode = null;
        if (targetFor) {
          const holder = document.querySelector(
            `.dropBlock__holder[data-db-target-of="${targetFor}"]`
          );
          citationNode = holder && holder.querySelector('.citation');
        }

        // If that citation block contains an MDPI DOI or link, color the <sup>
        if (
          citationNode &&
          (
            citationNode.innerHTML.includes(MDPI_DOMAIN) ||
            citationNode.innerHTML.includes(MDPI_DOI_PREFIX)
          )
        ) {
          sup.style.color      = '#E2211C';
          sup.style.fontWeight = 'bold';
        }
      });
  }

  // 4.b Reference-list entries — outline only MDPI ones, and red-bold their label
  function processReferenceLists() {
    const selectors = [
      'ol > li',
      'ul > li',
      'div.citation',
      'div.reference',
      'li.separated-list-item'
    ];
    document
      .querySelectorAll(selectors.join(','))
      .forEach(item => {
        if (item.querySelector(`a[href*="${MDPI_DOMAIN}"], a[href*="${MDPI_DOI_PREFIX}"]`)) {
          styleResult(item);
          // colour the leading number/label if present
          const label =
            item.querySelector('.label') ||
            item.querySelector('> span')   ||
            item.firstChild;
          if (label && label.style) {
            label.style.color      = '#E2211C';
            label.style.fontWeight = 'bold';
          }
        }
      });
  }

  // 5. Dispatch
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

    // Always run the two citation routines
    processInlineCitations();
    processReferenceLists();
  }

  // Initial + dynamic
  processAll();
  new MutationObserver(processAll).observe(document.body, {
    childList: true,
    subtree:   true
  });
});

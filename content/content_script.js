// content/content_script.js

if (!window.mdpiFilterInjected) {
  window.mdpiFilterInjected = true;
  console.log("[MDPI Filter] Content script executing (mdpiFilterInjected set).");

  // --- Dependencies Check ---
  if (typeof window.MDPIFilterDomains === 'undefined') {
    console.error("[MDPI Filter] CRITICAL: window.MDPIFilterDomains is undefined. domains.js might not have loaded correctly.");
  }
  if (typeof window.sanitize === 'undefined') {
    console.error("[MDPI Filter] CRITICAL: window.sanitize is undefined. sanitizer.js might not have loaded correctly.");
  }
  // Add debounce dependency check if utils.js is separate
  if (typeof window.debounce === 'undefined') {
    // Basic debounce implementation if utils.js isn't guaranteed
    window.debounce = (fn, ms = 200) => {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
      };
    };
    console.warn("[MDPI Filter] Basic debounce function created as window.debounce was undefined.");
  }
  // ---

  // --- Constants, Selectors, State ---
  const MDPI_DOMAIN = 'mdpi.com';
  const MDPI_DOI    = '10.3390';
  const domains     = window.MDPIFilterDomains || {};
  const sanitize    = window.sanitize || (html => html);
  const uniqueMdpiReferences = new Set();
  let collectedMdpiReferences = []; // Array to store detailed reference info

  const referenceListSelectors = [
    'li.c-article-references__item',
    'div.References p.ReferencesCopy1',
    'li.html-x',
    'li.html-xx',
    'div.citation',
    'div.reference',
    'li.separated-list-item',
    'li[id^="CR"]',
    'li[id^="ref-"]',
    'li[id^="reference-"]',
    'li:has(> span > a[id^="ref-id-"])',
    'li:has(a[name^="bbib"])',
    'li[data-bib-id]', // Existing Wiley selector
    'span[aria-owns^="pdfjs_internal_id_"]' // Added selector for PDF.js rendered spans
  ].join(',');
  // ---

  chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
    console.log("[MDPI Filter] Mode:", mode);

    // --- Styling Functions ---
    const highlightStyle = '2px solid red';

    const styleSearch = el => {
      if (!el) return;
      if (mode === 'hide') el.style.display = 'none';
      else {
        el.style.border  = highlightStyle;
        el.style.padding = '5px';
      }
    };

    const styleSup = supOrA => {
      supOrA.style.color      = '#E2211C';
      supOrA.style.fontWeight = 'bold';
    };

    const styleRef = item => {
      item.style.color = '#E2211C';

      let currentSibling = item.previousElementSibling;
      const referenceStartRegex = /^\s*\d+\.\s*/;

      while (currentSibling) {
        if (currentSibling.matches('span[aria-owns^="pdfjs_internal_id_"]')) {
          break;
        }

        if (currentSibling.matches('span')) {
          if (referenceStartRegex.test(currentSibling.textContent || '')) {
            currentSibling.style.color = '#E2211C';
            break;
          } else {
            currentSibling.style.color = '#E2211C';
          }
        } else if (currentSibling.tagName !== 'BR') {
          break;
        }
        currentSibling = currentSibling.previousElementSibling;
      }
    };

    const styleDirectLink = link => {
      const titleElement = link.querySelector('h3');
      const targetElement = titleElement || link;
      targetElement.style.color = '#E2211C';
      targetElement.style.borderBottom = '1px dotted #E2211C';
      if (targetElement !== link) {
        link.style.textDecoration = 'none';
      }
      if (window.getComputedStyle(targetElement).display === 'inline') {
        targetElement.style.display = 'inline-block';
      }
    };

    const styleLinkElement = link => {
      if (!link) return;
      link.style.color = '#E2211C';
      link.style.borderBottom = '1px dotted #E2211C';
      link.style.textDecoration = 'none';
      if (window.getComputedStyle(link).display === 'inline') {
        link.style.display = 'inline-block';
      }
    };
    // ---

    // --- Core Logic Functions ---
    const isMdpiReferenceItem = (item) => {
      if (!item) return false;
      if (item.dataset.mdpiChecked) {
        if (item.dataset.mdpiResult === 'true' && !collectedMdpiReferences.some(ref => ref.element === item)) {
          const refData = extractReferenceData(item);
          if (refData) collectedMdpiReferences.push(refData);
        }
        return item.dataset.mdpiResult === 'true';
      }

      console.log("[MDPI Filter] Checking item:", item);
      const textContent = item.textContent || '';
      const innerHTML = item.innerHTML || '';

      const hasMdpiLink = item.querySelector(
        `a[href*="${MDPI_DOMAIN}"], a[href*="${MDPI_DOI}"], a[data-track-item_id*="${MDPI_DOI}"]`
      );
      const hasMdpiText = textContent.includes(MDPI_DOI);
      const journalRegex = /\b(Nutrients|Int J Mol Sci|IJMS|Molecules)\b/i;
      const hasMdpiJournal = journalRegex.test(innerHTML);

      const isMdpi = !!(hasMdpiLink || hasMdpiText || hasMdpiJournal);
      console.log("[MDPI Filter] isMdpi evaluated as:", isMdpi);

      item.dataset.mdpiChecked = 'true';
      item.dataset.mdpiResult = isMdpi;

      if (isMdpi) {
        const refData = extractReferenceData(item);
        if (refData) {
          collectedMdpiReferences.push(refData);
          const key = refData.number || refData.text.slice(0, 50);
          uniqueMdpiReferences.add(key);
          console.log("[MDPI Filter] Added key to set. Set size:", uniqueMdpiReferences.size);
        } else {
          console.log("[MDPI Filter] Could not extract reference data for item:", item);
          const key = sanitize(textContent).trim().slice(0, 100);
          if (key) uniqueMdpiReferences.add(key);
        }
      }
      return isMdpi;
    };

    const extractReferenceData = (item) => {
      let fullText = '';
      let number = null;
      let link = null;
      const referenceStartRegex = /^\s*(\d+)\.\s*/;

      const linkElement = item.querySelector('a[href]');
      if (linkElement) {
        link = linkElement.href;
      }

      if (item.matches('span[aria-owns^="pdfjs_internal_id_"]')) {
        let currentSibling = item;
        const parts = [];
        while (currentSibling) {
          if (currentSibling.matches('span[aria-owns^="pdfjs_internal_id_"]') && currentSibling !== item) {
            break;
          }
          if (currentSibling.matches('span')) {
            const spanText = currentSibling.textContent || '';
            parts.unshift(spanText);
            const match = spanText.match(referenceStartRegex);
            if (match) {
              number = match[1];
              break;
            }
          } else if (currentSibling.tagName !== 'BR') {
            break;
          }
          currentSibling = currentSibling.previousElementSibling;
        }
        fullText = parts.join(' ').replace(/\s+/g, ' ').trim();
      } else {
        fullText = (item.textContent || '').replace(/\s+/g, ' ').trim();
        const match = fullText.match(referenceStartRegex);
        if (match) {
          number = match[1];
        }
        if (!link && item.querySelector('a[href]')) {
          link = item.querySelector('a[href]').href;
        }
      }

      if (!fullText) return null;

      return {
        number: number,
        text: fullText,
        link: link,
        element: item
      };
    };

    const isSearchSite = () => {
      if (!window.MDPIFilterDomains) {
        console.warn("[MDPI Filter] isSearchSite check skipped: domains not loaded.");
        return false;
      }
      const host = location.hostname;
      const path = location.pathname;
      for (const cfg of Object.values(domains)) {
        const matchHost = cfg.host
          ? host === cfg.host
          : cfg.hostRegex?.test(host);
        const matchPath = !cfg.path || cfg.path.test(path);
        if (matchHost && matchPath) {
          console.log(`[MDPI Filter] isSearchSite: Matched ${cfg.host || cfg.hostRegex}`);
          return true;
        }
      }
      console.log("[MDPI Filter] isSearchSite: No match");
      return false;
    };

    const updateBadgeAndReferences = () => {
      try {
        console.log("[MDPI Filter] updateBadgeAndReferences called.");
        const count = uniqueMdpiReferences.size;
        let referencesToSend = [];

        if (isSearchSite()) {
          console.log("[MDPI Filter] On search site, sending count 0 and no references.");
          chrome.runtime.sendMessage({ type: 'mdpiUpdate', count: 0, references: [] });
        } else {
          collectedMdpiReferences.sort((a, b) => {
            const numA = parseInt(a.number, 10);
            const numB = parseInt(b.number, 10);
            if (!isNaN(numA) && !isNaN(numB)) {
              return numA - numB;
            }
            if (!isNaN(numA)) return -1;
            if (!isNaN(numB)) return 1;
            return 0;
          });
          referencesToSend = collectedMdpiReferences.map(ref => ({
            number: ref.number,
            text: ref.text,
            link: ref.link
          }));
          console.log(`[MDPI Filter] Not on search site, sending count: ${count} and ${referencesToSend.length} references.`);
          chrome.runtime.sendMessage({ type: 'mdpiUpdate', count: count, references: referencesToSend });
        }

      } catch (error) {
        console.warn("[MDPI Filter] Could not send message to background (try/catch):", error.message, error);
      } finally {
        if (chrome.runtime.lastError) {
          console.warn("[MDPI Filter] chrome.runtime.lastError after sendMessage:", chrome.runtime.lastError.message || chrome.runtime.lastError);
        }
      }
    };

    function processSearchSites() {
      if (!window.MDPIFilterDomains) {
        console.warn("[MDPI Filter] processSearchSites skipped: domains not loaded.");
        return;
      }
      const host = location.hostname;
      for (const cfg of Object.values(domains)) {
        const matchHost = cfg.host
          ? host === cfg.host
          : cfg.hostRegex?.test(host);
        const matchPath = !cfg.path || cfg.path.test(location.pathname);
        if (!matchHost || !matchPath) continue;

        if (cfg.itemSelector && cfg.doiPattern) {
          document.querySelectorAll(cfg.itemSelector).forEach(item => {
            if (item.textContent.includes(cfg.doiPattern)) {
              styleSearch(item);
            }
          });

        } else if (cfg.itemSelector && cfg.htmlContains) {
          document.querySelectorAll(cfg.itemSelector).forEach(item => {
            if (item.innerHTML.includes(cfg.htmlContains)) {
              styleSearch(item);
            }
          });

        } else if (cfg.container) {
          document.querySelectorAll(cfg.container).forEach(row => {
            const rowText = row.textContent || '';
            const hasMdpiDoiText = rowText.includes(MDPI_DOI);
            const mdpiLink = row.querySelector(cfg.linkSelector);
            const hasLinkWithMdpiDoi = row.querySelector(`a[href*="${MDPI_DOI}"], a[data-doi*="${MDPI_DOI}"], a[data-article-id*="${MDPI_DOI}"]`);

            if (hasMdpiDoiText || mdpiLink || hasLinkWithMdpiDoi) {
              styleSearch(row);

              let titleContainer = null;
              const isScholar = cfg.host === 'scholar.google.com';

              if (isScholar) {
                titleContainer = row.querySelector('h3.gs_rt');
              } else {
                titleContainer = row.querySelector('.yuRUbf h3');
              }

              if (titleContainer) {
                titleContainer.querySelectorAll('a').forEach(styleLinkElement);
              } else if (!isScholar) {
                const primaryLink = row.querySelector('a[jsname="UWckNb"]') || row.querySelector('.yuRUbf a');
                styleLinkElement(primaryLink);
              }

              if (mdpiLink && (!titleContainer || !titleContainer.contains(mdpiLink))) {
                styleLinkElement(mdpiLink);
              }
            }
          });
        }
      }
    }

    const debouncedProcessCitedByEntries = window.debounce(() => {
      console.log("[MDPI Filter] Debounced processCitedByEntries running.");
      document.querySelectorAll('li.citedByEntry').forEach(item => {
        if (item.dataset.mdpiCitedByProcessed) return;

        if (item.textContent?.includes(MDPI_DOI)) {
          console.log("[MDPI Filter] Found MDPI citedBy entry:", item);
          styleSearch(item);
          const viewLink = item.querySelector('.extra-links a.getFTR__btn');
          if (viewLink) {
            styleLinkElement(viewLink);
          }
          item.dataset.mdpiCitedByProcessed = 'true';
        }
      });
    }, 300);

    function processCitedByEntries() {
      console.log("[MDPI Filter] Initial processCitedByEntries running.");
      document.querySelectorAll('li.citedByEntry').forEach(item => {
        if (item.dataset.mdpiCitedByProcessed) return;

        if (item.textContent?.includes(MDPI_DOI)) {
          console.log("[MDPI Filter] Found MDPI citedBy entry (initial):", item);
          styleSearch(item);
          const viewLink = item.querySelector('.extra-links a.getFTR__btn');
          if (viewLink) {
            styleLinkElement(viewLink);
          }
          item.dataset.mdpiCitedByProcessed = 'true';
        }
      });
    }

    function styleInlineFootnotes() {
      document.querySelectorAll('a[href*="#"]').forEach(a => {
        const href = a.getAttribute('href');
        const rid = a.dataset.xmlRid;
        let targetEl = null;
        let frag = null;

        if (rid) {
          targetEl = document.getElementById(rid);
        }
        if (!targetEl && href && href.includes('#')) {
          frag = href.slice(href.lastIndexOf('#') + 1);
          if (frag) {
            targetEl = document.getElementById(frag);
            if (!targetEl) {
              targetEl = document.getElementsByName(frag)[0];
            }
            if (!targetEl) {
              targetEl = document.querySelector(`a[id$="-${frag}"]`);
            }
            if (!targetEl && frag.startsWith('core-')) {
              const potentialId = frag.substring(5);
              targetEl = document.getElementById(potentialId);
            }
            if (!targetEl) {
              targetEl = document.querySelector(`li[data-bib-id="${frag}"]`);
            }
          }
        }
        if (!targetEl) return;

        let listItem = null;
        if (targetEl.matches(referenceListSelectors)) {
          listItem = targetEl;
        } else if (rid && targetEl.id === rid) {
          listItem = targetEl.querySelector('div.citation');
        } else {
          listItem = targetEl.closest(referenceListSelectors);
        }

        if (listItem && listItem.dataset.mdpiResult === 'true') {
          const sup = a.querySelector('sup');
          styleSup(sup || a);
        }
      });
    }

    function processAllReferences() {
      document.querySelectorAll(referenceListSelectors).forEach(item => {
        if (isMdpiReferenceItem(item)) {
          styleRef(item);
        }
      });
    }

    function processDirectMdpiLinks() {
      const mdpiArticleRegex = /^https?:\/\/www\.mdpi\.com\/\d{4}-\d{4}\/\d+\/\d+\/\d+(\/.*)?$/;
      document.querySelectorAll(`a[href^="https://www.mdpi.com/"]`).forEach(a => {
        const href = a.getAttribute('href');
        if (href && mdpiArticleRegex.test(href) && !a.closest(referenceListSelectors.split(',').map(s => s.trim() + '[style*="border"]').join(','))) {
          styleDirectLink(a);
        }
      });
    }

    function runAll(source = "initial") {
      console.log(`[MDPI Filter] runAll triggered by: ${source}`);
      document.querySelectorAll('[data-mdpi-checked], [data-mdpi-cited-by-processed]').forEach(el => {
        el.style.color = '';
        el.style.fontWeight = '';
        el.style.border = '';
        el.style.padding = '';
        el.style.display = '';
        delete el.dataset.mdpiChecked;
        delete el.dataset.mdpiResult;
        delete el.dataset.mdpiCitedByProcessed;
      });
      document.querySelectorAll('[style*="color: rgb(226, 33, 28)"]').forEach(el => {
        el.style.color = '';
        el.style.fontWeight = '';
        el.style.borderBottom = '';
        el.style.textDecoration = '';
        el.style.display = '';
      });

      uniqueMdpiReferences.clear();
      collectedMdpiReferences = [];

      try {
        if (!window.MDPIFilterDomains || !window.sanitize) {
          console.error("[MDPI Filter] runAll aborted: Dependencies (domains/sanitizer) not loaded.");
          return;
        }
        processSearchSites();
        processCitedByEntries();
        processAllReferences();
        styleInlineFootnotes();
        processDirectMdpiLinks();
        updateBadgeAndReferences();
      } catch (error) {
        console.error(`[MDPI Filter] Error during runAll (source: ${source}):`, error);
      } finally {
        console.log(`[MDPI Filter] runAll finished (source: ${source}). Final count in set: ${uniqueMdpiReferences.size}, Collected: ${collectedMdpiReferences.length}`);
      }
    }

    const debouncedRunAll = window.debounce(runAll, 500);

    function setupMainObserver() {
      const targetNode = document.body;
      if (!targetNode) {
        console.error("[MDPI Filter] Cannot find document.body to observe.");
        return;
      }

      console.log("[MDPI Filter] Setting up Main observer for document.body");

      const observerConfig = {
        childList: true,
        subtree: true
      };

      const observer = new MutationObserver((mutationsList, observer) => {
        let nodesAdded = false;
        for (const mutation of mutationsList) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            nodesAdded = true;
            break;
          }
        }

        if (nodesAdded) {
          console.log("[MDPI Filter] Main observer detected added nodes. Triggering debounced runAll.");
          debouncedRunAll("main observer");
        }
      });

      observer.observe(targetNode, observerConfig);
      console.log("[MDPI Filter] Main observer started.");
    }

    function setupCitedByObserver() {
      const targetNode = document.getElementById('cited-by__content');
      if (!targetNode) {
        console.log("[MDPI Filter] Cited By observer target '#cited-by__content' not found.");
        return;
      }

      console.log("[MDPI Filter] Setting up Cited By observer for:", targetNode);

      const observerConfig = {
        childList: true,
        subtree: true
      };

      const observer = new MutationObserver((mutationsList, observer) => {
        console.log("[MDPI Filter] Cited By observer detected mutations.");
        debouncedProcessCitedByEntries();
      });

      observer.observe(targetNode, observerConfig);
      console.log("[MDPI Filter] Cited By observer started.");
    }

    if (window.MDPIFilterDomains && window.sanitize) {
      console.log("[MDPI Filter] Dependencies loaded. Requesting initial runAll and setting up observers.");
      requestAnimationFrame(() => {
        console.log("[MDPI Filter] Running initial runAll via requestAnimationFrame.");
        runAll("initial load");
        setupCitedByObserver();
        setupMainObserver();
      });
    } else {
      console.error("[MDPI Filter] Initial run/observer setup skipped: Dependencies not loaded.");
    }

    window.addEventListener('hashchange', () => {
      console.log("[MDPI Filter] hashchange detected. Requesting runAll.");
      requestAnimationFrame(() => {
        console.log("[MDPI Filter] Running runAll via requestAnimationFrame after hashchange.");
        runAll("hashchange");
      });
    });

    console.log("[MDPI Filter] Initial setup complete, listeners/observers added.");

  });

} else {
  console.log("[MDPI Filter] Injection prevented, mdpiFilterInjected was already true.");
}

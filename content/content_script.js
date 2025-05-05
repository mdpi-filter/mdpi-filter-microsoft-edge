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
    'li:has(a[name^="bbib"])'
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
      item.style.border  = highlightStyle;
      item.style.padding = '5px';
      const label = item.querySelector('.label') || item.firstChild;
      if (label?.style) {
        label.style.color      = '#E2211C';
        label.style.fontWeight = 'bold';
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
      if (item.dataset.mdpiChecked) return item.dataset.mdpiResult === 'true';

      console.log("[MDPI Filter] Checking item:", item);
      const textContent = item.textContent || '';
      const innerHTML = item.innerHTML || '';
      console.log("[MDPI Filter] Text content:", JSON.stringify(textContent));

      const hasMdpiLink = item.querySelector(
        `a[href*="${MDPI_DOMAIN}"], a[href*="${MDPI_DOI}"], a[data-track-item_id*="${MDPI_DOI}"]`
      );
      const hasMdpiText = textContent.includes(MDPI_DOI);
      const journalRegex = /\b(Nutrients|Int J Mol Sci|IJMS|Molecules)\b/i;
      const hasMdpiJournal = journalRegex.test(innerHTML);
      console.log(`[MDPI Filter] Regex ${journalRegex} test result on innerHTML:`, hasMdpiJournal);

      const isMdpi = !!(hasMdpiLink || hasMdpiText || hasMdpiJournal);
      console.log("[MDPI Filter] isMdpi evaluated as:", isMdpi);

      item.dataset.mdpiChecked = 'true';
      item.dataset.mdpiResult = isMdpi;

      if (isMdpi) {
        const key = sanitize(textContent).trim().slice(0, 100);
        console.log("[MDPI Filter] Generated key:", JSON.stringify(key));
        if (key) {
          uniqueMdpiReferences.add(key);
          console.log("[MDPI Filter] Added key to set. Set size:", uniqueMdpiReferences.size);
        } else {
          console.log("[MDPI Filter] Key was empty, not added to set.");
        }
      }
      return isMdpi;
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

    const updateBadgeCount = () => {
      try {
        console.log("[MDPI Filter] updateBadgeCount called.");
        if (isSearchSite()) {
          console.log("[MDPI Filter] On search site, sending count 0.");
          chrome.runtime.sendMessage({ type: 'mdpiCount', count: 0 });
          return;
        }

        const count = uniqueMdpiReferences.size;
        console.log(`[MDPI Filter] Not on search site, sending count: ${count}`);
        chrome.runtime.sendMessage({ type: 'mdpiCount', count: count });

      } catch (error) {
        console.warn("[MDPI Filter] Could not send message to background (try/catch):", error.message, error);
      } finally {
        if (chrome.runtime.lastError) {
          console.warn("[MDPI Filter] chrome.runtime.lastError after sendMessage:", chrome.runtime.lastError.message || chrome.runtime.lastError);
        }
      }
    };
    // ---

    // --- Processing Functions ---
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

    // Debounce the function to avoid rapid calls from MutationObserver
    const debouncedProcessCitedByEntries = window.debounce(() => {
        console.log("[MDPI Filter] Debounced processCitedByEntries running.");
        document.querySelectorAll('li.citedByEntry').forEach(item => {
            // Add a check to prevent re-processing already styled items
            if (item.dataset.mdpiCitedByProcessed) return;

            // Check for the MDPI DOI prefix within the list item's text content
            if (item.textContent?.includes(MDPI_DOI)) {
                console.log("[MDPI Filter] Found MDPI citedBy entry:", item);
                // Apply the search styling (handles highlight/hide mode)
                styleSearch(item);
                // Optionally, style the link inside if needed, similar to processSearchSites
                // For example, find the 'View' link and style it:
                const viewLink = item.querySelector('.extra-links a.getFTR__btn');
                if (viewLink) {
                    styleLinkElement(viewLink); // Use the existing link styling function
                }
                // Mark as processed
                item.dataset.mdpiCitedByProcessed = 'true';
            }
        });
    }, 300); // 300ms debounce delay

    // Keep the original function for the initial run
    function processCitedByEntries() {
      console.log("[MDPI Filter] Initial processCitedByEntries running.");
      document.querySelectorAll('li.citedByEntry').forEach(item => {
        // Add a check to prevent re-processing already styled items
        if (item.dataset.mdpiCitedByProcessed) return;

        // Check for the MDPI DOI prefix within the list item's text content
        if (item.textContent?.includes(MDPI_DOI)) {
          console.log("[MDPI Filter] Found MDPI citedBy entry (initial):", item);
          // Apply the search styling (handles highlight/hide mode)
          styleSearch(item);
          // Optionally, style the link inside if needed, similar to processSearchSites
          // For example, find the 'View' link and style it:
          const viewLink = item.querySelector('.extra-links a.getFTR__btn');
          if (viewLink) {
             styleLinkElement(viewLink); // Use the existing link styling function
          }
          // Mark as processed
          item.dataset.mdpiCitedByProcessed = 'true';
        }
      });
    }

    function styleInlineFootnotes() {
      document.querySelectorAll('a[href*="#"]').forEach(a => {
        const href = a.getAttribute('href');
        const rid = a.dataset.xmlRid;
        let targetEl = null;

        if (rid) {
          targetEl = document.getElementById(rid);
        }
        if (!targetEl && href && href.includes('#')) {
          const frag = href.slice(href.lastIndexOf('#') + 1);
          if (frag) {
            targetEl = document.getElementById(frag) || document.getElementsByName(frag)[0];
            if (!targetEl) {
              targetEl = document.querySelector(`a[id$="-${frag}"]`);
            }
            if (!targetEl && frag.startsWith('core-')) {
              const potentialId = frag.substring(5);
              targetEl = document.getElementById(potentialId);
            }
          }
        }
        if (!targetEl) return;

        let listItem = null;
        if (rid && targetEl.id === rid) {
          listItem = targetEl.querySelector('div.citation');
        } else if (targetEl.matches(referenceListSelectors)) {
          listItem = targetEl;
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
    // ---

    function runAll(source = "initial") {
      console.log(`[MDPI Filter] runAll triggered by: ${source}`);
      uniqueMdpiReferences.clear();
      document.querySelectorAll('[data-mdpi-checked]').forEach(el => {
        delete el.dataset.mdpiChecked;
        delete el.dataset.mdpiResult;
      });
      // Clear the processed flag when runAll executes
      document.querySelectorAll('[data-mdpi-cited-by-processed]').forEach(el => {
        delete el.dataset.mdpiCitedByProcessed;
      });

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
        updateBadgeCount();
      } catch (error) {
        console.error(`[MDPI Filter] Error during runAll (source: ${source}):`, error);
      } finally {
        console.log(`[MDPI Filter] runAll finished (source: ${source}). Final count in set: ${uniqueMdpiReferences.size}`);
      }
    }

    // --- Observer Setup ---
    function setupCitedByObserver() {
        const targetNode = document.getElementById('cited-by__content');
        if (!targetNode) {
            console.log("[MDPI Filter] Cited By observer target '#cited-by__content' not found.");
            // Optionally retry after a delay
            // setTimeout(setupCitedByObserver, 1000);
            return;
        }

        console.log("[MDPI Filter] Setting up Cited By observer for:", targetNode);

        const observerConfig = {
            childList: true, // Watch for addition/removal of children (like the <li> elements)
            subtree: true    // Watch descendants as well
        };

        const observer = new MutationObserver((mutationsList, observer) => {
            // We only care that *something* changed inside, so we run the debounced check
            console.log("[MDPI Filter] Cited By observer detected mutations.");
            debouncedProcessCitedByEntries();
        });

        observer.observe(targetNode, observerConfig);
        console.log("[MDPI Filter] Cited By observer started.");

        // Optional: Disconnect observer if needed later, e.g., on page unload
        // window.addEventListener('beforeunload', () => observer.disconnect());
    }
    // ---

    // Initial run - Use requestAnimationFrame
    if (window.MDPIFilterDomains && window.sanitize) {
      console.log("[MDPI Filter] Dependencies loaded. Requesting initial runAll.");
      requestAnimationFrame(() => {
        console.log("[MDPI Filter] Running initial runAll via requestAnimationFrame.");
        runAll("initial load");
        // Setup the observer AFTER the initial processing run
        setupCitedByObserver();
      });
    } else {
      console.error("[MDPI Filter] Initial runAll skipped: Dependencies (domains/sanitizer) not loaded.");
    }

    // Re-run on hash changes - Use requestAnimationFrame
    window.addEventListener('hashchange', () => {
      console.log("[MDPI Filter] hashchange detected. Requesting runAll.");
      requestAnimationFrame(() => {
        console.log("[MDPI Filter] Running runAll via requestAnimationFrame after hashchange.");
        runAll("hashchange");
        // Re-setup observer in case the target element was replaced during navigation
        // Note: This might create multiple observers if not handled carefully.
        // A more robust solution might involve checking if an observer already exists.
        setupCitedByObserver();
      });
    });

    console.log("[MDPI Filter] Initial setup complete, hashchange listener added.");

  }); // End storage.sync.get

} else {
  console.log("[MDPI Filter] Injection prevented, mdpiFilterInjected was already true.");
} // End of injection check

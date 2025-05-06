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
      // Style the main item (the one identified by isMdpiReferenceItem, likely the DOI span)
      item.style.border = highlightStyle;
      item.style.padding = '5px';
      // Optional: Style label/first child if applicable (might not be relevant for these spans)
      // const label = item.querySelector('.label') || item.firstChild;
      // if (label?.style) { ... }

      // --- Work backwards to style preceding spans of the same reference ---
      let currentSibling = item.previousElementSibling;
      const referenceStartRegex = /^\s*\d+\.\s*/; // Regex to detect start of a numbered reference

      while (currentSibling) {
        // Stop condition 1: Found the end of the previous reference (another DOI span)
        if (currentSibling.matches('span[aria-owns^="pdfjs_internal_id_"]')) {
          break;
        }

        // Check if the current sibling is a span
        if (currentSibling.matches('span')) {
          // Stop condition 2: Found what looks like the start of the *current* reference number
          if (referenceStartRegex.test(currentSibling.textContent || '')) {
            // Style this starting span too, then break
            currentSibling.style.border = highlightStyle;
            currentSibling.style.padding = '5px';
            break; // Stop after styling the starting number
          } else {
            // It's a preceding span of the current reference, style it
            currentSibling.style.border = highlightStyle;
            currentSibling.style.padding = '5px';
          }
        } else if (currentSibling.tagName !== 'BR') {
          // If it's not a span or a BR, it's likely a boundary, stop.
          break;
        }
        // Move to the previous sibling
        currentSibling = currentSibling.previousElementSibling;
      }
      // --- End backwards traversal ---
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
        let frag = null; // Define frag here

        if (rid) {
          targetEl = document.getElementById(rid);
        }
        if (!targetEl && href && href.includes('#')) {
          frag = href.slice(href.lastIndexOf('#') + 1); // Assign frag here
          if (frag) {
            targetEl = document.getElementById(frag); // Check ID directly first
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
            // --- Wiley Specific Check ---
            if (!targetEl) {
              targetEl = document.querySelector(`li[data-bib-id="${frag}"]`);
            }
            // --- End Wiley Specific Check ---
          }
        }
        if (!targetEl) return;

        let listItem = null;
        // Adjust logic to correctly identify the list item
        if (targetEl.matches(referenceListSelectors)) { // Check if targetEl itself matches any selector (including the new span selector)
            listItem = targetEl;
        } else if (rid && targetEl.id === rid) { // Keep existing logic
          listItem = targetEl.querySelector('div.citation');
        } else { // Fallback to closest ancestor matching the selectors
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
      // --- Reset state ---
      // Clear previously marked items (important for re-runs)
      document.querySelectorAll('[data-mdpi-checked], [data-mdpi-cited-by-processed]').forEach(el => {
        el.style.border = ''; // Reset border
        el.style.padding = ''; // Reset padding
        el.style.display = ''; // Reset display (for hide mode)
        // Reset specific styles applied by styleSup, styleRef, styleDirectLink, styleLinkElement if necessary
        // This might require more specific resetting depending on exact styles applied
        delete el.dataset.mdpiChecked;
        delete el.dataset.mdpiResult;
        delete el.dataset.mdpiCitedByProcessed;
      });
       // Reset styles on previously styled links/sups outside of list items if needed
       document.querySelectorAll('[style*="color: rgb(226, 33, 28)"]').forEach(el => {
           el.style.color = '';
           el.style.fontWeight = '';
           el.style.borderBottom = '';
           el.style.textDecoration = '';
           el.style.display = ''; // Reset display if it was changed
       });

      uniqueMdpiReferences.clear(); // Clear the set for a fresh count
      // --- End Reset state ---


      try {
        if (!window.MDPIFilterDomains || !window.sanitize) {
          console.error("[MDPI Filter] runAll aborted: Dependencies (domains/sanitizer) not loaded.");
          return;
        }
        processSearchSites();
        processCitedByEntries(); // Process specific 'citedBy' sections
        processAllReferences();  // Process general reference lists (including PDF viewer spans)
        styleInlineFootnotes();  // Style links pointing to MDPI refs
        processDirectMdpiLinks(); // Style direct links to MDPI articles
        updateBadgeCount();
      } catch (error) {
        console.error(`[MDPI Filter] Error during runAll (source: ${source}):`, error);
      } finally {
        console.log(`[MDPI Filter] runAll finished (source: ${source}). Final count in set: ${uniqueMdpiReferences.size}`);
      }
    }

    // --- Observer Setup ---

    // Debounced version of runAll for the main observer
    const debouncedRunAll = window.debounce(runAll, 500); // Use a slightly longer debounce (500ms)

    // Observer for general page mutations (e.g., PDF viewer loading content)
    function setupMainObserver() {
        const targetNode = document.body; // Watch the whole body for broad compatibility
        if (!targetNode) {
            console.error("[MDPI Filter] Cannot find document.body to observe.");
            return;
        }

        console.log("[MDPI Filter] Setting up Main observer for document.body");

        const observerConfig = {
            childList: true, // Watch for added/removed nodes
            subtree: true    // Watch descendants
        };

        const observer = new MutationObserver((mutationsList, observer) => {
            // Check if nodes were added, indicating potential content loading
            let nodesAdded = false;
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    nodesAdded = true;
                    break;
                }
            }

            if (nodesAdded) {
                console.log("[MDPI Filter] Main observer detected added nodes. Triggering debounced runAll.");
                debouncedRunAll("main observer"); // Pass source for logging
            }
        });

        observer.observe(targetNode, observerConfig);
        console.log("[MDPI Filter] Main observer started.");

        // Optional: Disconnect observer if needed later
        // window.addEventListener('beforeunload', () => observer.disconnect());
    }


    // Observer specifically for Wiley's 'Cited By' section (keep this)
    function setupCitedByObserver() {
        const targetNode = document.getElementById('cited-by__content');
        if (!targetNode) {
            console.log("[MDPI Filter] Cited By observer target '#cited-by__content' not found.");
            return; // Don't retry indefinitely, it might just not exist on the page
        }
        // ... (rest of setupCitedByObserver remains the same) ...
        console.log("[MDPI Filter] Setting up Cited By observer for:", targetNode);

        const observerConfig = {
            childList: true, // Watch for addition/removal of children (like the <li> elements)
            subtree: true    // Watch descendants as well
        };

        const observer = new MutationObserver((mutationsList, observer) => {
            // We only care that *something* changed inside, so we run the debounced check
            console.log("[MDPI Filter] Cited By observer detected mutations.");
            debouncedProcessCitedByEntries(); // Use the specific debounced function for this section
        });

        observer.observe(targetNode, observerConfig);
        console.log("[MDPI Filter] Cited By observer started.");
    }
    // ---

    // Initial run & Observer Activation
    if (window.MDPIFilterDomains && window.sanitize) {
      console.log("[MDPI Filter] Dependencies loaded. Requesting initial runAll and setting up observers.");
      requestAnimationFrame(() => {
        console.log("[MDPI Filter] Running initial runAll via requestAnimationFrame.");
        runAll("initial load");
        // Setup observers AFTER the initial processing run
        setupCitedByObserver(); // Setup the specific observer first
        setupMainObserver();    // Then setup the general observer
      });
    } else {
      console.error("[MDPI Filter] Initial run/observer setup skipped: Dependencies not loaded.");
    }

    // Re-run on hash changes (keep this, might be relevant for some SPAs)
    window.addEventListener('hashchange', () => {
      console.log("[MDPI Filter] hashchange detected. Requesting runAll.");
      requestAnimationFrame(() => {
        console.log("[MDPI Filter] Running runAll via requestAnimationFrame after hashchange.");
        runAll("hashchange");
        // Re-setup observers might be needed if the page structure changes drastically,
        // but let's rely on the main observer for now unless issues arise.
        // setupCitedByObserver();
        // setupMainObserver(); // Avoid re-adding main observer if it's already on body
      });
    });

    console.log("[MDPI Filter] Initial setup complete, listeners/observers added.");

  }); // End storage.sync.get

} else {
  console.log("[MDPI Filter] Injection prevented, mdpiFilterInjected was already true.");
} // End of injection check

// content/content_script.js

if (!window.mdpiFilterInjected) {
  window.mdpiFilterInjected = true;
  console.log("[MDPI Filter] Content script executing (mdpiFilterInjected set).");

  // --- Check for dependencies early ---
  if (typeof window.MDPIFilterDomains === 'undefined') {
      console.error("[MDPI Filter] CRITICAL: window.MDPIFilterDomains is undefined. domains.js might not have loaded correctly.");
      // Optionally, prevent further execution if domains are essential
      // return; // Or handle gracefully later
  }
  if (typeof window.sanitize === 'undefined') {
      console.error("[MDPI Filter] CRITICAL: window.sanitize is undefined. sanitizer.js might not have loaded correctly.");
      // Optionally, prevent further execution
      // return;
  }
  // ---

  // --- Constants, Selectors, State ---
  const MDPI_DOMAIN = 'mdpi.com';
  const MDPI_DOI    = '10.3390';
  // Assign ONLY if defined, otherwise use an empty object to prevent errors later
  const domains     = window.MDPIFilterDomains || {};
  const sanitize    = window.sanitize || (html => html); // Provide fallback if needed

  const uniqueMdpiReferences = new Set();
  const referenceListSelectors = [
    // General structure selectors
    'li.c-article-references__item',
    'div.References p.ReferencesCopy1',
    'li.html-x',
    'li.html-xx',
    'div.citation',
    'div.reference',
    'li.separated-list-item', // EuropePMC search results

    // Selectors based on LI having specific IDs
    'li[id^="CR"]',
    'li[id^="ref-"]', // Matches li id="ref-something"
    'li[id^="reference-"]',

    // Selectors based on specific inner element IDs/names (like ScienceDirect)
    'li:has(> span > a[id^="ref-id-"])', // Matches li > span > a id="ref-id-something"
    'li:has(a[name^="bbib"])' // Matches li containing a name="bbib..." (alternative for SD)

  ].join(',');
  // ---

  chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
    console.log("[MDPI Filter] Mode:", mode);

    const highlightStyle = '2px solid red';

    // A: Hide or highlight a search‐result element
    const styleSearch = el => {
      if (!el) return;
      if (mode === 'hide') el.style.display = 'none';
      else {
        el.style.border  = highlightStyle;
        el.style.padding = '5px';
      }
    };

    // B: Color an inline footnote (<sup> or <a>) red
    const styleSup = supOrA => {
      supOrA.style.color      = '#E2211C';
      supOrA.style.fontWeight = 'bold';
    };

    // C: Outline an entry in a reference list
    const styleRef = item => {
      item.style.border  = highlightStyle;
      item.style.padding = '5px';
      const label = item.querySelector('.label') || item.firstChild;
      if (label?.style) {
        label.style.color      = '#E2211C';
        label.style.fontWeight = 'bold';
      }
    };

    // D: Style direct links to MDPI articles - Target inner element like H3
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

    // D: Style a single link element with red color and dotted underline
    const styleLinkElement = link => {
      if (!link) return;
      link.style.color = '#E2211C';
      link.style.borderBottom = '1px dotted #E2211C';
      link.style.textDecoration = 'none';
      if (window.getComputedStyle(link).display === 'inline') {
        link.style.display = 'inline-block';
      }
    };

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
      // Add check inside isSearchSite as well
      if (!window.MDPIFilterDomains) {
          console.warn("[MDPI Filter] isSearchSite check skipped: domains not loaded.");
          return false;
      }
      const host = location.hostname;
      const path = location.pathname;
      // Use the local 'domains' variable which has the fallback
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
        // --- DEBUGGING: Log errors if sending fails ---
        console.warn("[MDPI Filter] Could not send message to background (try/catch):", error.message, error);
      } finally {
        // --- DEBUGGING: Check chrome.runtime.lastError ---
        if (chrome.runtime.lastError) {
          console.warn("[MDPI Filter] chrome.runtime.lastError after sendMessage:", chrome.runtime.lastError.message || chrome.runtime.lastError);
        }
      }
    };

    function processSearchSites() {
      // Add check here too for safety
      if (!window.MDPIFilterDomains) {
          console.warn("[MDPI Filter] processSearchSites skipped: domains not loaded.");
          return;
      }
      const host = location.hostname;
      // Use the local 'domains' variable
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

    function runAll(source = "initial") { // Add source parameter for logging
      console.log(`[MDPI Filter] runAll triggered by: ${source}`);
      uniqueMdpiReferences.clear();
      // Clear data attributes before re-processing
      document.querySelectorAll('[data-mdpi-checked]').forEach(el => {
        delete el.dataset.mdpiChecked;
        delete el.dataset.mdpiResult;
      });

      try {
        // Check dependencies again before running processing functions
        if (!window.MDPIFilterDomains || !window.sanitize) {
             console.error("[MDPI Filter] runAll aborted: Dependencies (domains/sanitizer) not loaded.");
             return; // Stop runAll if dependencies are missing
        }
        processSearchSites();
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

    // Initial run
    // Check dependencies before initial run
    if (window.MDPIFilterDomains && window.sanitize) {
        console.log("[MDPI Filter] Dependencies loaded. Executing initial runAll.");
        // Use setTimeout for initial run too, to ensure DOM is fully ready
        setTimeout(() => runAll("initial load"), 100); // Small delay for initial run
    } else {
        console.error("[MDPI Filter] Initial runAll skipped: Dependencies (domains/sanitizer) not loaded.");
    }

    // Re-run on hash changes, with a delay
    let hashChangeTimeout;
    window.addEventListener('hashchange', () => {
      console.log("[MDPI Filter] hashchange detected.");
      // Clear any pending timeout from previous rapid hash changes
      clearTimeout(hashChangeTimeout);
      // Set a new timeout to run after a short delay
      hashChangeTimeout = setTimeout(() => {
          console.log("[MDPI Filter] Running runAll after hashchange delay.");
          runAll("hashchange"); // Pass source
      }, 150); // Delay execution slightly (e.g., 150ms)
    });

    console.log("[MDPI Filter] Initial setup complete, hashchange listener added.");

  }); // End storage.sync.get

} else {
  console.log("[MDPI Filter] Injection prevented, mdpiFilterInjected was already true.");
} // End of injection check

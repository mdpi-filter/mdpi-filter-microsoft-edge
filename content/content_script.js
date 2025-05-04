// content/content_script.js

// Prevent multiple injections/executions in the same context
if (typeof window.mdpiFilterInjected === 'undefined') {
  window.mdpiFilterInjected = true;

  const MDPI_DOMAIN = 'mdpi.com';
  const MDPI_DOI    = '10.3390';
  const domains     = window.MDPIFilterDomains;
  const debounce    = window.debounce;
  const sanitize    = window.sanitize; // Ensure sanitizer is available

  // Store unique identifiers for MDPI references found
  const uniqueMdpiReferences = new Set();

  // Common selectors for reference list items - Made more specific
  const referenceListSelectors = [
    'li.c-article-references__item',    // Nature, BioMed Central, etc.
    'div.References p.ReferencesCopy1', // Some reference styles
    'li.html-x',                        // MDPI article reference items (older style?)
    'li.html-xx',                       // MDPI article reference items (newer style?)
    'div.citation',                     // Common citation container class
    'div.reference',                    // Common reference container class
    'li.separated-list-item',           // EuropePMC search results
    'li[id^="CR"]',                     // Common ID pattern (e.g., PMC, TandF)
    'li[id^="ref-"]',                   // Common ID pattern
    'li[id^="reference-"]'              // Common ID pattern
    // Removed 'ol > li', 'ul > li' as they were too general
  ].join(',');

  // Retrieve user preference (default = highlight)
  chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
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
      // Try to find the main title element (often H3 on search results)
      const titleElement = link.querySelector('h3');
      // Apply style to the title element if found, otherwise fallback to the link itself
      const targetElement = titleElement || link;
      targetElement.style.color = '#E2211C'; // Use the same red color
      // Apply underline only to the specific target, not the whole block link
      targetElement.style.borderBottom = '1px dotted #E2211C';
      // Ensure the target is displayed in a way that border-bottom works as expected
      if (targetElement !== link) {
         // If we styled an inner element, ensure the parent link doesn't have conflicting underlines
         link.style.textDecoration = 'none'; // Remove default underline from parent <a> if needed
      }
       // Ensure the target element is at least inline-block for border-bottom to potentially show correctly
       if (window.getComputedStyle(targetElement).display === 'inline') {
           targetElement.style.display = 'inline-block';
       }
    };

    // Function to check if a list item element is MDPI and add to set
    const isMdpiReferenceItem = (item) => {
      if (!item) return false;
      const hasMdpiLink = item.querySelector(
        `a[href*="${MDPI_DOMAIN}"], a[href*="${MDPI_DOI}"], a[data-track-item_id*="${MDPI_DOI}"]`
      );
      const textContent = item.textContent || '';
      const hasMdpiText = textContent.includes(MDPI_DOI); // Check text content for DOI
      // Check for common MDPI journal names (case-sensitive), using word boundaries
      const hasMdpiJournal = /\b(Nutrients|Int J Mol Sci|IJMS)\b/.test(textContent); // Removed 'i' flag for case-sensitivity

      const isMdpi = hasMdpiLink || hasMdpiText || hasMdpiJournal;

      if (isMdpi) {
        // Use sanitized text content as a unique key
        const key = sanitize(textContent).trim().slice(0, 100); // Use first 100 chars of sanitized text
        if (key) {
            uniqueMdpiReferences.add(key);
        }
      }
      return isMdpi;
    };

    // Function to check if the current page is one of the configured search sites
    const isSearchSite = () => {
      const host = location.hostname;
      const path = location.pathname;
      for (const cfg of Object.values(domains)) {
        const matchHost = cfg.host
          ? host === cfg.host
          : cfg.hostRegex?.test(host);
        const matchPath = !cfg.path || cfg.path.test(path);
        if (matchHost && matchPath) {
          return true; // It's a configured search site
        }
      }
      return false; // Not a configured search site
    };

    // Function to update badge count
    const updateBadgeCount = () => {
      try { // Add try block here
        // Only update badge if NOT on a configured search site
        if (isSearchSite()) {
             // Explicitly clear badge on search sites by sending 0
             chrome.runtime.sendMessage({ type: 'mdpiCount', count: 0 });
             return;
        }

        const count = uniqueMdpiReferences.size;
        // Send count to background script
        chrome.runtime.sendMessage({ type: 'mdpiCount', count: count });

      } catch (error) {
          // Ignore errors, context might be invalidated during navigation/reload
          // console.warn("MDPI Filter: Could not send message to background:", error.message);
      }
    };

    // 1. Process search‐site results *only* on the four engines
    function processSearchSites() {
      const host = location.hostname;
      for (const cfg of Object.values(domains)) {
        const matchHost = cfg.host
          ? host === cfg.host
          : cfg.hostRegex?.test(host);
        const matchPath = !cfg.path || cfg.path.test(location.pathname);
        if (!matchHost || !matchPath) continue;

        if (cfg.itemSelector && cfg.doiPattern) {
          // PubMed style: look for DOI in text
          document.querySelectorAll(cfg.itemSelector).forEach(item => {
            if (item.textContent.includes(cfg.doiPattern)) {
              styleSearch(item);
              // Note: Search results are styled but not counted towards badge
            }
          });

        } else if (cfg.itemSelector && cfg.htmlContains) {
          // EuropePMC style: look for HTML snippet
          document.querySelectorAll(cfg.itemSelector).forEach(item => {
            if (item.innerHTML.includes(cfg.htmlContains)) {
              styleSearch(item);
              // Note: Search results are styled but not counted towards badge
            }
          });

        } else if (cfg.container && cfg.linkSelector) {
          // Google / Scholar style: hide row if MDPI link found
          document
            .querySelectorAll(`${cfg.container} ${cfg.linkSelector}`)
            .forEach(a => {
              const row = a.closest(cfg.container);
              styleSearch(row);
              // Note: Search results are styled but not counted towards badge
            });
        }
      }
    }

    // 2. Process inline footnotes everywhere
    function processInlineCitations() {
      document.querySelectorAll('a[href*="#"]').forEach(a => {
        const href = a.getAttribute('href');
        if (!href || !href.includes('#')) return;
        const frag = href.slice(href.lastIndexOf('#') + 1);
        if (!frag) return;

        const refEl = document.getElementById(frag) || document.getElementsByName(frag)[0];
        if (!refEl) return;

        // Find the ancestor list item using the common selectors
        const listItem = refEl.closest(referenceListSelectors);

        // Check the list item (not just the target element) for MDPI indicators
        // This will also add the item's key to uniqueMdpiReferences if it's MDPI
        if (isMdpiReferenceItem(listItem)) {
          const sup = a.querySelector('sup');
          styleSup(sup || a);
        }
      });
    }

    // 3. Process reference‐list entries everywhere
    function processReferenceLists() {
      document.querySelectorAll(referenceListSelectors).forEach(item => {
        // Use the common check function
        // This will also add the item's key to uniqueMdpiReferences if it's MDPI
        if (isMdpiReferenceItem(item)) {
          styleRef(item);
        }
      });
    }

    // 4. Process direct links to MDPI articles everywhere
    function processDirectMdpiLinks() {
      // Regex to match mdpi.com URLs with typical article path structure (e.g., /issn/volume/issue/article)
      const mdpiArticleRegex = /^https?:\/\/www\.mdpi\.com\/\d{4}-\d{4}\/\d+\/\d+\/\d+(\/.*)?$/;
      document.querySelectorAll(`a[href^="https://www.mdpi.com/"]`).forEach(a => {
        const href = a.getAttribute('href');
        // Check if the link matches the article pattern AND is not already inside a styled reference item
        if (href && mdpiArticleRegex.test(href) && !a.closest(referenceListSelectors.split(',').map(s => s.trim() + '[style*="border"]').join(','))) {
            styleDirectLink(a); // Pass the <a> tag to the styling function
            // Note: Direct links are styled but not counted towards the badge count
        }
      });
    }

    // Run all processing functions
    function runAll() {
      uniqueMdpiReferences.clear(); // Clear set before reprocessing
      processSearchSites(); // This already checks domains internally
      processInlineCitations();
      processReferenceLists();
      processDirectMdpiLinks(); // Add processing for direct links
      updateBadgeCount(); // Update badge after processing
    }

    // Initial + dynamic (SPA/infinite scroll, etc.)
    runAll(); // Initial run
    new MutationObserver(debounce(() => {
        runAll(); // Rerun all checks and update badge
    })).observe(document.body, {
      childList: true,
      subtree:   true
    });
  });

} // End of injection check

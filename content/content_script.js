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

  // Common selectors for reference list items - Refined
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

    // D: Style a single link element with red color and dotted underline
    const styleLinkElement = link => {
      if (!link) return;
      link.style.color = '#E2211C';
      link.style.borderBottom = '1px dotted #E2211C';
      link.style.textDecoration = 'none';
      // Ensure display allows border-bottom
      if (window.getComputedStyle(link).display === 'inline') {
        link.style.display = 'inline-block'; // Use inline-block for border
      }
    };

    // Function to check if a list item element is MDPI and add to set
    const isMdpiReferenceItem = (item) => {
      if (!item) return false;
      // Return stored result if already processed in this runAll cycle
      if (item.dataset.mdpiChecked) return item.dataset.mdpiResult === 'true';

      // --- DEBUGGING START ---
      console.log("[MDPI Filter] Checking item:", item);
      const textContent = item.textContent || '';
      const innerHTML = item.innerHTML || '';
      console.log("[MDPI Filter] Text content:", JSON.stringify(textContent));
      // --- DEBUGGING END ---

      const hasMdpiLink = item.querySelector(
        `a[href*="${MDPI_DOMAIN}"], a[href*="${MDPI_DOI}"], a[data-track-item_id*="${MDPI_DOI}"]`
      );
      const hasMdpiText = textContent.includes(MDPI_DOI);
      const journalRegex = /\b(Nutrients|Int J Mol Sci|IJMS|Molecules)\b/i;
      const hasMdpiJournal = journalRegex.test(innerHTML);
      console.log(`[MDPI Filter] Regex ${journalRegex} test result on innerHTML:`, hasMdpiJournal);

      const isMdpi = !!(hasMdpiLink || hasMdpiText || hasMdpiJournal);
      console.log("[MDPI Filter] isMdpi evaluated as:", isMdpi);

      // Mark as checked and store result for this runAll cycle
      item.dataset.mdpiChecked = 'true';
      item.dataset.mdpiResult = isMdpi; // Store boolean as string 'true'/'false'

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
      // Ensure we return the boolean result
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
          // --- DEBUGGING: Log which domain matched ---
          console.log(`[MDPI Filter] isSearchSite: Matched ${cfg.host || cfg.hostRegex}`);
          return true; // It's a configured search site
        }
      }
      // --- DEBUGGING: Log if no match ---
      console.log("[MDPI Filter] isSearchSite: No match");
      return false; // Not a configured search site
    };

    // Function to update badge count
    const updateBadgeCount = () => {
      try { // Add try block here
        console.log("[MDPI Filter] updateBadgeCount called."); // Log entry
        // Only update badge if NOT on a configured search site
        if (isSearchSite()) {
             console.log("[MDPI Filter] On search site, sending count 0."); // Log search site case
             chrome.runtime.sendMessage({ type: 'mdpiCount', count: 0 });
             return;
        }

        const count = uniqueMdpiReferences.size;
        console.log(`[MDPI Filter] Not on search site, sending count: ${count}`); // Log non-search site case
        // Send count to background script
        chrome.runtime.sendMessage({ type: 'mdpiCount', count: count });

      } catch (error) {
          // --- DEBUGGING: Log errors if sending fails ---
          console.warn("[MDPI Filter] Could not send message to background:", error.message, error); // Log the full error
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
          // PubMed style (on pubmed.ncbi.nlm.nih.gov): look for DOI in text
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

        } else if (cfg.container) {
          // Google / Scholar style:
          document.querySelectorAll(cfg.container).forEach(row => {
            const rowText = row.textContent || ''; // Cache text content

            // Check 1: Does the row contain the MDPI DOI text?
            const hasMdpiDoiText = rowText.includes(MDPI_DOI);
            // Check 2: Does the row contain a direct MDPI link?
            const mdpiLink = row.querySelector(cfg.linkSelector); // 'a[href*="mdpi.com"]'
            // Check 3: Does the row contain any link with the MDPI DOI in its href or a data attribute?
            const hasLinkWithMdpiDoi = row.querySelector(`a[href*="${MDPI_DOI}"], a[data-doi*="${MDPI_DOI}"], a[data-article-id*="${MDPI_DOI}"]`);
            // REMOVED Check 4: Text mention "MDPI" check was causing false positives
            // const hasMdpiMention = /MDPI/i.test(rowText);

            // Condition: Style if any of the reliable checks pass (DOI text, direct MDPI link, link with DOI)
            if (hasMdpiDoiText || mdpiLink || hasLinkWithMdpiDoi) {
              // Apply the main style (hide/highlight border) to the whole row
              styleSearch(row); // Applies border/padding to the row (div.g or div.gs_r)

              let titleContainer = null;
              const isScholar = cfg.host === 'scholar.google.com';

              if (isScholar) {
                // On Scholar, find the H3 title container
                titleContainer = row.querySelector('h3.gs_rt');
              } else {
                // On Google Web, find the H3 inside the main link container
                titleContainer = row.querySelector('.yuRUbf h3');
              }

              // Style all links within the identified title container (H3)
              if (titleContainer) {
                titleContainer.querySelectorAll('a').forEach(styleLinkElement);
              } else if (!isScholar) {
                // Fallback for Google Web if H3 isn't found (less common)
                // Find the primary link and style it
                const primaryLink = row.querySelector('a[jsname="UWckNb"]') || row.querySelector('.yuRUbf a');
                styleLinkElement(primaryLink);
              }
              // Note: No 'else' needed for Scholar fallback, as h3.gs_rt should exist

              // Separately style the direct mdpi.com link (e.g., [PDF] link) if it exists
              // and wasn't already styled as part of the title container
              // Check if mdpiLink exists and if titleContainer exists and does NOT contain mdpiLink
              if (mdpiLink && (!titleContainer || !titleContainer.contains(mdpiLink))) {
                 styleLinkElement(mdpiLink);
              }
            }
          });
        }
      }
    }

    // 2. Style inline footnotes that link to identified MDPI references
    function styleInlineFootnotes() {
      document.querySelectorAll('a[href*="#"]').forEach(a => {
        const href = a.getAttribute('href');
        const rid = a.dataset.xmlRid;
        let targetEl = null;

        // --- Find targetEl using rid or href (existing logic) ---
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
        // --- End Find targetEl ---

        // --- Find listItem (existing logic) ---
        let listItem = null;
        if (rid && targetEl.id === rid) {
            listItem = targetEl.querySelector('div.citation');
        } else if (targetEl.matches(referenceListSelectors)) {
            listItem = targetEl;
        } else {
            listItem = targetEl.closest(referenceListSelectors);
        }
        // --- End Find listItem ---

        // Now, check the data attribute set by processAllReferences
        if (listItem && listItem.dataset.mdpiResult === 'true') {
            // Style the original inline link (<a> or its <sup> child if present)
            const sup = a.querySelector('sup');
            styleSup(sup || a); // Style the inline link <a> or <sup>
        }
      });
    }

    // 3. Process ALL potential reference list items
    function processAllReferences() {
      document.querySelectorAll(referenceListSelectors).forEach(item => {
        // Check if it's MDPI (this also adds to set and sets data attributes)
        if (isMdpiReferenceItem(item)) {
            // Style the reference list item itself
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
      console.log("[MDPI Filter] runAll triggered."); // Log runAll start
      uniqueMdpiReferences.clear(); // Clear set before reprocessing
      // Clear checked status before reprocessing
      document.querySelectorAll('[data-mdpi-checked]').forEach(el => {
          delete el.dataset.mdpiChecked;
          delete el.dataset.mdpiResult;
      });

      processSearchSites();       // Process search sites first (doesn't count)
      processAllReferences();     // Check/Count/Style ALL reference list items
      styleInlineFootnotes();     // Style footnotes linking to MDPI items
      processDirectMdpiLinks();   // Style direct links (doesn't count)
      updateBadgeCount();         // Update badge with final count
      console.log("[MDPI Filter] runAll finished."); // Log runAll end
    }

    // Initial + dynamic (SPA/infinite scroll, etc.)
    runAll(); // Initial run

    // --- Ensure only one observer ---
    // Disconnect previous observer if it exists on the window object
    if (window.mdpiObserverInstance) {
        console.log("[MDPI Filter] Disconnecting previous MutationObserver.");
        window.mdpiObserverInstance.disconnect();
    }
    console.log("[MDPI Filter] Creating new MutationObserver.");
    // Store the new observer instance on the window object
    window.mdpiObserverInstance = new MutationObserver(debounce(() => {
        console.log("[MDPI Filter] MutationObserver triggered debounced runAll.");
        runAll(); // Rerun all checks and update badge
    }));
    window.mdpiObserverInstance.observe(document.body, {
      childList: true,
      subtree:   true
    });
    // ---

  }); // End storage.sync.get

} // End of injection check

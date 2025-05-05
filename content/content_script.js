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
      // Check if already processed to prevent redundant checks/counting
      if (item.dataset.mdpiChecked) return item.dataset.mdpiResult === 'true';

      // --- DEBUGGING START ---
      console.log("[MDPI Filter] Checking item:", item); // Log the element itself
      const textContent = item.textContent || ''; // Keep for DOI text check and logging
      const innerHTML = item.innerHTML || ''; // Get innerHTML for journal check
      console.log("[MDPI Filter] Text content:", JSON.stringify(textContent));
      // console.log("[MDPI Filter] Inner HTML:", JSON.stringify(innerHTML)); // Optional: log innerHTML too
      // --- DEBUGGING END ---

      const hasMdpiLink = item.querySelector(
        `a[href*="${MDPI_DOMAIN}"], a[href*="${MDPI_DOI}"], a[data-track-item_id*="${MDPI_DOI}"]`
      );
      const hasMdpiText = textContent.includes(MDPI_DOI); // Check text content for DOI

      // Check for common MDPI journal names (case-insensitive) using word boundaries on innerHTML
      const journalRegex = /\b(Nutrients|Int J Mol Sci|IJMS|Molecules)\b/i;
      const hasMdpiJournal = journalRegex.test(innerHTML); // Test against innerHTML
      console.log(`[MDPI Filter] Regex ${journalRegex} test result on innerHTML:`, hasMdpiJournal); // Log the regex result

      const isMdpi = !!(hasMdpiLink || hasMdpiText || hasMdpiJournal); // Ensure boolean
      console.log("[MDPI Filter] isMdpi evaluated as:", isMdpi); // Log the final boolean result

      // Mark as checked and store result
      item.dataset.mdpiChecked = 'true';
      item.dataset.mdpiResult = isMdpi;

      if (isMdpi) {
        // Use sanitized text content as a unique key (still use textContent for consistency)
        const key = sanitize(textContent).trim().slice(0, 100);
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

    // 2. Process inline footnotes everywhere - REFINED
    function processInlineCitations() {
      document.querySelectorAll('a[href*="#"]').forEach(a => {
        const href = a.getAttribute('href');
        if (!href || !href.includes('#')) return;
        const frag = href.slice(href.lastIndexOf('#') + 1);
        if (!frag) return;

        // Find the element targeted by the fragment ID/name
        // Original attempt:
        let targetEl = document.getElementById(frag) || document.getElementsByName(frag)[0];

        // Fallback for ScienceDirect: Look for an element (likely an anchor) whose ID *ends with* -frag
        if (!targetEl) {
            targetEl = document.querySelector(`a[id$="-${frag}"]`); // Match elements like id="ref-id-b0040"
        }

        if (!targetEl) return; // Still couldn't find a target

        // Find the associated reference list item (LI)
        let listItem = null;
        // Scenario 1: Target is the LI itself
        if (targetEl.matches('li')) {
            listItem = targetEl;
        }
        // Scenario 2: Target is inside an LI (most common, including the ScienceDirect case)
        else {
            listItem = targetEl.closest('li');
        }

        // Now, verify this LI looks like a reference item using our selectors
        // This avoids styling footnotes pointing to non-reference list items
        if (listItem && listItem.matches(referenceListSelectors)) {
            // Check if it's an MDPI reference.
            if (isMdpiReferenceItem(listItem)) {
                // Style the original inline link (<a> or its <sup> child if present)
                const sup = a.querySelector('sup');
                styleSup(sup || a);
                // ALSO style the reference list item itself if not already styled
                if (!listItem.style.border.includes('red')) {
                    styleRef(listItem);
                }
            }
        }
      });
    }

    // 3. Process reference‐list entries everywhere - REFINED (as fallback)
    function processReferenceLists() {
      document.querySelectorAll(referenceListSelectors).forEach(item => {
          // Check if it's MDPI *and* hasn't already been styled by processInlineCitations
          // Check based on whether the border style was already applied
          if (!item.style.border.includes('red') && isMdpiReferenceItem(item)) {
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
      // Clear checked status before reprocessing
      document.querySelectorAll('[data-mdpi-checked]').forEach(el => {
          delete el.dataset.mdpiChecked;
          delete el.dataset.mdpiResult;
      });

      processSearchSites(); // This already checks domains internally
      processInlineCitations(); // Styles inline links AND their corresponding list items
      processReferenceLists(); // Styles list items missed by inline processing
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

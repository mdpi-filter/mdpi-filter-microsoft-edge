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
    'div.citation', // Matches the item directly on liebertpub
    'div.reference',
    'li.separated-list-item',
    'li[id^="CR"]',
    'li[id^="ref-"]',
    'li[id^="reference-"]',
    // ScienceDirect specific (nested structure)
    'li:has(> span > a[id^="ref-id-"])', // Matches LI containing the specific anchor
    'li:has(a[name^="bbib"])' // Matches LI containing anchor with name starting bbib
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

    // Function to check if a list item element is MDPI and add to set
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

      const journalRegex = /(?:^|[^A-Za-z0-9_])(Nutrients|Int J Mol Sci|IJMS|Molecules)\b/i;
      const hasMdpiJournal = journalRegex.test(textContent);
      console.log(`[MDPI Filter] Regex ${journalRegex} test result on text:`, hasMdpiJournal);

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
          return true;
        }
      }
      return false;
    };

    // Function to update badge count
    const updateBadgeCount = () => {
      const count = uniqueMdpiReferences.size;
      console.log(`[MDPI Filter] Updating badge count to: ${count}`);
      try {
        if (count > 0) {
          chrome.runtime.sendMessage({ type: 'mdpiCount', count: count });
        } else {
          chrome.runtime.sendMessage({ type: 'mdpiCount', count: 0 });
        }
      } catch (error) {
        console.warn("[MDPI Filter] Could not send message to background. Extension context likely invalidated.", error);
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

    // 2. Process inline footnotes everywhere - REFINED
    function processInlineCitations() {
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

        if (listItem && listItem.matches(referenceListSelectors)) {
          if (isMdpiReferenceItem(listItem)) {
            const sup = a.querySelector('sup');
            styleSup(sup || a);
            if (!listItem.style.border.includes('red')) {
              styleRef(listItem);
            }
          }
        }
      });
    }

    // 3. Process reference‐list entries everywhere - REFINED (as fallback)
    function processReferenceLists() {
      console.log("[MDPI Filter] Running processReferenceLists");
      document.querySelectorAll(referenceListSelectors).forEach(item => {
        let targetItem = item;
        if (!item.matches('div.citation')) {
          const citationDiv = item.querySelector('div.citation');
          if (citationDiv) {
            targetItem = citationDiv;
          }
        }

        if (targetItem && !targetItem.dataset.mdpiChecked) {
          if (isMdpiReferenceItem(targetItem)) {
            if (!targetItem.style.border.includes('red')) {
              styleRef(targetItem);
            }
          }
        } else if (targetItem && targetItem.dataset.mdpiResult === 'true' && !targetItem.style.border.includes('red')) {
          styleRef(targetItem);
        }
      });
    }

    // 4. Process direct links to MDPI articles everywhere
    function processDirectMdpiLinks() {
      const mdpiArticleRegex = /^https?:\/\/www\.mdpi\.com\/\d{4}-\d{4}\/\d+\/\d+\/\d+(\/.*)?$/;
      document.querySelectorAll(`a[href^="https://www.mdpi.com/"]`).forEach(a => {
        const href = a.getAttribute('href');
        if (href && mdpiArticleRegex.test(href) && !a.closest(referenceListSelectors.split(',').map(s => s.trim() + '[style*="border"]').join(','))) {
          styleDirectLink(a);
        }
      });
    }

    // Run all processing functions
    const runAll = () => {
      console.log("[MDPI Filter] Running all processing functions...");
      uniqueMdpiReferences.clear();
      processSearchSites();
      processInlineCitations();
      processReferenceLists();
      processDirectMdpiLinks();
      updateBadgeCount();
      console.log("[MDPI Filter] Processing finished. Final count in set:", uniqueMdpiReferences.size);
    };

    const debouncedRunAll = debounce(runAll, 500);

    console.log("[MDPI Filter] Scheduling initial run.");
    setTimeout(runAll, 250);

    const observer = new MutationObserver(mutations => {
      let needsUpdate = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches(referenceListSelectors) || node.querySelector(referenceListSelectors) || node.closest(referenceListSelectors)) {
                needsUpdate = true;
                break;
              }
              if (node.matches('a[href*="#"]') || node.querySelector('a[href*="#"]')) {
                needsUpdate = true;
                break;
              }
            }
          }
        }
        if (needsUpdate) break;
      }

      if (needsUpdate) {
        console.log("[MDPI Filter] MutationObserver detected relevant changes, queueing update.");
        debouncedRunAll();
      }
    });

    console.log("[MDPI Filter] Starting MutationObserver.");
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });

    window.mdpiFilterObserver = observer;

  });

} // End of injection check

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
  let refIdCounter = 0; // Counter for unique reference IDs

  const referenceListSelectors = [
    'li.c-article-references__item',
    'div.References p.ReferencesCopy1',
    'li.html-x',
    'li.html-xx',
    'div.citation',
    'div.reference',
    'li.separated-list-item',
    'li[id^="CR"]', // Springer
    'li[id^="ref-"]', // Generic
    'li[id^="reference-"]', // Generic
    'li[id^="B"]', // NCBI/PMC specific Bxx-journal-id format
    'li:has(> span > a[id^="ref-id-"])', // Some other format
    'li:has(a[name^="bbib"])', // Another format
    'li[data-bib-id]', // Wiley
    'span[aria-owns^="pdfjs_internal_id_"]', // PDF.js rendered spans
    'li[id^="cite_note-"]', // Wikipedia reference list items
    'div.refbegin li' // Wikipedia "Sources" or "Further reading" list items
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
      if (!supOrA) return;

      // Style the main element (sup or a)
      supOrA.style.color      = '#E2211C'; // MDPI Red
      supOrA.style.fontWeight = 'bold';

      // If supOrA is a sup element, specifically style any anchor tag and its content within it
      if (supOrA.tagName.toLowerCase() === 'sup') {
        const anchorElement = supOrA.querySelector('a');
        if (anchorElement) {
          anchorElement.style.color = '#E2211C'; // Ensure link text is red
          anchorElement.style.fontWeight = 'bold'; // Ensure link text is bold

          // Wikipedia uses spans for brackets, ensure they are also red
          const bracketSpans = anchorElement.querySelectorAll('span.cite-bracket');
          bracketSpans.forEach(span => {
            span.style.color = '#E2211C';
            // fontWeight will be inherited from the anchor or sup
          });
        }
      }
      // If supOrA is an anchor itself that contains a sup (less common for this specific issue)
      else if (supOrA.tagName.toLowerCase() === 'a') {
        const supElementInside = supOrA.querySelector('sup');
        if (supElementInside) {
            supElementInside.style.color = '#E2211C';
            supElementInside.style.fontWeight = 'bold';
        }
      }
    };

    const styleRef = (item, refId) => { // Accept refId
      item.style.color = '#E2211C';
      // Assign the unique ID as a data attribute
      item.dataset.mdpiFilterRefId = refId;

      let currentSibling = item.previousElementSibling;
      const referenceStartRegex = /^\s*\d+\.\s*/;

      while (currentSibling) {
        if (currentSibling.matches('span[aria-owns^="pdfjs_internal_id_"]')) {
          break;
        }

        if (currentSibling.matches('span')) {
          // Also assign the ID to preceding spans for potential targeting
          currentSibling.dataset.mdpiFilterRefId = refId;
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

    // New helper: Just checks content, no side effects on datasets or global lists.
    const isMdpiItemByContent = (item) => {
      if (!item) return false;
      const textContent = item.textContent || '';
      const innerHTML = item.innerHTML || '';

      const hasMdpiLink = item.querySelector(
        `a[href*="${MDPI_DOMAIN}"], a[href*="${MDPI_DOI}"], a[data-track-item_id*="${MDPI_DOI}"]`
      );
      const hasMdpiText = textContent.includes(MDPI_DOI);
      const journalRegex = /\b(Nutrients|Int J Mol Sci|IJMS|Molecules)\b/i;
      const hasMdpiJournal = journalRegex.test(innerHTML);

      return !!(hasMdpiLink || hasMdpiText || hasMdpiJournal);
    };

    const extractReferenceData = (item) => {
      let refId = item.dataset.mdpiFilterRefId;
      if (!refId) {
        refId = `mdpi-ref-${refIdCounter++}`;
        item.dataset.mdpiFilterRefId = refId;
      }

      let fullText = '';
      let number = null;
      let link = null;
      const referenceStartRegex = /^\s*(\d+)\.\s*/;

      const linkElement = item.querySelector('a[href]');
      if (linkElement) {
        link = linkElement.href;
      }

      const pnasListItem = item.closest('[role="listitem"][data-has="label"]');
      if (pnasListItem) {
        const labelEl = pnasListItem.querySelector('.label');
        if (labelEl && labelEl.textContent) {
          const parsedNum = parseInt(labelEl.textContent.trim(), 10);
          if (!isNaN(parsedNum)) {
            number = String(parsedNum);
          }
        }
      }

      if (item.matches('li[id^="cite_note-"]')) {
        const idParts = item.id.split('-');
        const potentialNumber = idParts[idParts.length - 1];
        if (potentialNumber && !isNaN(parseInt(potentialNumber, 10))) {
          number = potentialNumber;
        }
        const refTextElement = item.querySelector('span.reference-text');
        if (refTextElement) {
          fullText = refTextElement.textContent.trim();
        } else {
          fullText = item.textContent.trim();
          const backlinkSpan = item.querySelector('span.mw-cite-backlink');
          if (backlinkSpan) {
            const backlinkText = backlinkSpan.textContent.trim();
            if (fullText.startsWith(backlinkText)) {
              fullText = fullText.substring(backlinkText.length).trim();
            }
          }
        }
      } else if (item.matches('span[aria-owns^="pdfjs_internal_id_"]')) {
        let currentTextCollector = '';
        let currentElement = item;
        while (currentElement && currentElement.matches('span[aria-owns^="pdfjs_internal_id_"]')) {
          currentTextCollector += currentElement.textContent.trim() + ' ';
          const nextSib = currentElement.nextElementSibling;
          if (currentElement.querySelector('a[href]') || !nextSib || !nextSib.matches('span[aria-owns^="pdfjs_internal_id_"]')) {
             if (nextSib && /^\s*\[?\d+\]?\s*$/.test(nextSib.textContent.trim())) {
                break;
             }
          }
          if (!nextSib || !nextSib.matches('span[aria-owns^="pdfjs_internal_id_"]')) break;
          currentElement = nextSib;
        }
        fullText = currentTextCollector.trim();
        if (!number) { 
            const numMatchPdf = fullText.match(/^\s*\[?(\d+)\]?[\.\s]?/);
            if (numMatchPdf && numMatchPdf[1]) {
              number = numMatchPdf[1];
            }
        }
      } else {
        if (!fullText) {
            fullText = item.textContent.trim();
        }
        if (!number) {
            const match = fullText.match(referenceStartRegex);
            if (match && match[1]) {
              number = match[1];
            }
        }
      }

      if (!fullText && item.textContent) {
        fullText = item.textContent.trim();
      }
      if (!fullText) {
        fullText = "Reference text not available.";
      }

      // --- Fingerprint generation ---
      let fingerprint = null;
      const doiRegex = /\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i; 
      
      if (link) {
        const hrefLower = link.toLowerCase();
        if (hrefLower.includes('doi.org/') || hrefLower.includes('dx.doi.org/')) {
            const match = hrefLower.match(doiRegex);
            if (match) fingerprint = match[0];
        }
      }

      if (!fingerprint && fullText) {
        const textLower = fullText.toLowerCase();
        const match = textLower.match(doiRegex);
        if (match) fingerprint = match[0];
      }
      
      if (!fingerprint) {
        if (fullText && fullText !== "Reference text not available.") {
          fingerprint = fullText.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 100);
        } else {
          fingerprint = `no-text-ref-${refId}`; 
        }
      }
      // --- End Fingerprint generation ---

      return {
        id: refId,
        number: number,
        text: fullText,
        link: link,
        element: item,
        fingerprint: fingerprint
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
        // Check if the runtime and its ID are available.
        // If not, the context is likely invalidated, so skip sending the message.
        if (!chrome.runtime || !chrome.runtime.id) {
          console.warn("[MDPI Filter] Extension context invalidated. Skipping sendMessage in updateBadgeAndReferences.");
          return;
        }

        let count = 0;
        let referencesToSend = [];
        let messageType = 'mdpiUpdate'; // Default message type

        // Only the top-level frame should send the definitive update.
        if (window.self === window.top) {
          console.log("[MDPI Filter - Top Frame] Processing updateBadgeAndReferences.");
          if (isSearchSite()) { // isSearchSite() uses the current frame's (top frame's) location.
            console.log("[MDPI Filter - Top Frame] On search site, sending count 0 and no references.");
            // count remains 0, referencesToSend remains []
            // For search sites, the background script will clear its data based on this.
          } else {
            console.log("[MDPI Filter - Top Frame] Not on search site. Processing collected references.");
            count = uniqueMdpiReferences.size;
            // Sort references if they exist
            if (collectedMdpiReferences.length > 0) {
              collectedMdpiReferences.sort((a, b) => {
                const numA = parseInt(a.number, 10);
                const numB = parseInt(b.number, 10);
                if (!isNaN(numA) && !isNaN(numB)) {
                  return numA - numB;
                }
                if (!isNaN(numA)) return -1;
                if (!isNaN(numB)) return 1;
                return (a.text || "").localeCompare(b.text || "");
              });
            }
            referencesToSend = collectedMdpiReferences.map(ref => ({
              id: ref.id, // Send the ID
              number: ref.number,
              text: ref.text,
              link: ref.link
            }));
          }
          // Top frame sends the update.
          console.log(`[MDPI Filter - Top Frame] Sending message type: ${messageType}, count: ${count}, refs: ${referencesToSend.length}`);
          chrome.runtime.sendMessage({ type: messageType, count: count, references: referencesToSend });
        } else {
          // This is an iframe.
          // For now, iframes will not send 'mdpiUpdate' to simplify and prevent overwriting top-level decision.
          // MDPI content solely within an iframe might not be centrally reported by this simplified logic
          // if the iframe's content isn't directly scannable by the top frame's selectors.
          // Each frame processes its own DOM, but only top frame reports.
          console.log("[MDPI Filter - Iframe] Skipping mdpiUpdate message to prevent overwriting top-frame data.");
          return; // Iframe does not send the main update message
        }

      } catch (error) {
        console.warn("[MDPI Filter] Could not send message to background (try/catch):", error.message, error);
      } finally {
        // Check chrome.runtime.lastError, as sendMessage might set it if the receiving end is gone.
        // This check is particularly useful if the initial `!chrome.runtime || !chrome.runtime.id` passed
        // but the context became invalid just before/during sendMessage.
        if (chrome.runtime && chrome.runtime.lastError) {
          console.warn("[MDPI Filter] chrome.runtime.lastError after sendMessage in updateBadgeAndReferences:", chrome.runtime.lastError.message || chrome.runtime.lastError);
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
        const rid = a.dataset.xmlRid; // xml:id from some JATS XML, often used for <ref>
        let targetEl = null;
        let frag = null;

        if (rid) {
          try {
            targetEl = document.getElementById(rid);
          } catch (e) {
            console.warn(`[MDPI Filter] Error finding element by rid "${rid}":`, e);
          }
        }

        if (!targetEl && href && href.includes('#')) {
          const hashIndex = href.lastIndexOf('#');
          if (hashIndex !== -1 && hashIndex < href.length - 1) {
            frag = href.slice(hashIndex + 1);
            if (frag) {
              try {
                if (!targetEl) {
                  targetEl = document.getElementById(frag);
                }
                if (!targetEl) {
                  const namedElements = document.getElementsByName(frag);
                  if (namedElements.length > 0) {
                    targetEl = namedElements[0];
                  }
                }
                const escapedFrag = CSS.escape(frag);
                if (!targetEl) {
                  targetEl = document.querySelector(`a[id$="-${escapedFrag}"]`);
                }
                if (!targetEl && frag.startsWith('core-')) {
                  const potentialId = frag.substring(5);
                  if (potentialId) {
                    targetEl = document.getElementById(potentialId);
                  }
                }
                if (!targetEl) {
                  targetEl = document.querySelector(`li[data-bib-id="${escapedFrag}"]`);
                }
              } catch (e) {
                console.warn(`[MDPI Filter] DOMException while finding target for fragment "${frag}" (href: "${href}"):`, e);
                return; 
              }
            }
          }
        }

        if (!targetEl) {
          return; 
        }

        let listItem = null;
        try {
          if (targetEl.matches(referenceListSelectors)) {
            listItem = targetEl;
          }
          else if (rid && targetEl.id === rid && targetEl.querySelector('div.citation')) { 
            listItem = targetEl.querySelector('div.citation');
          }
          else {
            listItem = targetEl.closest(referenceListSelectors);
          }
        } catch (e) {
          console.warn(`[MDPI Filter] DOMException with matches/closest for targetEl (href: "${href}", frag: "${frag}"):`, targetEl, e);
          return; 
        }

        if (listItem && listItem.dataset.mdpiResult === 'true') { // Check the stored result
          const supElement = a.closest('sup'); 
          if (supElement) {
            styleSup(supElement);
          } else { 
            const supInsideA = a.querySelector('sup');
            styleSup(supInsideA || a);
          }
        }
      });
    }

    function processAllReferences() {
      document.querySelectorAll(referenceListSelectors).forEach(item => {
        let currentAncestor = item.parentElement;
        let skipItemDueToProcessedAncestor = false;
        while (currentAncestor && currentAncestor !== document.body) {
          if (currentAncestor.matches(referenceListSelectors)) {
            const ancestorRefId = currentAncestor.dataset.mdpiFilterRefId;
            // Check if ancestor was processed and its fingerprint is in uniqueMdpiReferences
            if (ancestorRefId && currentAncestor.dataset.mdpiFingerprint && uniqueMdpiReferences.has(currentAncestor.dataset.mdpiFingerprint)) {
              skipItemDueToProcessedAncestor = true;
              break;
            }
          }
          currentAncestor = currentAncestor.parentElement;
        }

        if (skipItemDueToProcessedAncestor) {
          return; 
        }

        if (isMdpiItemByContent(item)) {
          const refData = extractReferenceData(item); 
          item.dataset.mdpiFingerprint = refData.fingerprint; // Store fingerprint on the element

          if (!uniqueMdpiReferences.has(refData.fingerprint)) {
            uniqueMdpiReferences.add(refData.fingerprint);
            collectedMdpiReferences.push(refData); 

            if (mode === 'highlight') {
              styleRef(item, refData.id); 
            } else if (mode === 'hide') {
              item.style.display = 'none';
              const parentListItem = item.closest('li, div.citation, div.reference'); 
              if (parentListItem && parentListItem !== item && item.matches(referenceListSelectors)) {
                // parentListItem.style.display = 'none'; // This might be too aggressive
              }
            }
          } else {
            // Fingerprint already seen. This reference content is already counted.
            // Still style/hide this specific occurrence.
            if (mode === 'highlight') {
              styleRef(item, refData.id); 
            } else if (mode === 'hide') {
              item.style.display = 'none';
            }
          }
        } else {
          // Element matches selector but is not an MDPI item by content.
          // Ensure it's visible if mode is 'highlight' and it was previously hidden.
          // This handles cases where an item was MDPI, then content changed and it's no longer MDPI.
          if (item.style.display === 'none' && item.dataset.mdpiFilterRefId) {
             // item.style.display = ''; 
          }
          delete item.dataset.mdpiFingerprint; // Clean up fingerprint if not MDPI
        }
      });
      updateBadgeAndReferences();
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

    const highlightElementTemporarily = (element) => {
      if (!element) return;
      element.style.outline = '3px solid #FFD700';
      element.style.transition = 'outline 0.1s ease-in-out';

      const refId = element.dataset.mdpiFilterRefId;
      if (refId) {
        document.querySelectorAll(`[data-mdpi-filter-ref-id="${refId}"]`).forEach(el => {
          el.style.outline = '3px solid #FFD700';
          el.style.transition = 'outline 0.1s ease-in-out';
        });
      }

      setTimeout(() => {
        element.style.outline = '';
        if (refId) {
          document.querySelectorAll(`[data-mdpi-filter-ref-id="${refId}"]`).forEach(el => {
            el.style.outline = '';
          });
        }
      }, 2000);
    };

    function runAll(source = "initial") {
      console.log(`[MDPI Filter] runAll triggered by: ${source}`);
      refIdCounter = 0; // Reset ID counter for this run

      // Clear dataset attributes and styles from previous runs or other elements
      document.querySelectorAll('[data-mdpi-processed-in-this-run], [data-mdpi-result], [data-mdpi-filter-ref-id], [data-mdpi-fingerprint], [data-mdpi-checked], [data-mdpi-cited-by-processed]').forEach(el => {
        el.style.color = '';
        el.style.fontWeight = '';
        el.style.border = '';
        el.style.padding = '';
        el.style.display = ''; 
        el.style.outline = ''; 

        delete el.dataset.mdpiProcessedInThisRun;
        delete el.dataset.mdpiResult;
        delete el.dataset.mdpiFilterRefId;
        delete el.dataset.mdpiFingerprint; // Added to clear fingerprint
        delete el.dataset.mdpiChecked;
        delete el.dataset.mdpiCitedByProcessed;
      });
      document.querySelectorAll('[style*="color: rgb(226, 33, 28)"]').forEach(el => {
        el.style.color = '';
        el.style.fontWeight = '';
        el.style.borderBottom = '';
        el.style.textDecoration = '';
        // el.style.display = ''; // Be cautious with resetting display broadly
      });

      uniqueMdpiReferences.clear();
      collectedMdpiReferences = []; // Clear references for the new run

      try {
        if (!window.MDPIFilterDomains || !window.sanitize) {
          console.error("[MDPI Filter] runAll aborted: Dependencies (domains/sanitizer) not loaded.");
          return;
        }
        processSearchSites();
        processCitedByEntries();
        processAllReferences();     // Populates collectedMdpiReferences
        styleInlineFootnotes();     // Uses data-mdpi-result set by processAllReferences
        processDirectMdpiLinks();
        updateBadgeAndReferences(); // Sends collectedMdpiReferences (now sorted)
      } catch (error) {
        console.error(`[MDPI Filter] Error during runAll (source: ${source}):`, error);
      } finally {
        console.log(`[MDPI Filter] runAll finished (source: ${source}). Unique MDPI refs (for badge): ${uniqueMdpiReferences.size}, Collected for popup: ${collectedMdpiReferences.length}`);
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

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'scrollToRef' && msg.refId) {
        console.log(`[MDPI Filter] Received scrollToRef request for ID: ${msg.refId}`);
        const targetElement = document.querySelector(`[data-mdpi-filter-ref-id="${msg.refId}"]`);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlightElementTemporarily(targetElement);
          sendResponse({ status: "scrolled" });
        } else {
          console.warn(`[MDPI Filter] Element with ID ${msg.refId} not found.`);
          sendResponse({ status: "not_found" });
        }
        return true;
      }
      return false;
    });

    console.log("[MDPI Filter] Initial setup complete, listeners/observers added.");

  });

} else {
  console.log("[MDPI Filter] Injection prevented, mdpiFilterInjected was already true.");
}

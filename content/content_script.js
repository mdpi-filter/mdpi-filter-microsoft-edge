// content/content_script.js

if (!window.mdpiFilterInjected) {
  // console.log("[MDPI Filter CS] Attempting to inject content script...");

  // --- Comprehensive Dependency Checks ---
  let dependenciesMet = true;
  const missingDependencies = [];

  if (typeof window.MDPIFilterDomains === 'undefined') {
    missingDependencies.push("MDPIFilterDomains (from domains.js)");
    dependenciesMet = false;
  }
  if (typeof window.sanitize === 'undefined') {
    missingDependencies.push("sanitize (from sanitizer.js)");
    dependenciesMet = false;
  }
  if (typeof window.debounce === 'undefined') {
    missingDependencies.push("debounce (from utils.js)");
    dependenciesMet = false;
  }
  if (typeof window.MDPIFilterReferenceSelectors === 'undefined') {
    missingDependencies.push("MDPIFilterReferenceSelectors (from reference_selectors.js)");
    dependenciesMet = false;
  }
  if (!window.MDPIFilterUtils || typeof window.MDPIFilterUtils.generateInlineFootnoteSelectors === 'undefined') {
    missingDependencies.push("MDPIFilterUtils.generateInlineFootnoteSelectors (from inline_footnote_selectors.js)");
    dependenciesMet = false;
  }
  if (!window.MDPIFilterUtils || typeof window.MDPIFilterUtils.styleInlineFootnotes === 'undefined') {
    missingDependencies.push("MDPIFilterUtils.styleInlineFootnotes (from inline_footnote_styler.js)");
    dependenciesMet = false;
  }
  if (!window.MDPIFilterCitedBy || !window.MDPIFilterCitedBy.Selectors || typeof window.MDPIFilterCitedBy.Selectors.ITEM_SELECTORS === 'undefined') {
    missingDependencies.push("MDPIFilterCitedBy.Selectors.ITEM_SELECTORS (from cited_by_selectors.js)");
    dependenciesMet = false;
  }
  if (!window.MDPIFilterCitedBy || !window.MDPIFilterCitedBy.Styler || typeof window.MDPIFilterCitedBy.Styler.styleItem === 'undefined') {
    missingDependencies.push("MDPIFilterCitedBy.Styler.styleItem (from cited_by_styler.js)");
    dependenciesMet = false;
  }
  if (!window.MDPIFilterCitedBy || !window.MDPIFilterCitedBy.Processor || typeof window.MDPIFilterCitedBy.Processor.processEntries === 'undefined') {
    missingDependencies.push("MDPIFilterCitedBy.Processor.processEntries (from cited_by_processor.js)");
    dependenciesMet = false;
  }
  // Add check for the new link extraction selectors array
  if (typeof window.MDPIFilterLinkExtractionSelectors === 'undefined' || !Array.isArray(window.MDPIFilterLinkExtractionSelectors)) {
    missingDependencies.push("MDPIFilterLinkExtractionSelectors (from link_extraction_selectors.js)");
    dependenciesMet = false;
  }
  if (!window.MDPIFilterLinkExtractor || typeof window.MDPIFilterLinkExtractor.extractPrimaryLink !== 'function') {
    missingDependencies.push("MDPIFilterLinkExtractor.extractPrimaryLink (from link_extractor.js)");
    dependenciesMet = false;
  }
  if (typeof window.MDPIFilterCaches === 'undefined' || typeof window.MDPIFilterCaches.ncbiApiCache === 'undefined' || typeof window.MDPIFilterCaches.citationProcessCache === 'undefined') {
    missingDependencies.push("MDPIFilterCaches (from cache_manager.js)");
    dependenciesMet = false;
  }
  // Add dependency check for the new item content checker
  if (typeof window.MDPIFilterItemContentChecker === 'undefined' || typeof window.MDPIFilterItemContentChecker.checkItemContent !== 'function') {
    missingDependencies.push("MDPIFilterItemContentChecker (from item_content_checker.js)");
    dependenciesMet = false;
  }

  if (!dependenciesMet) {
    console.error("[MDPI Filter CS] CRITICAL: Halting script. The following dependencies were not met:", missingDependencies.join(', '));
  } else {
    window.mdpiFilterInjected = true;
    // console.log("[MDPI Filter CS] All dependencies met. Content script executing (mdpiFilterInjected set).");

    // --- Constants, Selectors, State ---
    const MDPI_DOMAIN = 'mdpi.com';
    const MDPI_DOI    = '10.3390';
    const MDPI_DOI_REGEX = new RegExp(MDPI_DOI.replace(/\./g, '\\.') + "/[^\\s\"'<>&]+", "i");
    const domains     = window.MDPIFilterDomains || {};
    const sanitize    = window.sanitize || (html => html);
    // Use the selectors from the new file
    const referenceListSelectors = window.MDPIFilterReferenceSelectors; 
    const uniqueMdpiReferences = new Set();
    let collectedMdpiReferences = []; // Array to store detailed reference info
    let refIdCounter = 0; // Counter for unique reference IDs

    // Declare mainObserverInstance in a scope accessible by runAll and setupMainObserver
    let mainObserverInstance = null;

    // ---

    // Helper function to determine if the current page is a search engine results page
    const isSearchEnginePage = () => {
      const hostname = window.location.hostname;
      return domains && domains.searchEngineDomains && Array.isArray(domains.searchEngineDomains) &&
             domains.searchEngineDomains.some(domain => hostname.includes(domain));
    };

    chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
      console.log('%c MDPI FILTER EXTENSION SCRIPT LOADED AND CONTEXT SELECTED! CHECK HERE! ', 'background: yellow; color: black; font-size: 16px; font-weight: bold;');
      // console.log("[MDPI Filter] Mode:", mode);

      // --- Use Caches from Global Scope ---
      const { ncbiApiCache, citationProcessCache } = window.MDPIFilterCaches;
      // ---

      let isProcessing = false; // Declare isProcessing here, inside the callback

      // Helper function to decode URLs within a string
      function decodeUrlsInString(str) {
        if (!str || typeof str !== 'string') return str; // Added return str for non-string input
        // Regex to find URLs
        const urlRegex = /(https?:\/\/[^\s"'>]+)/g;
        return str.replace(urlRegex, (url) => {
            try {
                // Decode the matched URL part
                return decodeURIComponent(url);
            } catch (e) {
                // This warning is active from the previous step.
                console.warn(`[MDPI Filter CS] Failed to decode URL part in decodeUrlsInString: ${url}`, e); 
                return url; // Return original URL part if decoding fails
            }
        });
      }

      // --- Styling Functions ---
      const highlightStyle = '2px solid red';
      const mdpiColor = '#E2211C'; // Define MDPI red for consistent use

      function clearPreviousHighlights() {
        // console.log("[MDPI Filter CS] Clearing previous highlights...");

        // 1. Clear styles from reference items and their numbers (styled by styleRef)
        document.querySelectorAll('[data-mdpi-filter-ref-id]').forEach(el => {
          if (el.style.color === mdpiColor || el.style.color === 'rgb(226, 33, 28)') {
            el.style.removeProperty('color');
          }
          // DO NOT REMOVE THE 'data-mdpi-filter-ref-id' ATTRIBUTE HERE.
          // It's essential for linking popup items to DOM elements across re-scans.
          // el.removeAttribute('data-mdpi-filter-ref-id'); // <--- REMOVE OR COMMENT OUT THIS LINE
        });

        // 2. Clear styles from search results (styled by styleSearch)
        const searchResultSelectors = [];
        if (domains.googleWeb && domains.googleWeb.container) searchResultSelectors.push(domains.googleWeb.container);
        if (domains.scholar && domains.scholar.container) searchResultSelectors.push(domains.scholar.container);
        if (domains.pubmed && domains.pubmed.itemSelector) searchResultSelectors.push(domains.pubmed.itemSelector);
        if (domains.europepmc && domains.europepmc.itemSelector) searchResultSelectors.push(domains.europepmc.itemSelector);
        // Add other selectors from processSearchEngineResults if necessary

        if (searchResultSelectors.length > 0) {
          try {
            document.querySelectorAll(searchResultSelectors.join(', ')).forEach(el => {
              if (el.style.border === highlightStyle) {
                el.style.removeProperty('border');
              }
              if (el.style.padding === '5px') {
                el.style.removeProperty('padding');
              }
              if (el.style.display === 'none') {
                el.style.removeProperty('display');
              }
            });
          } catch (e) {
            // console.warn("[MDPI Filter CS] Error clearing search result highlights:", e);
          }
        }

        // 3. Clear styles from direct MDPI links and general styled links
        document.querySelectorAll('a').forEach(link => {
          let wasStyledByExtension = false;
          if (link.style.color === mdpiColor || link.style.color === 'rgb(226, 33, 28)') {
            link.style.removeProperty('color');
            wasStyledByExtension = true;
          }
          if (link.style.borderBottom === `1px dotted ${mdpiColor}` || link.style.borderBottom === '1px dotted rgb(226, 33, 28)') {
            link.style.removeProperty('border-bottom');
            wasStyledByExtension = true;
          }
          // Only remove text-decoration if we likely set it to 'none'
          if (link.style.textDecoration === 'none' && wasStyledByExtension) {
            link.style.removeProperty('text-decoration');
          }
          // Avoid broadly resetting display for all links as it can break page layout.
          // If specific display changes were made (e.g., 'inline' to 'inline-block'),
          // a more targeted removal or class-based styling would be better.

          const h3Ancestor = link.closest('h3');
          if (h3Ancestor && (h3Ancestor.style.color === mdpiColor || h3Ancestor.style.color === 'rgb(226, 33, 28)')) {
            h3Ancestor.style.removeProperty('color');
          }
        });

        // 4. Clear styles from inline footnotes
        // Ideally, inline_footnote_styler.js would provide an "unstyle" function.
        // Fallback:
        document.querySelectorAll('sup, a').forEach(marker => {
            if (marker.style.color === mdpiColor || marker.style.color === 'rgb(226, 33, 28)') {
                if (marker.style.fontWeight === 'bold') {
                    marker.style.removeProperty('font-weight');
                }
                marker.style.removeProperty('color');
            }
            if (marker.tagName.toLowerCase() === 'sup') {
                const innerA = marker.querySelector('a');
                if (innerA && (innerA.style.color === mdpiColor || innerA.style.color === 'rgb(226, 33, 28)')) {
                    if (innerA.style.fontWeight === 'bold') innerA.style.removeProperty('font-weight');
                    innerA.style.removeProperty('color');
                }
            }
        });


        // 5. Clear styles from "Cited By" items
        // Ideally, cited_by_styler.js would provide an "unstyle" function.
        // Fallback:
        const citedByBorderStylePattern = /3px solid (rgb\(226, 33, 28\)|#E2211C)/;
        document.querySelectorAll('*').forEach(item => {
            if (item.style.borderLeft && citedByBorderStylePattern.test(item.style.borderLeft)) {
                item.style.removeProperty('border-left');
                item.style.removeProperty('padding-left');
                item.style.removeProperty('margin-left');
                item.style.removeProperty('margin-bottom');
                // Potentially reset text color if known to be set by cited_by_styler.js
            }
        });
        // console.log("[MDPI Filter CS] Finished clearing previous highlights.");
      }

      const styleSearch = el => {
        if (!el) return;
        if (mode === 'hide') el.style.display = 'none';
        else {
          el.style.border  = highlightStyle;
          el.style.padding = '5px';
        }
      };

      const styleRef = (item, refId) => {
        item.dataset.mdpiFilterRefId = refId; // Assign refId for scrolling to the main item

        let textStylingTarget = item; // Default to styling the item itself

        // Special handling for Cambridge Core structure to style the inner content
        // The 'item' here is div.circle-list__item[id^="r"]
        if (item.matches && item.matches('div.circle-list__item[id^="r"]')) {
          const contentElement = item.querySelector('div.circle-list__item__grouped__content');
          if (contentElement) {
            textStylingTarget = contentElement; // Target the inner div for text color
          }
        }
        
        // Apply color to the determined target for the reference text
        textStylingTarget.style.color = '#E2211C';

        // Existing logic to style a preceding reference number (e.g., a leading span)
        // This part handles cases where the number is a sibling element before the main text.
        let currentSibling = item.previousElementSibling;
        // Regex to identify common reference number patterns like "1.", "[1]", "1)"
        const referenceStartRegex = /^\s*(?:\[\s*\d+\s*\]|\d+\s*[.)]?)/;

        while (currentSibling) {
          if (currentSibling.matches('span[aria-owns^="pdfjs_internal_id_"]')) {
            break; // Stop if we hit a PDF.js specific container
          }

          if (currentSibling.matches('span')) {
            // If the span contains the reference number, style it and assign the refId
            if (referenceStartRegex.test(currentSibling.textContent || '')) {
              currentSibling.style.color = '#E2211C';
              currentSibling.dataset.mdpiFilterRefId = refId; // Assign refId for scrolling
            }
          } else if (currentSibling.tagName !== 'BR') {
            // Stop if we hit a non-span, non-BR element
            break;
          }
          currentSibling = currentSibling.previousElementSibling;
        }
      };

      const styleDirectLink = (elementToStyle) => {
        if (!elementToStyle) return;

        if (elementToStyle && elementToStyle.tagName === 'A') {
          // This is a general MDPI link (not a "Cited by" LI container)
          let textDisplayElement = elementToStyle; 
          let borderTargetElement = elementToStyle; 

          const h3Ancestor = elementToStyle.closest('h3');
          if (h3Ancestor) {
            textDisplayElement = h3Ancestor; // Color the H3
          }

          const anchorTextSpan = elementToStyle.querySelector('.anchor-text, .title, span');
          if (anchorTextSpan) {
            borderTargetElement = anchorTextSpan; // Border the span
          }
          
          textDisplayElement.style.color = '#E2211C';
          if (window.getComputedStyle(textDisplayElement).display === 'inline') {
            textDisplayElement.style.display = 'inline-block';
          }

          borderTargetElement.style.borderBottom = '1px dotted #E2211C';
          if (borderTargetElement !== textDisplayElement) { 
              borderTargetElement.style.color = '#E2211C'; 
          }
          if (window.getComputedStyle(borderTargetElement).display === 'inline') {
            borderTargetElement.style.display = 'inline-block';
          }
        }
        // else: unhandled element type or context, do nothing
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

      // --- Core Logic Functions ---

      function processDirectMdpiLinks() {
        // console.log("[MDPI Filter CS] Processing direct MDPI links...");
        const allLinks = document.querySelectorAll('a[href]');
        allLinks.forEach(link => {
          // Skip if the link is part of an already processed reference item or "Cited By" item
          if (link.closest('[data-mdpi-filter-ref-id]') || link.closest('[data-mdpi-filter-cited-by-styled="true"]')) {
            return;
          }

          const href = link.href;
          if (href) {
            const isMdpiDomainLink = href.includes(MDPI_DOMAIN);
            const isMdpiDoiLink = MDPI_DOI_REGEX.test(href);

            if (isMdpiDomainLink || isMdpiDoiLink) {
              // console.log("[MDPI Filter CS] Found direct MDPI link:", link);
              styleDirectLink(link); // Use the existing styleDirectLink function
            }
          }
        });
        // console.log("[MDPI Filter CS] Finished processing direct MDPI links.");
      }

      async function checkNcbiIdsForMdpi(ids, idType, runCache) { // ids is an array
        if (!ids || ids.length === 0) {
          return false;
        }

        const idsToQueryApi = [];
        // First, check the persistent ncbiApiCache
        ids.forEach(id => {
          if (ncbiApiCache.has(id)) {
            runCache.set(id, ncbiApiCache.get(id)); // Populate current runCache from persistent cache
          } else {
            idsToQueryApi.push(id); // This ID needs to be fetched
          }
        });

        if (idsToQueryApi.length === 0) {
          // All IDs were found in the persistent cache.
          // Check if any of the original IDs (now in runCache) are MDPI.
          return ids.some(id => runCache.get(id) === true);
        }

        const BATCH_SIZE = 20;
        let overallFoundMdpiInBatches = false;

        for (let i = 0; i < idsToQueryApi.length; i += BATCH_SIZE) {
          const batchIdsToQuery = idsToQueryApi.slice(i, i + BATCH_SIZE);
          if (batchIdsToQuery.length === 0) {
            continue;
          }

          const idsString = batchIdsToQuery.join(',');
          const encodedIdType = encodeURIComponent(idType);
          const toolName = 'MDPIFilterChromeExtension';
          const maintainerEmail = 'dicing_nastily314@aleeas.com';
          const encodedToolName = encodeURIComponent(toolName);
          const encodedMaintainerEmail = encodeURIComponent(maintainerEmail);
          const apiUrl = `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${idsString}&idtype=${encodedIdType}&format=json&versions=no&tool=${encodedToolName}&email=${encodedMaintainerEmail}`;

          try {
            const response = await fetch(apiUrl);
            if (response.ok) {
              const data = await response.json();
              let foundMdpiInThisBatch = false;
              if (data.records && data.records.length > 0) {
                data.records.forEach(record => {
                  const idThisRecordIsFor = record.requested_id;
                  let isMdpiFromApi = false;

                  if (idThisRecordIsFor && batchIdsToQuery.includes(idThisRecordIsFor)) {
                    if (record.doi) {
                      isMdpiFromApi = record.doi.startsWith(MDPI_DOI);
                    } else {
                      const API_MDPI_JOURNALS_REGEX = /\b(Int J Mol Sci|IJMS|Nutrients|Molecules)\b/i;
                      isMdpiFromApi = (
                        (record.publisher_name && record.publisher_name.toLowerCase().includes('mdpi')) ||
                        (record.copyright && record.copyright.toLowerCase().includes('mdpi')) ||
                        (record.journal_title && API_MDPI_JOURNALS_REGEX.test(record.journal_title))
                      );
                    }
                    runCache.set(idThisRecordIsFor, isMdpiFromApi);
                    ncbiApiCache.set(idThisRecordIsFor, isMdpiFromApi); // Store in persistent API cache
                    if (isMdpiFromApi) {
                      foundMdpiInThisBatch = true;
                    }
                  }
                });
              }
              // Ensure all IDs *queried in this specific batch* get an entry in both caches,
              // even if they weren't in the API response (e.g. invalid IDs).
              batchIdsToQuery.forEach(id => {
                if (!runCache.has(id)) { // If an ID in the batch wasn't in the response
                  runCache.set(id, false);
                  ncbiApiCache.set(id, false); // Also update persistent API cache
                }
              });

              if (foundMdpiInThisBatch) {
                overallFoundMdpiInBatches = true;
              }
            } else {
              // console.warn(`[MDPI Filter API] NCBI API request failed for batch ${idType.toUpperCase()}s (starting with ${batchIdsToQuery[0]}): ${response.status}`);
              batchIdsToQuery.forEach(id => {
                runCache.set(id, false);
                ncbiApiCache.set(id, false); // Cache failure as false in persistent API cache
              });
            }
          } catch (error) {
            // console.error(`[MDPI Filter API] Error fetching batch from NCBI API for ${idType.toUpperCase()}s (starting with ${batchIdsToQuery[0]}):`, error);
            batchIdsToQuery.forEach(id => {
              runCache.set(id, false);
              ncbiApiCache.set(id, false); // Cache error as false in persistent API cache
            });
          }
        }
        // After processing API calls, check all original input 'ids' against the now populated runCache.
        return ids.some(id => runCache.get(id) === true);
      }

      // Wrapper function for isMdpiItemByContent that uses the citationProcessCache
      const isMdpiItemByContent = (item, runCache) => {
        if (!item) return false; // Cannot cache null/undefined item

        // Check cache first
        if (citationProcessCache.has(item)) {
          return citationProcessCache.get(item);
        }

        // If not in cache, run the logic from the new module
        // MDPI_DOI and MDPI_DOMAIN are available in this scope from the outer content_script.js definitions
        const result = window.MDPIFilterItemContentChecker.checkItemContent(item, runCache, MDPI_DOI, MDPI_DOMAIN);

        // Store the result in the cache
        citationProcessCache.set(item, result);
        return result;
      };

      const extractReferenceData = (item) => {
        // Ensure MDPIFilterReferenceIdExtractor is available, e.g., through dependency check or script load order
        if (!window.MDPIFilterReferenceIdExtractor) {
            // Fallback or early return if critical dependency is missing
            const tempFallbackId = `mdpi-ref-err-${refIdCounter++}`;
            return {
                id: tempFallbackId,
                listItemDomId: item.id || item.dataset.bibId || `unknown-id-${tempFallbackId}`, // Provide some form of ID
                number: null,
                text: "Error: ID Extractor Missing",
                link: null,
                rawHTML: sanitize(item.innerHTML),
                fingerprint: `error-${tempFallbackId}`,
                numberSource: "error"
            };
        }
        const idExtractionResult = window.MDPIFilterReferenceIdExtractor.extractInternalScrollId(item, refIdCounter);
        const internalScrollId = idExtractionResult.extractedId;
        refIdCounter = idExtractionResult.updatedRefIdCounter; // Update the refIdCounter in the outer scope
        
        // Capture the actual DOM ID of the list item, or use data-bib-id as a fallback for linking,
        // particularly for Wiley sites where inline links use href="#[data-bib-id value]".
        // MODIFIED LOGIC FOR listItemDomId:
        let determinedListItemDomId = item.id || item.dataset.bibId;

        if (!determinedListItemDomId) {
          // If the item itself doesn't have an ID, check for common child elements that might hold the linkable ID.
          // Example: Nature/Springer often have <p id="ref-CRXX"> or <span id="ref-CRXX"> within the <li>.
          // Also check for common ID patterns like Bxx (NCBI) or citxxx (T&F).
          const childWithId = item.querySelector(
            'p[id^="ref-CR"], p[id^="B"], p[id^="cit"], ' +
            'div[id^="ref-CR"], div[id^="B"], div[id^="cit"], ' +
            'span[id^="ref-CR"], span[id^="B"], span[id^="cit"]'
          );
          if (childWithId && childWithId.id) {
            determinedListItemDomId = childWithId.id;
          }
        }
        // Ensure listItemDomId is always a string, using internalScrollId as a fallback base.
        // internalScrollId is expected to be defined from idExtractionResult.extractedId before this block.
        const listItemDomId = determinedListItemDomId || `mdpi-filter-unknown-item-id-${internalScrollId}`; // This ID is used for generating inline footnote selectors

        let number = null;
        let text = '';
        const localSanitize = window.sanitize || (htmlInput => htmlInput.replace(/<[^>]+>/g, ''));
        let numberSource = "none"; // To track where the number came from

        // 1. Try data-counter attribute
        if (item.dataset.counter) {
          const parsedCounter = parseInt(item.dataset.counter, 10);
          if (!isNaN(parsedCounter)) {
            number = parsedCounter;
            numberSource = "data-counter";
          }
        }

        // 2. Try to parse from ID (listItemDomId or parent's ID)
        if (number === null) {
          let idSourceElement = item; 
          if (item.matches && item.matches('div.citation, div.citation-content') && item.parentElement && item.parentElement.id) {
              idSourceElement = item.parentElement;
          } else if (!item.id && item.closest) { 
              const closestWithRefId = item.closest('[id^="r"], [id^="ref-"], [id^="cite_note-"], [id^="CR"], [id^="B"], [id^="cit"]'); // Added cit here for completeness with regex
              if (closestWithRefId) {
                  idSourceElement = closestWithRefId;
              }
          }
          
          // Use idSourceElement.id, which could be listItemDomId if item has an ID, or an ancestor's ID
          if (idSourceElement && idSourceElement.id) {
              const idMatch = idSourceElement.id.match(/(?:CR|B|ref-|reference-|cite_note-|r|cit)(\d+)/i); // Added 'cit'
              if (idMatch && idMatch[1]) {
                  const parsedIdNum = parseInt(idMatch[1], 10);
                  if (!isNaN(parsedIdNum)) {
                      number = parsedIdNum;
                      numberSource = `id-attribute ('${idSourceElement.id}')`;
                  }
              }
          }
        }

        // 3. Try specific label elements
        if (number === null) {
          let labelTextContent = null;
          const labelSelectors = '.reference-label, .ref-count, .c-article-references__counter, .refnumber, .citation-number, .label, .ref-label, .ref-num, .ref-number';
          let labelElement = item.querySelector(labelSelectors);
          
          if (labelElement && labelElement.textContent) {
            labelTextContent = labelElement.textContent;
          } else { // Try finding in closest list item if item itself is not the LI
              const commonListItemSelectors = 'li, div[role="listitem"], tr';
              const closestListItem = item.closest(commonListItemSelectors);
              if (closestListItem) {
                  labelElement = closestListItem.querySelector(labelSelectors);
                  if (labelElement && labelElement.textContent) {
                  labelTextContent = labelElement.textContent;
                  }
              }
          }
          
          if(!labelTextContent) { // Try previous sibling of item or its direct parent
              let targetForPrevSibling = item;
              if (item.matches && item.matches('div.citation-content, div.csl-entry') && item.parentElement) {
                  targetForPrevSibling = item.parentElement;
              }
              if (targetForPrevSibling.previousElementSibling) {
                  const prevSibling = targetForPrevSibling.previousElementSibling;
                  // Ensure previous sibling is not an anchor itself, to avoid grabbing footnote links
                  if (prevSibling.matches && prevSibling.matches(labelSelectors.split(',').map(s => s.trim() + ':not(a)').join(','))) {
                      if (prevSibling.textContent) {
                          labelTextContent = prevSibling.textContent;
                      }
                  }
              }
          }

          if (labelTextContent) {
            const cleanedText = labelTextContent.trim().replace(/[\[\]().]/g, ''); // More aggressive cleaning for labels
            const numMatch = cleanedText.match(/^(\d+)/);
            if (numMatch && numMatch[1]) {
              number = parseInt(numMatch[1], 10);
              numberSource = `label ('${labelTextContent.trim()}')`;
            }
          }
        }
        
        const referenceStartRegex = /^\s*\[?(\d+)\]?\s*\.?\s*/; 

        let rawTextContent = '';
        // Prioritize specific text containers if they exist
        const specificTextElement = item.querySelector(
          'p.c-article-references__text, div.reference-content, div.citation-text, span.reference-text, div.citation__summary, li > p, .c-bibliographic-information__title, .hlFld-Title, .csl-entry'
        );

        if (specificTextElement) {
          rawTextContent = specificTextElement.textContent || '';
        } else {
          // Fallback: clone the item and remove known non-content elements
          const clone = item.cloneNode(true);
          const selectorsToRemove = [
              '.c-article-references__links', '.reference-links', '.ref-label', 
              '.reference-label', '.ref-count', '.c-article-references__counter', 
              '.refnumber', '.citation-number', '.label', 'ul.c-article-references__links',
              '.c-article-references__links-list', '.access-options', '.icon-file-pdf', '.extra-links',
              'sup', // Remove sup elements which might contain citation numbers
              'span[class*="label"], span[class*="counter"]' // Generic label/counter spans
          ];
          clone.querySelectorAll(selectorsToRemove.join(', ')).forEach(el => el.remove());
          rawTextContent = clone.textContent || '';
        }
        rawTextContent = rawTextContent.trim();

        // 4. Try to extract number from the start of the rawTextContent (was 5)
        if (number === null) {
          const textNumMatch = rawTextContent.match(referenceStartRegex);
          if (textNumMatch && textNumMatch[1]) {
            const parsedTextNum = parseInt(textNumMatch[1], 10);
            if (!isNaN(parsedTextNum)) {
              number = parsedTextNum;
              numberSource = `rawTextContent start ('${rawTextContent.substring(0,20)}...')`;
            }
          }
        }

        // 5. Try to determine number from <ol> parent (was 5b)
        if (number === null && item.tagName === 'LI') {
          const parentOl = item.parentElement;
          if (parentOl && parentOl.tagName === 'OL') {
            const listItems = Array.from(parentOl.children).filter(child => child.tagName === 'LI');
            const indexInList = listItems.indexOf(item);
            if (indexInList !== -1) {
              let startValue = 1;
              if (parentOl.hasAttribute('start')) {
                const parsedStart = parseInt(parentOl.getAttribute('start'), 10);
                if (!isNaN(parsedStart)) {
                  startValue = parsedStart;
                }
              }
              number = startValue + indexInList;
              numberSource = `OL (index ${indexInList}, start ${startValue})`;
            }
          }
        }

        text = rawTextContent;
        // Remove the extracted number prefix from the text if a number was found
        // This ensures the base text is clean before we potentially prepend our formatted number
        if (number !== null) {
          const prefixRegex = new RegExp(`^\\s*(?:\\[${number}\\]|${number})\\s*[.)]?\\s*`);
          text = text.replace(prefixRegex, '').trim();
        }
        text = localSanitize(text); 

        // Use the globally defined selectors from link_extraction_selectors.js
        const linkSelectorsToUse = window.MDPIFilterLinkExtractionSelectors;
        
        // Call the dedicated link extraction function from link_extractor.js
        link = window.MDPIFilterLinkExtractor.extractPrimaryLink(item, linkSelectorsToUse);

        const textForFingerprint = text;
        const normalizedTextForFingerprint = (textForFingerprint || '').replace(/\s+/g, ' ').trim().substring(0, 100);
        const fingerprint = `${normalizedTextForFingerprint}|${link || ''}`;
        
        console.log(`%c[extractReferenceData - ${internalScrollId}] DOM ID: ${listItemDomId || 'N/A'}, Link: ${link || 'N/A'}, FP: ${fingerprint.substring(0,50)}... Num: ${number} (Source: ${numberSource}), Text (for popup): "${text.substring(0, 30)}..."`, 'color: green;');
        return { 
          id: internalScrollId, 
          listItemDomId: listItemDomId, 
          number, 
          text: text, // This text now includes the prepended number if found
          link: link, 
          rawHTML: sanitize(item.innerHTML), 
          fingerprint, 
          numberSource 
        };
      };

      // This is the definition of processAllReferences that should be kept
      function processAllReferences(runCache) {
        console.log("[MDPI Filter] processAllReferences STARTING. Selectors:", referenceListSelectors);
        const items = document.querySelectorAll(referenceListSelectors);
        console.log(`[MDPI Filter] Found ${items.length} potential reference items using current selectors.`);

        items.forEach((item, index) => {
          // Prevent processing known dynamic elements like MediaWiki's UTCLiveClock
          // Common IDs for UTCLiveClock are 'utcdate' or 'pt-utcdate' (often within an <li>)
          if (item.id === 'utcdate' || item.closest('#utcdate') || item.id === 'pt-utcdate' || item.closest('#pt-utcdate')) {
            return;
          }

          const hasWileyAttribute = item.hasAttribute('data-bib-id');
          const isMdpi = isMdpiItemByContent(item, runCache);

          if (isMdpi) {
            console.log(`[MDPI Filter] Item ${index} IS MDPI. Extracting data...`, item);
            // Call extractReferenceData first to get the correct ID.
            // refIdCounter is managed internally by extractReferenceData via extractInternalScrollId.
            const referenceData = extractReferenceData(item); 
            
            console.log(`[MDPI Filter] Item ${index} extracted data:`, referenceData);
            collectedMdpiReferences.push(referenceData);
            
            // Use referenceData.id (which was generated by extractInternalScrollId)
            // when calling styleRef. This ensures the DOM attribute matches the ID in the popup.
            styleRef(item, referenceData.id); 
            
            console.log(`[MDPI Filter] Item ${index} (MDPI) styled and added. Ref ID used for DOM: ${referenceData.id}`);
          }
        });
        console.log("[MDPI Filter] processAllReferences FINISHED. Collected MDPI references count:", collectedMdpiReferences.length);
      }

      const updateBadgeAndReferences = () => {
        // Create a unique set of references based on fingerprint for the popup list
        const uniqueFingerprints = new Set();
        const uniqueDisplayReferences = [];
        collectedMdpiReferences.forEach(refObject => { // Renamed to avoid confusion
          if (refObject && refObject.fingerprint && !uniqueFingerprints.has(refObject.fingerprint)) {
            uniqueFingerprints.add(refObject.fingerprint);
            uniqueDisplayReferences.push(refObject);
          } else if (!refObject || !refObject.fingerprint) {
            // console.warn('[MDPI Filter CS] Skipping refObject in updateBadgeAndReferences due to missing fingerprint:', refObject);
          }
        });

        const sortedReferences = uniqueDisplayReferences.sort((a, b) => { // Sort the unique ones
          if (a.number !== null && b.number === null) return -1;
          if (a.number === null && b.number !== null) return 1;
          if (a.number !== null && b.number !== null) {
            if (a.number !== b.number) {
              return a.number - b.number;
            }
          }
          const numA = parseInt(a.id.split('-').pop(), 10);
          const numB = parseInt(b.id.split('-').pop(), 10);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.id.localeCompare(b.id);
        });
        
        const badgeCount = sortedReferences.length; 

        // Log the first item from sortedReferences BEFORE the map operation
        if (sortedReferences.length > 0) {
          console.log(`%c[MDPI Filter CS] updateBadgeAndReferences: First item in sortedReferences (BEFORE .map):\n  ref.text="${sortedReferences[0].text}"\n  ref.link="${sortedReferences[0].link}"`, 'color: purple; font-weight: bold;');
        }

        // Transform references for the popup, ensuring URL is decoded and under the 'url' property
        const referencesForPopup = sortedReferences.map((ref, index) => { // Added index for logging
          const popupRef = {
            id: ref.id,
            fingerprint: ref.fingerprint,
            number: ref.number,
            text: ref.text, 
            isMdpi: ref.isMdpi, 
            url: ref.link 
          };
          
          // Log the state of popupRef.text BEFORE attempting to decode it for the first item
          if (index === 0) {
              console.log(`%c[MDPI Filter CS] updateBadgeAndReferences (map): First item's popupRef.text BEFORE decodeUrlsInString: "${popupRef.text}"`, 'color: orange; font-weight: bold;');
          }

          if (popupRef.text && typeof popupRef.text === 'string') {
              popupRef.text = decodeUrlsInString(popupRef.text);
          }

          return popupRef;
        });

        if (referencesForPopup.length > 0) {
          console.log(`%c[MDPI Filter CS] updateBadgeAndReferences: Sending ${referencesForPopup.length} items. First item text after decodeUrlsInString: "${referencesForPopup[0].text}"`, 'color: blue; font-weight: bold;');
          // console.log('%c[MDPI Filter CS] First full reference object for popup:', 'color: blue;', referencesForPopup[0]); // For more detailed inspection if needed
        } else {
          console.log(`%c[MDPI Filter CS] updateBadgeAndReferences: No references to send to popup.`, 'color: blue; font-weight: bold;');
        }
        
        // Add a check for chrome.runtime and chrome.runtime.id before sending the message
        if (chrome.runtime && chrome.runtime.id) {
          chrome.runtime.sendMessage({
              action: "mdpiUpdate",
              data: {
                  badgeCount: badgeCount,
                  references: referencesForPopup // Send the transformed array
              }
          }, response => {
              if (chrome.runtime.lastError) {
                  // Use console.error for better visibility of errors
                  console.error(`[MDPI Filter CS] sendMessage failed for mdpiUpdate: ${chrome.runtime.lastError.message}`);
              } else {
                  // console.log("[MDPI Filter CS] mdpiUpdate message sent successfully, response:", response);
              }
          });
        } else {
          console.warn("[MDPI Filter CS] Skipping sendMessage for mdpiUpdate: Extension context likely invalidated.");
        }
      };

      // Debounced version for progressive updates
      const debouncedUpdateBadgeAndReferences = debounce(updateBadgeAndReferences, 300);


      async function runAll(source = "initial") {
        // Check for valid extension context at the very beginning
        if (!(chrome.runtime && chrome.runtime.id)) {
          console.warn(`[MDPI Filter] runAll (${source}) aborted: Extension context invalidated.`);
          isProcessing = false; // Ensure isProcessing is reset if we abort early
          return;
        }

        const startTime = new Date();
        // ... (rest of runAll initialization) ...
        // console.log(`[MDPI Filter] runAll STARTING... Source: ${source}, Time: ${startTime.toISOString()}`);

        if (isProcessing && source !== "initial_force") {
          // console.log('[MDPI Filter] Already processing, skipping runAll for source:', source);
          return;
        }
        isProcessing = true;

        if (source === "initial load" || source === "main observer" || source === "initial_force") {
          // console.log(`[MDPI Filter] Clearing all references for full re-scan due to source: ${source}`);
          clearPreviousHighlights();
          collectedMdpiReferences = [];
          // refIdCounter = 0; // DO NOT RESET HERE TO MAINTAIN ID UNIQUENESS ACROSS RUNS
        }
        
        const runCache = new Map();

        // --- Step 1: Pre-fetch all NCBI IDs ---
        const allPotentialItemsForNcbiScan = document.querySelectorAll(referenceListSelectors);
        let allPmcidsToFetch = new Set();
        let allPmidsToFetch = new Set();

        allPotentialItemsForNcbiScan.forEach(item => {
          // ... (ID extraction logic as before) ...
        });

        // console.log("[MDPI Filter] NCBI Pre-scan - PMIDs to fetch:", Array.from(allPmidsToFetch));
        // console.log("[MDPI Filter] NCBI Pre-scan - PMCIDs to fetch:", Array.from(allPmcidsToFetch));

        // Perform NCBI checks if any IDs were found
        const pmidArray = Array.from(allPmidsToFetch);
        const pmcidArray = Array.from(allPmcidsToFetch);

        // Batch API calls
        const pmidCheckPromise = pmidArray.length > 0 ? checkNcbiIdsForMdpi(pmidArray, 'pmid', runCache) : Promise.resolve(false);
        const pmcidCheckPromise = pmcidArray.length > 0 ? checkNcbiIdsForMdpi(pmcidArray, 'pmcid', runCache) : Promise.resolve(false);
        
        try {
          await Promise.all([pmidCheckPromise, pmcidCheckPromise]);
          // console.log('[MDPI Filter] NCBI ID checks completed. RunCache populated:', runCache.size > 0 ? Object.fromEntries(runCache) : 'empty');

          // --- Step 2: Process and style references ---
          processAllReferences(runCache); // This will now call debouncedUpdateBadgeAndReferences internally

          // --- Step 3: Process direct MDPI links on the page ---
          processDirectMdpiLinks();

          // --- Step 3.5 (New): Process "Cited By" Entries ---
          // These are styled but NOT added to collectedMdpiReferences for the popup.
          if (window.MDPIFilterCitedBy && window.MDPIFilterCitedBy.Processor && window.MDPIFilterCitedBy.Processor.processEntries) {
            // console.log('[MDPI Filter CS] Calling CitedBy.Processor.processEntries...');
            window.MDPIFilterCitedBy.Processor.processEntries(isMdpiItemByContent, runCache);
          } else {
            // console.warn('[MDPI Filter CS] MDPIFilterCitedBy.Processor.processEntries function is not available.');
          }

          // --- Step 4: Style inline footnotes ---
          // Call the function from MDPIFilterUtils and pass collectedMdpiReferences
          if (window.MDPIFilterUtils && window.MDPIFilterUtils.styleInlineFootnotes) {
            window.MDPIFilterUtils.styleInlineFootnotes(collectedMdpiReferences);
          }

          // --- Step 5: Final update to badge and references ---
          // This ensures that even if processAllReferences found nothing (so debounced didn't fire),
          // or if there are pending debounced calls, a final accurate state is sent.
          updateBadgeAndReferences(); // Final call

        } catch (error) {
          console.error('[MDPI Filter] Error in runAll main processing:', error);
        } finally {
          isProcessing = false;
          const endTime = new Date();
          const duration = (endTime - startTime) / 1000;
          // The 'unique' here refers to a different set, let's clarify or remove if not used for badge
          console.log(`[MDPI Filter] runAll FINISHED. Source: ${source}, collected (raw): ${collectedMdpiReferences.length}, Time: ${endTime.toISOString()}, Duration: ${duration.toFixed(2)}s`);
        }
      }

      const debouncedRunAll = window.debounce(runAll, 250);

      function setupMainObserver() {
        if (mainObserverInstance) {
          mainObserverInstance.disconnect(); // Disconnect previous if any
        }
        mainObserverInstance = new MutationObserver((mutationsList, observer) => {
          // console.log('[MDPI Filter] Main observer detected DOM change.');
          // No need to iterate mutationsList if we're just debouncing a full run
          debouncedRunAll("main observer");
        });

        mainObserverInstance.observe(document.documentElement, {
          childList: true,
          subtree: true
        });
        // console.log("[MDPI Filter] Main MutationObserver set up.");
      }

      if (window.MDPIFilterDomains && window.sanitize) {
        // console.log("[MDPI Filter] Dependencies loaded. Requesting initial runAll and setting up observers.");
        requestAnimationFrame(async () => { // Make callback async
          // console.log("[MDPI Filter] Running initial runAll via requestAnimationFrame.");
          await runAll("initial load");          setupMainObserver();
        });
      } else {
        console.error("[MDPI Filter CS] Halting script: MDPIFilterDomains or sanitize not found.");
      }

      window.addEventListener('hashchange', () => {
        // console.log('[MDPI Filter CS] Hash changed, potentially re-running for new content.');
        debouncedRunAll("hashchange");
      });

      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'getSettings') {
          sendResponse({ mode: mode }); // Send current mode back
          return false; // Synchronous response, channel can be closed.
        } else if (msg.action === "updateSettings" && msg.settings && typeof msg.settings.mode !== 'undefined') {
            // console.log("[MDPI Filter CS] Received updateSettings, new mode:", msg.settings.mode);
            mode = msg.settings.mode;
            // Potentially re-run or clear/re-apply styles based on the new mode
            sendResponse({ success: true, message: "Settings acknowledged by content script." });
            return false; // Synchronous response, channel can be closed.
        } else if (msg.type === 'scrollToRefOnPage' && msg.refId) { // Changed 'scrollToRef' to 'scrollToRefOnPage'
          console.log(`[MDPI Filter CS] Received scrollToRefOnPage for ID: ${msg.refId}`);
          const targetElement = document.querySelector(`[data-mdpi-filter-ref-id="${msg.refId}"]`);

          const performScroll = (elementToScroll, refIdForResponse) => {
            elementToScroll.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Optional: Add a visual cue to the scrolled element
            elementToScroll.style.outline = `3px dashed ${mdpiColor}`; // Use defined mdpiColor
            setTimeout(() => {
              if (elementToScroll) elementToScroll.style.outline = '';
            }, 2500);
            console.log(`[MDPI Filter CS] Scrolled to ${refIdForResponse}`);
            sendResponse({ success: true, refId: refIdForResponse });
          };

          if (targetElement) {
            console.log(`[MDPI Filter CS] Found target element for ${msg.refId}:`, targetElement);

            // Check for Wiley-specific accordion structure
            const currentHostname = window.location.hostname;
            const currentHref = window.location.href; // Get the full URL

            const isDirectWileySite = currentHostname.includes('onlinelibrary.wiley.com');
            // Make proxied check wider:
            // 1. Hostname contains 'onlinelibrary-wiley-com' (e.g., for OCLC proxy)
            // 2. Full href contains 'onlinelibrary.wiley.com/' (for some path-based proxies or if domain is in query params)
            const isProxiedWileySite = currentHostname.includes('onlinelibrary-wiley-com') || 
                                       currentHref.includes('onlinelibrary.wiley.com/');

            if (isDirectWileySite || isProxiedWileySite) {
              console.log("[MDPI Filter CS] Wiley site (direct or proxied) detected, checking accordion.");
              const accordionContent = targetElement.closest('div.accordion__content');

              if (accordionContent && accordionContent.id) {
                console.log("[MDPI Filter CS] Found accordion content:", accordionContent);
                const controlIdQuery = "id" + accordionContent.id; // Wiley's aria-controls often prefixes content id with "id"
                const accordionControl = document.querySelector(`div.accordion__control[aria-controls="${controlIdQuery}"]`);

                if (accordionControl) {
                  console.log("[MDPI Filter CS] Found accordion control:", accordionControl);
                  const isExpanded = accordionControl.getAttribute('aria-expanded') === 'true';
                  const isDisplayed = window.getComputedStyle(accordionContent).display !== 'none';

                  if (!isExpanded || !isDisplayed) {
                    console.log("[MDPI Filter CS] Wiley accordion is closed. Clicking control to open.");
                    accordionControl.click(); // Simulate click to open

                    const startTime = Date.now();
                    const maxWaitTime = 2000; // Max wait 2 seconds

                    function checkAndScrollAfterAccordionOpen() {
                      const currentAccordionStyle = window.getComputedStyle(accordionContent);
                      const isAccordionNowDisplayed = currentAccordionStyle.display !== 'none' && currentAccordionStyle.visibility !== 'hidden';
                      const isTargetRendered = targetElement.offsetHeight > 0;

                      if (isAccordionNowDisplayed && isTargetRendered) {
                        console.log("[MDPI Filter CS] Wiley accordion open and target rendered, attempting scroll.");
                        performScroll(targetElement, msg.refId);
                      } else if (Date.now() - startTime < maxWaitTime) {
                        // console.log("[MDPI Filter CS] Wiley accordion not ready, retrying...");
                        requestAnimationFrame(checkAndScrollAfterAccordionOpen);
                      } else {
                        console.warn(`[MDPI Filter CS] Wiley accordion did not open or target not rendered within ${maxWaitTime}ms. Accordion display: ${currentAccordionStyle.display}, visibility: ${currentAccordionStyle.visibility}. Target offsetHeight: ${targetElement.offsetHeight}. Attempting scroll anyway.`);
                        performScroll(targetElement, msg.refId); // Fallback: attempt scroll
                      }
                    }
                    requestAnimationFrame(checkAndScrollAfterAccordionOpen); // Start the check loop
                  } else {
                    console.log("[MDPI Filter CS] Wiley accordion already open.");
                    performScroll(targetElement, msg.refId);
                  }
                } else {
                  console.warn(`[MDPI Filter CS] Wiley accordion control not found for content ID: ${accordionContent.id} (expected aria-controls="${controlIdQuery}")`);
                  performScroll(targetElement, msg.refId); // Attempt scroll anyway
                }
              } else {
                console.log("[MDPI Filter CS] Not within a recognized Wiley accordion content, or accordion structure not found/missing ID.");
                performScroll(targetElement, msg.refId); // Standard scroll
              }
            } else {
              // Not Wiley, or no special handling needed
              console.log("[MDPI Filter CS] Not a Wiley site or no special accordion handling needed.");
              performScroll(targetElement, msg.refId);
            }
          } else {
            console.warn(`[MDPI Filter CS] scrollToRefOnPage: Element with ID ${msg.refId} not found.`);
            sendResponse({ success: false, error: 'Element not found', refId: msg.refId });
          }
          return true; // Crucial: Indicates that sendResponse will be called asynchronously
        }
        // Add other 'else if' for other message types if necessary.
        // If no other message types are async, or if they handle their own 'return true',
        // then no further changes are needed here for them.
      });
    });
  } // End of else (dependenciesMet)
} // End of if (!window.mdpiFilterInjected)

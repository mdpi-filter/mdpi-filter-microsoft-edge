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
  if (typeof window.MDPIFilterReferenceIdExtractor === 'undefined' || typeof window.MDPIFilterReferenceIdExtractor.extractInternalScrollId !== 'function') {
    missingDependencies.push("MDPIFilterReferenceIdExtractor (from reference_id_extractor.js)");
    dependenciesMet = false;
  }
  if (typeof window.MDPIFilterNcbiApiHandler === 'undefined' || typeof window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi !== 'function') {
    missingDependencies.push("MDPIFilterNcbiApiHandler (from ncbi_api_handler.js)");
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

    // Check if the runtime and its ID are available before trying to access storage
    if (chrome.runtime && chrome.runtime.id) {
      chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
        // Check for errors after the async storage operation
        if (chrome.runtime.lastError) {
          console.error(`[MDPI Filter CS] Error accessing storage: ${chrome.runtime.lastError.message}. Halting script initialization for this frame.`);
          return; // Abort if storage access failed
        }

        // Re-check runtime context after the async operation, as it might have been invalidated
        if (!(chrome.runtime && chrome.runtime.id)) {
          console.warn("[MDPI Filter CS] Extension context became invalidated after storage.sync.get. Halting script initialization for this frame.");
          return; // Abort if context is now invalid
        }

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

        async function processAllReferences(runCache) { // runCache is a Map, typically new for each full run
          if (isProcessing) {
            // console.log("[MDPI Filter] processAllReferences skipped, already processing.");
            return;
          }
          isProcessing = true;
          console.log("[MDPI Filter CS] processAllReferences STARTING. Initial runCache size:", runCache.size);

          clearPreviousHighlights();
          uniqueMdpiReferences.clear();
          collectedMdpiReferences = [];
          refIdCounter = 0; // Reset counter for each full processing run

          const referenceItems = Array.from(document.querySelectorAll(referenceListSelectors));
          console.log(`[MDPI Filter CS] Found ${referenceItems.length} potential reference items using current selectors.`);

          // --- Batch 1: Collect all unique NCBI IDs from the page ---
          const pmidsToLookup = new Set();
          const pmcidsToLookup = new Set();

          referenceItems.forEach(item => {
            const allLinksInItem = Array.from(item.querySelectorAll('a[href]'));
            for (const link of allLinksInItem) {
              if (link.href) {
                const pmcMatch = link.href.match(/ncbi\.nlm\.nih\.gov\/pmc\/articles\/(PMC\d+)/i);
                if (pmcMatch && pmcMatch[1]) {
                  const pmcid = pmcMatch[1].toUpperCase();
                  pmcidsToLookup.add(pmcid); // Add all found PMCIDs
                } else {
                  const pmidMatch = link.href.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
                  if (pmidMatch && pmidMatch[1]) {
                    const pmid = pmidMatch[1];
                    pmidsToLookup.add(pmid); // Add all found PMIDs
                  }
                }
              }
            }
          });

          console.log(`[MDPI Filter CS] Collected unique NCBI IDs for potential API lookup. PMIDs: ${pmidsToLookup.size}, PMCIDs: ${pmcidsToLookup.size}`);
          if (pmidsToLookup.size > 0) console.log("[MDPI Filter CS] PMIDs to check:", Array.from(pmidsToLookup));
          if (pmcidsToLookup.size > 0) console.log("[MDPI Filter CS] PMCIDs to check:", Array.from(pmcidsToLookup));

          // --- API Calls (if needed) ---
          // checkNcbiIdsForMdpi will handle ncbiApiCache internally and populate runCache
          let ncbiApiPotentiallyCalled = false;
          if (pmidsToLookup.size > 0) {
            console.log(`[MDPI Filter CS] Calling checkNcbiIdsForMdpi for ${pmidsToLookup.size} PMIDs.`);
            await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(Array.from(pmidsToLookup), 'pmid', runCache, ncbiApiCache);
            ncbiApiPotentiallyCalled = true;
          }
          if (pmcidsToLookup.size > 0) {
            console.log(`[MDPI Filter CS] Calling checkNcbiIdsForMdpi for ${pmcidsToLookup.size} PMCIDs.`);
            await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(Array.from(pmcidsToLookup), 'pmcid', runCache, ncbiApiCache);
            ncbiApiPotentiallyCalled = true;
          }

          if (ncbiApiPotentiallyCalled) {
            console.log("[MDPI Filter CS] NCBI ID processing completed. runCache should now be updated from ncbiApiCache and/or API calls. runCache size:", runCache.size);
          } else {
            console.log("[MDPI Filter CS] No NCBI IDs found on page to send to API handler.");
          }

          // --- Batch 2: Process items using (now populated) runCache ---
          referenceItems.forEach((item, index) => {
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
          isProcessing = false;
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
          if (isProcessing && source !== "mutation") {
            // console.log(`[MDPI Filter CS] runAll (${source}) aborted, processing already in progress.`);
            return;
          }
          isProcessing = true;
          // console.log(`%c[MDPI Filter CS] runAll triggered by: ${source}`, "color: blue; font-weight: bold;");

          clearPreviousHighlights();

          // Create a new run-specific cache for this execution of runAll
          // This cache is used by functions called within this runAll execution.
          const currentRunCache = new Map();

          // Reset collected references for this run
          collectedMdpiReferences = [];
          uniqueMdpiReferences.clear();
          refIdCounter = 0; // Reset refIdCounter for each full run

          // --- Order of Operations ---
          // 1. Process reference lists (which might use NCBI lookups)
          //    - processAllReferences internally calls extractReferenceData
          //    - extractReferenceData might call isMdpiItemByContent (for text checks)
          //    - isMdpiItemByContent might call checkNcbiIdsForMdpi (for ID checks)
          //      (Correction: isMdpiItemByContent primarily checks text content.
          //       checkNcbiIdsForMdpi is more likely called directly by processAllReferences or similar logic
          //       when dealing with lists of PMIDs/DOIs not directly in reference text, e.g. from search results)

          // For processAllReferences, it will iterate through items. If an item contains IDs that need checking,
          // it would call:
          // await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(idsFromItem, idType, currentRunCache, ncbiApiCache);
          // This is a conceptual placement; the actual call depends on how IDs are extracted and when they need validation.
          // The existing processAllReferences focuses on text and link content.
          // If NCBI checks are needed *per reference item* based on extracted IDs, that logic would go inside processAllReferences.

          processAllReferences(currentRunCache); // Pass the run-specific cache

          // 2. Process "Cited By" sections (these might also need NCBI lookups if they list PMIDs/DOIs)
          //    The current cited_by_processor.js uses isMdpiItemByContent, which checks text.
          //    If it needs to check a list of IDs from a "Cited By" entry, it would also use:
          //    await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(citedByIds, idType, currentRunCache, ncbiApiCache);
          if (window.MDPIFilterCitedBy && window.MDPIFilterCitedBy.Processor) {
            // console.log("[MDPI Filter CS] Processing 'Cited By' entries...");
            // The processEntries function in cited_by_processor.js needs access to ncbiApiCache and currentRunCache
            // if it's going to call checkNcbiIdsForMdpi.
            // It also needs MDPI_DOI and MDPI_DOMAIN for its internal text checks.
            window.MDPIFilterCitedBy.Processor.processEntries(
              currentRunCache,    // For caching results within this run
              ncbiApiCache,       // For persistent NCBI API results
              MDPI_DOI,
              MDPI_DOMAIN,
              MDPI_DOI_REGEX,
              styleDirectLink,    // Pass the styling function
                                  // Pass the main checkNcbiIdsForMdpi function if needed by the processor
              window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi
            );
          }


          // 3. Process direct MDPI links on the page (not part of references or "Cited By" sections already handled)
          processDirectMdpiLinks();

          // 4. Process search engine results (if applicable)
          //    This is where checkNcbiIdsForMdpi is most likely to be used heavily if search results provide PMIDs/DOIs.
          if (isSearchEnginePage()) {
            // console.log("[MDPI Filter CS] Processing search engine results...");
            await processSearchEngineResults(currentRunCache); // Pass the run-specific cache
          }

          // 5. Style inline footnotes
          if (window.MDPIFilterUtils && window.MDPIFilterUtils.styleInlineFootnotes) {
            // console.log("[MDPI Filter CS] Styling inline MDPI footnotes...");
            const inlineFootnoteSelectors = window.MDPIFilterUtils.generateInlineFootnoteSelectors(MDPI_DOMAIN, MDPI_DOI_REGEX.source.replace(/\\/g, ''));
            window.MDPIFilterUtils.styleInlineFootnotes(inlineFootnoteSelectors, mdpiColor);
          }

          // Update badge and send message to background
          updateBadgeAndReferences(); // This uses collectedMdpiReferences

          isProcessing = false;
          // console.log(`%c[MDPI Filter CS] runAll (${source}) finished.`, "color: blue; font-weight: bold;");
        }

        async function processSearchEngineResults(runCache) {
          // console.log("[MDPI Filter CS] Starting processSearchEngineResults...");
          const { googleWeb, scholar, pubmed, europepmc } = domains;
          let foundMdpiOnPage = false;

          const processResults = async (domainConfig, domainName) => {
            if (!domainConfig || !domainConfig.itemSelector) {
              // console.log(`[MDPI Filter CS] No itemSelector for ${domainName}, skipping.`);
              return;
            }
            // console.log(`[MDPI Filter CS] Processing ${domainName} results with selector: ${domainConfig.itemSelector}`);
            const items = document.querySelectorAll(domainConfig.itemSelector);
            // console.log(`[MDPI Filter CS] Found ${items.length} items for ${domainName}.`);

            for (const item of items) {
              // Skip if already processed as part of a reference list or "Cited By"
              if (item.closest('[data-mdpi-filter-ref-id]') || item.closest('[data-mdpi-filter-cited-by-styled="true"]')) {
                continue;
              }

              let isMdpi = false;
              // Check 1: Content check (text, links within the item)
              if (isMdpiItemByContent(item, runCache)) { // Pass runCache
                isMdpi = true;
                // console.log(`[MDPI Filter CS - ${domainName}] MDPI item found by content:`, item);
              }

              // Check 2: NCBI ID check (if applicable and IDs can be extracted)
              if (!isMdpi && domainConfig.idExtraction) {
                const { idSelector, idType, idAttribute } = domainConfig.idExtraction;
                const idElements = idSelector ? item.querySelectorAll(idSelector) : [item]; // If no idSelector, use the item itself
                const idsToQuery = [];

                idElements.forEach(el => {
                  let idValue;
                  if (idAttribute) {
                    idValue = el.getAttribute(idAttribute);
                  } else {
                    idValue = el.textContent;
                  }
                  if (idValue) {
                    // Basic cleaning/validation if necessary
                    const cleanedId = idValue.trim();
                    if (cleanedId) idsToQuery.push(cleanedId);
                  }
                });

                if (idsToQuery.length > 0) {
                  // console.log(`[MDPI Filter CS - ${domainName}] Extracted IDs for NCBI check:`, idsToQuery, `Type: ${idType}`);
                  if (await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(idsToQuery, idType, runCache, ncbiApiCache)) {
                    isMdpi = true;
                    // console.log(`[MDPI Filter CS - ${domainName}] MDPI item confirmed by NCBI for IDs:`, idsToQuery);
                  }
                }
              }

              if (isMdpi) {
                styleSearch(item); // Apply styling or hiding
                foundMdpiOnPage = true;
                // Collect reference data if needed for popup, similar to processAllReferences
                // This part might need refinement based on what data can be reliably extracted from search results.
                // For now, we're just styling/hiding.
                // To add to popup:
                // const refData = extractReferenceDataFromSearchResult(item, refIdCounter++);
                // if (refData && !uniqueMdpiReferences.has(refData.fingerprint)) {
                //   uniqueMdpiReferences.add(refData.fingerprint);
                //   collectedMdpiReferences.push(refData);
                // }
              }
            }
          };

          if (window.location.hostname.includes('google.')) await processResults(googleWeb, 'Google Web');
          if (window.location.hostname.includes('scholar.google.')) await processResults(scholar, 'Google Scholar');
          if (window.location.hostname.includes('pubmed.ncbi.nlm.nih.gov')) await processResults(pubmed, 'PubMed');
          if (window.location.hostname.includes('europepmc.org')) await processResults(europepmc, 'Europe PMC');

          // console.log("[MDPI Filter CS] Finished processSearchEngineResults.");
          return foundMdpiOnPage;
        }


        const debouncedRunAll = window.debounce(runAll, 250);

        function setupMainObserver() {
          if (mainObserverInstance) {
            mainObserverInstance.disconnect(); // Disconnect previous if any
          }
          mainObserverInstance = new MutationObserver((mutationsList, observer) => {
            // Check for valid extension context before debouncing runAll
            if (!(chrome.runtime && chrome.runtime.id)) {
              console.warn('[MDPI Filter] Main observer: Extension context invalidated. Skipping debouncedRunAll.');
              // Optionally, disconnect the observer if the context is gone and unlikely to return for this frame.
              // if (observer) observer.disconnect(); // 'observer' is the mainObserverInstance itself
              return;
            }
            // console.log('[MDPI Filter] Main observer detected DOM change.');
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
    } else {
      console.warn("[MDPI Filter CS] Extension context invalidated before storage access. Main script logic will not execute for this frame.");
    }
  } // End of else (dependenciesMet)
} // End of if (!window.mdpiFilterInjected)

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
    const referenceListSelectors = window.MDPIFilterReferenceSelectors; // Defined by reference_selectors.js
    if (typeof referenceListSelectors === 'undefined' || referenceListSelectors === null || referenceListSelectors.trim() === '') {
      console.error("[MDPI Filter CS] CRITICAL: referenceListSelectors is undefined or empty after assignment from window.MDPIFilterReferenceSelectors. Value:", referenceListSelectors, "Window object value:", window.MDPIFilterReferenceSelectors);
    } else {
      // console.log("[MDPI Filter CS] referenceListSelectors initialized successfully:", referenceListSelectors.substring(0, 100) + "..."); // Log part of it
    }
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

        const mdpiColor = '#E2211C'; // Default MDPI Red, can be adjusted based on mode if needed

        let isProcessing = false; // Declare isProcessing here, inside the callback

        function clearPreviousHighlights() {
          document.querySelectorAll('.mdpi-highlighted-reference, .mdpi-hidden-reference').forEach(el => {
            el.classList.remove('mdpi-highlighted-reference', 'mdpi-hidden-reference');
            // Potentially remove other styles if they were directly applied
            el.style.backgroundColor = '';
            el.style.border = '';
            el.style.padding = '';
            el.style.display = ''; // Reset display for hidden items
          });
          // Clear styles from inline markers as well
          document.querySelectorAll('[data-mdpi-filter-inline-styled]').forEach(el => {
            el.style.color = '';
            el.style.fontWeight = '';
            el.removeAttribute('data-mdpi-filter-inline-styled');
            if (el.tagName.toLowerCase() === 'sup') {
              const anchorElement = el.querySelector('a');
              if (anchorElement) {
                anchorElement.style.color = '';
                anchorElement.style.fontWeight = '';
                Array.from(anchorElement.childNodes).forEach(child => {
                  if (child.nodeType === Node.ELEMENT_NODE) {
                    child.style.color = '';
                    child.style.fontWeight = '';
                  }
                });
                const bracketSpans = anchorElement.querySelectorAll('span.cite-bracket');
                bracketSpans.forEach(span => {
                  span.style.color = '';
                });
              }
            }
          });
        }

        function styleRef(item, refId) {
          // Ensure item is a valid DOM element
          if (!item || typeof item.setAttribute !== 'function') {
            console.warn('[MDPI Filter CS] styleRef: Invalid item provided.', item);
            return;
          }
        
          // Set the data attribute for scrolling. This ID should match what's in collectedMdpiReferences.
          item.setAttribute('data-mdpi-filter-ref-id', refId);
        
          if (mode === 'hide') {
            item.classList.add('mdpi-hidden-reference');
            item.style.display = 'none';
          } else { // Default to 'highlight'
            item.classList.add('mdpi-highlighted-reference');
            item.style.backgroundColor = 'rgba(255, 224, 224, 0.7)'; // Light red background
            item.style.border = `1px solid ${mdpiColor}`;
            item.style.padding = '2px';
          }
        }

        function isMdpiItemByContent(item, runCache) {
          if (!item) return false;
          // Use the globally available checker
          return window.MDPIFilterItemContentChecker.checkItemContent(item, runCache, MDPI_DOI, MDPI_DOMAIN);
        }
        
        function updateBadgeAndReferences() {
          const badgeCount = collectedMdpiReferences.length;
          const text = badgeCount > 0 ? String(badgeCount) : '';
        
          // Ensure chrome.runtime and chrome.runtime.id are valid before sending a message
          if (chrome.runtime && chrome.runtime.id) {
            chrome.runtime.sendMessage({
              action: 'mdpiUpdate', // Ensure this matches what background.js expects
              data: {
                badgeCount: badgeCount,
                references: collectedMdpiReferences
              }
            }).catch(error => {
              // Catch errors if the receiving end doesn't exist (e.g., context invalidated)
              if (error.message.includes("Receiving end does not exist")) {
                // console.warn("[MDPI Filter CS] updateBadgeAndReferences: Could not send message to background, context likely invalidated.");
              } else {
                // console.error("[MDPI Filter CS] updateBadgeAndReferences: Error sending message:", error);
              }
            });
          } else {
            // console.warn("[MDPI Filter CS] updateBadgeAndReferences: Extension context invalidated, cannot send message.");
          }
        
          // console.log(`[MDPI Filter CS] updateBadgeAndReferences: Badge text set to '${text}', sent ${collectedMdpiReferences.length} references to popup.`);
          if (collectedMdpiReferences.length === 0) {
            // console.log("[MDPI Filter CS] updateBadgeAndReferences: No references to send to popup.");
          }
        }


        const extractReferenceData = (item) => {
          // Ensure refIdCounter is correctly accessed and updated if it's meant to be global to this scope
          const { extractedId, updatedRefIdCounter } = window.MDPIFilterReferenceIdExtractor.extractInternalScrollId(item, refIdCounter);
          refIdCounter = updatedRefIdCounter; // Update the counter in the outer scope

          const textContent = item.textContent || '';
          const primaryLink = window.MDPIFilterLinkExtractor.extractPrimaryLink(item, window.MDPIFilterLinkExtractionSelectors);

          return {
            id: extractedId, // This is the crucial ID for scrolling, generated by extractInternalScrollId
            text: sanitize(textContent.substring(0, 250) + (textContent.length > 250 ? '...' : '')),
            fullText: textContent, // Keep full text if needed for other purposes
            link: primaryLink,
            // Add any other data you want to show in the popup
          };
        };

        async function processAllReferences(runCache) { // runCache is a Map, typically new for each full run
          console.log("[MDPI Filter CS] >>> processAllReferences function entered."); // New log

          if (isProcessing) {
            // console.log("[MDPI Filter] processAllReferences skipped, already processing.");
            return;
          }
          isProcessing = true;
          console.log("[MDPI Filter CS] processAllReferences STARTING. Initial runCache size:", runCache.size);

          clearPreviousHighlights();
          uniqueMdpiReferences.clear();
          collectedMdpiReferences = [];
          // refIdCounter = 0; // Reset counter for each full processing run - This is already done in runAll or initializeOrReRun

          let referenceItems = [];
          try {
            if (typeof referenceListSelectors === 'undefined' || referenceListSelectors === null || referenceListSelectors.trim() === '') {
              console.error("[MDPI Filter CS] processAllReferences: referenceListSelectors is undefined or empty before querySelectorAll. Value:", referenceListSelectors);
              isProcessing = false;
              return;
            }
            // console.log("[MDPI Filter CS] Attempting to querySelectorAll with selectors:", referenceListSelectors.substring(0, 200) + "..."); // Log selectors
            referenceItems = Array.from(document.querySelectorAll(referenceListSelectors));
          } catch (e) {
            console.error("[MDPI Filter CS] Error during document.querySelectorAll with referenceListSelectors:", e);
            console.error("[MDPI Filter CS] Selectors used:", referenceListSelectors);
            isProcessing = false; // Reset processing flag
            return; // Stop further processing in this function if selectors fail
          }

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

          // Process inline footnotes
          if (window.MDPIFilterUtils && window.MDPIFilterUtils.styleInlineFootnotes) {
            // The first argument to styleInlineFootnotes should be the collectedMdpiReferences array
            // The second argument is the color
            window.MDPIFilterUtils.styleInlineFootnotes(collectedMdpiReferences, mdpiColor);
          }
          updateBadgeAndReferences();
        }

        const debouncedRunAll = window.debounce(() => {
          runAll();
        }, 250);

        async function runAll() {
          console.log("[MDPI Filter CS] >>> runAll function entered."); // New log
          if (!chrome.runtime?.id) {
            console.warn('[MDPI Filter] runAll: Extension context invalidated. Aborting.');
            return;
          }

          if (typeof referenceListSelectors === 'undefined' || referenceListSelectors === null || referenceListSelectors.trim() === '') {
            console.error("[MDPI Filter CS] runAll: CRITICAL - referenceListSelectors is not defined or is empty. Aborting runAll.");
            updateBadgeAndReferences(); // Update badge to reflect no findings
            return;
          }
          refIdCounter = 0; // Reset global refIdCounter for each full runAll execution

          const runCache = new Map();
          await processAllReferences(runCache);
          updateBadgeAndReferences();
        }

        function initializeOrReRun() {
          console.log("[MDPI Filter CS] >>> initializeOrReRun function entered."); // New log
          if (!chrome.runtime?.id) {
            console.warn('[MDPI Filter CS] initializeOrReRun: Extension context invalidated. Aborting.');
            return;
          }
          // console.log("[MDPI Filter CS] initializeOrReRun called.");

          if (typeof referenceListSelectors === 'undefined' || referenceListSelectors === null || referenceListSelectors.trim() === '') {
            console.error("[MDPI Filter CS] initializeOrReRun: Skipping runAll because referenceListSelectors are missing/empty.");
            updateBadgeAndReferences(); // Ensure badge is cleared if we can't run
            return;
          }

          runAll(); // Initial processing
          if (mainObserverInstance) {
            mainObserverInstance.disconnect(); // Disconnect previous if any
          }
          mainObserverInstance = new MutationObserver((mutationsList, observer) => {
            if (!(chrome.runtime && chrome.runtime.id)) {
              console.warn('[MDPI Filter] Main observer: Extension context invalidated. Skipping debouncedRunAll.');
              return;
            }
            debouncedRunAll();
          });

          mainObserverInstance.observe(document.documentElement, {
            childList: true,
            subtree: true
          });
        }

        // Initial run and observer setup
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            if (!chrome.runtime?.id) {
              console.warn('[MDPI Filter CS] DOMContentLoaded: Extension context invalidated. Skipping initial run and observer setup.');
              return;
            }
            if (typeof referenceListSelectors !== 'undefined' && referenceListSelectors !== null && referenceListSelectors.trim() !== '') {
              initializeOrReRun();
            } else {
              console.error("[MDPI Filter CS] DOMContentLoaded: Skipping initial run because referenceListSelectors are missing/empty.");
              updateBadgeAndReferences();
            }
          });
        } else {
          if (!chrome.runtime?.id) {
            console.warn('[MDPI Filter CS] Document ready: Extension context invalidated. Skipping initial run and observer setup.');
          } else {
            if (typeof referenceListSelectors !== 'undefined' && referenceListSelectors !== null && referenceListSelectors.trim() !== '') {
              initializeOrReRun();
            } else {
              console.error("[MDPI Filter CS] Document ready: Skipping initial run because referenceListSelectors are missing/empty.");
              updateBadgeAndReferences();
            }
          }
        }
      });
    } else {
      console.warn("[MDPI Filter CS] Extension context invalidated before storage access. Main script logic will not execute for this frame.");
    }
  } // End of else (dependenciesMet)
} // End of if (!window.mdpiFilterInjected)

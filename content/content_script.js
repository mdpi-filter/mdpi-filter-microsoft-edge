// content/content_script.js
;(function mdpiMain() {
  // --- Logging Override ---
  let loggingEnabled = false;
  chrome.storage.sync.get('loggingEnabled', res => {
    if (typeof res.loggingEnabled === 'boolean') loggingEnabled = res.loggingEnabled;
  });
  chrome.storage.onChanged.addListener(changes => {
    if (changes.loggingEnabled) loggingEnabled = changes.loggingEnabled.newValue;
  });
  const nativeConsoleLog = console.log.bind(console);
  const nativeConsoleWarn = console.warn.bind(console);
  console.log = (...args) => { if (loggingEnabled) nativeConsoleLog(...args); };
  console.warn = (...args) => { if (loggingEnabled) nativeConsoleWarn(...args); };

  if (!window.mdpiFilterInjected) {
    console.log("[MDPI Filter CS] Attempting to inject content script...");

    // --- Comprehensive Dependency Checks ---
    let dependenciesMet = true;
    const missingDependencies = [];

    if (typeof window.MDPIFilterDomains === 'undefined') {
      missingDependencies.push("MDPIFilterDomains (from domains.js)");
      dependenciesMet = false;
    }
    if (!window.MDPIFilterDomainUtils || typeof window.MDPIFilterDomainUtils.getActiveSearchConfig !== 'function') {
      missingDependencies.push("MDPIFilterDomainUtils.getActiveSearchConfig (from domains.js)");
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
    if (typeof window.MDPIFilterCitedBy === 'undefined' || !window.MDPIFilterCitedBy.Styler || typeof window.MDPIFilterCitedBy.Styler.styleItem !== 'function') {
      missingDependencies.push("MDPIFilterCitedBy.Styler.styleItem (from cited_by_styler.js)");
      dependenciesMet = false;
    }
    if (typeof window.MDPIFilterCitedBy === 'undefined' || !window.MDPIFilterCitedBy.Processor || typeof window.MDPIFilterCitedBy.Processor.processEntries !== 'function') {
      missingDependencies.push("MDPIFilterCitedBy.Processor.processEntries (from cited_by_processor.js)");
      dependenciesMet = false;
    }

    // Add checks for new Similar Articles modules
    if (!window.MDPIFilterSimilarArticles || !window.MDPIFilterSimilarArticles.Selectors || typeof window.MDPIFilterSimilarArticles.Selectors.ITEM_SELECTORS === 'undefined') {
      missingDependencies.push("MDPIFilterSimilarArticles.Selectors.ITEM_SELECTORS (from similar_articles_selectors.js)");
      dependenciesMet = false;
    }
    if (!window.MDPIFilterSimilarArticles || !window.MDPIFilterSimilarArticles.Styler || typeof window.MDPIFilterSimilarArticles.Styler.styleItem !== 'function') {
      missingDependencies.push("MDPIFilterSimilarArticles.Styler.styleItem (from similar_articles_styler.js)");
      dependenciesMet = false;
    }
    if (!window.MDPIFilterSimilarArticles || !window.MDPIFilterSimilarArticles.Processor || typeof window.MDPIFilterSimilarArticles.Processor.processEntries !== 'function') {
      missingDependencies.push("MDPIFilterSimilarArticles.Processor.processEntries (from similar_articles_processor.js)");
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
      missingDependencies.push("MDPIFilterItemContentChecker.checkItemContent (from item_content_checker.js)");
      dependenciesMet = false;
    }
    // Add dependency check for GoogleContentChecker
    if (typeof window.GoogleContentChecker === 'undefined') {
      missingDependencies.push("GoogleContentChecker (from google_content_checker.js)");
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
      console.log("[MDPI Filter CS] All dependencies met. Content script executing (mdpiFilterInjected set).");

      // --- Constants, Selectors, State ---
      const MDPI_DOMAIN_CONST = 'mdpi.com'; // Renamed to avoid conflict if settings also has mdpiDomain
      const MDPI_DOI_CONST = '10.3390';   // Renamed
      // Escape user-controlled DOI prefix before building regex
      function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      const MDPI_DOI_REGEX = new RegExp(escapeRegex(MDPI_DOI_CONST) + "\\/[^\\s\"'<>&]+", "i");
      // Helper to safely check hostname matches a domain or its subdomain
      function isHostnameAllowed(domain) {
        const h = window.location.hostname.toLowerCase();
        return h === domain || h.endsWith('.' + domain);
      }
      const domains = window.MDPIFilterDomains || {};
      const sanitize = window.sanitize || (html => html);
      const referenceListSelectors = window.MDPIFilterReferenceSelectors;
      if (typeof referenceListSelectors === 'undefined' || referenceListSelectors === null || referenceListSelectors.trim() === '') {
        console.error("[MDPI Filter CS] CRITICAL: referenceListSelectors is undefined or empty. Value:", referenceListSelectors, "Window object value:", window.MDPIFilterReferenceSelectors);
      }

      // Ensure GoogleContentChecker class is available and instantiate it
      let googleCheckerInstance;
      if (typeof window.GoogleContentChecker === 'function') {
        googleCheckerInstance = new window.GoogleContentChecker();
      } else {
        console.error("[MDPI Filter CS] GoogleContentChecker class not found! checkGoogleItem and ID extractors will not work correctly.");
        // Provide a dummy instance with no-op methods to prevent further errors if critical for structure
        googleCheckerInstance = {
          extractPmidFromUrl: () => null,
          extractPmcidFromUrl: () => null,
          extractDoisFromText: () => [],
          extractPmidsFromText: () => [],
          extractPmcidsFromText: () => [],
          checkGoogleItem: async () => ({ isMdpi: false, isPotential: false, source: 'dummy_checker_unavailable', details: null })
        };
      }

      // let collectedMdpiReferences = []; // This global one will be updated by updatePopupData
      let refIdCounter = 0;
      let globalCollectedMdpiReferences = []; // To store data for MDPI references for footnote styling

      let mainObserverInstance = null;

      // Store settings globally within the script
      let currentRunSettings = {
          mode: 'highlight', // Default
          mdpiDomain: MDPI_DOMAIN_CONST,
          mdpiDoiPrefix: MDPI_DOI_CONST,
          highlightPotentialMdpiSites: true // ADD THIS - Enable potential highlighting by default
      };
      // ---

      // ADD THESE FUNCTION DEFINITIONS:
      function styleSearchItem(item, isMdpi, isPotential, settings, activeConfig, source) {
        if (!item) return;
        let highlightTarget = item;
        const mdpiColorToUse = '#E2211C'; // Default MDPI Red
      
        if (activeConfig && activeConfig.highlightTargetSelector) {
          const foundTarget = item.querySelector(activeConfig.highlightTargetSelector);
          if (foundTarget) {
            highlightTarget = foundTarget;
          }
        }
      
        // Clear previous styling classes
        highlightTarget.classList.remove('mdpi-highlighted-reference', 'mdpi-potential-reference', 'mdpi-hidden-reference', 'mdpi-highlighted-google', 'mdpi-potential-google');
        // Clear previous inline styles
        highlightTarget.style.border = '';
        highlightTarget.style.borderLeft = '';
        highlightTarget.style.paddingLeft = '';
        highlightTarget.style.backgroundColor = '';
        highlightTarget.style.display = '';
        highlightTarget.style.outline = '';
        item.style.display = ''; // Ensure main item is visible if it was hidden
      
        if (settings.mode === 'hide' && isMdpi) {
          item.classList.add('mdpi-hidden-reference'); // Hide the main item
          item.style.display = 'none';
          // console.log(`[MDPI Filter CS] Hiding search item (source: ${source}):`, item.textContent.substring(0, 70));
        } else {
          if (isMdpi) {
            highlightTarget.classList.add('mdpi-highlighted-reference');
            if (activeConfig && activeConfig.isGoogleWeb) {
              highlightTarget.classList.add('mdpi-highlighted-google');
              // Google Web specific styling (e.g., subtle background or border on the target)
              highlightTarget.style.border = `1px solid ${mdpiColorToUse}`;
              highlightTarget.style.backgroundColor = 'rgba(226, 33, 28, 0.05)'; // Light red tint
            } else {
              // Standard search result styling (e.g., left border)
              highlightTarget.style.borderLeft = `3px solid ${mdpiColorToUse}`;
              highlightTarget.style.paddingLeft = '5px';
              highlightTarget.style.backgroundColor = 'rgba(226, 33, 28, 0.05)';
            }
            // console.log(`[MDPI Filter CS] Styling search item as MDPI (source: ${source}):`, item.textContent.substring(0, 70));
          } else if (isPotential && settings.highlightPotentialMdpiSites) {
            highlightTarget.classList.add('mdpi-potential-reference');
            if (activeConfig && activeConfig.isGoogleWeb) {
              highlightTarget.classList.add('mdpi-potential-google');
              highlightTarget.style.border = '1px dashed orange';
              highlightTarget.style.backgroundColor = 'rgba(255, 165, 0, 0.05)'; // Light orange tint
            } else {
              highlightTarget.style.borderLeft = '3px dashed orange';
              highlightTarget.style.paddingLeft = '5px';
              highlightTarget.style.backgroundColor = 'rgba(255, 165, 0, 0.05)';
            }
            // console.log(`[MDPI Filter CS] Styling search item as POTENTIAL (source: ${source}):`, item.textContent.substring(0, 70));
          }
        }
      }

      function unstyleSearchItem(item, activeConfig) {
        if (!item) return;
        let targetToUnstyle = item;
        if (activeConfig && activeConfig.highlightTargetSelector) {
          const foundTarget = item.querySelector(activeConfig.highlightTargetSelector);
          if (foundTarget) {
            targetToUnstyle = foundTarget;
          }
        }

        targetToUnstyle.classList.remove('mdpi-highlighted-reference', 'mdpi-potential-reference', 'mdpi-hidden-reference', 'mdpi-highlighted-google', 'mdpi-potential-google');
        targetToUnstyle.style.border = '';
        targetToUnstyle.style.borderLeft = '';
        targetToUnstyle.style.paddingLeft = '';
        targetToUnstyle.style.backgroundColor = '';
        targetToUnstyle.style.outline = '';
        item.style.display = ''; // Ensure main item is visible
        // console.log(`[MDPI Filter CS] Unstyled search item:`, item.textContent.substring(0, 70));
      }

      // MODIFIED extractReferenceData to accept the pre-assigned extractedId
      const extractReferenceData = (item, assignedExtractedId) => {
        // item.dataset.mdpiFilterRefId should be == assignedExtractedId if set by extractInternalScrollId
        const textContent = item.textContent || '';
        const primaryLink = window.MDPIFilterLinkExtractor.extractPrimaryLink(item, window.MDPIFilterLinkExtractionSelectors);

        // Determine the ID to be used for linking inline footnotes.
        // Prefer item.id, then data-bib-id, then fallback to assignedExtractedId.
        const actualListItemDomId = item.id || item.getAttribute('data-bib-id') || assignedExtractedId;
        return {
          id: assignedExtractedId, // This is the mdpi-ref-X
          text: sanitize(textContent.substring(0, 250) + (textContent.length > 250 ? '...' : '')),
          fullText: textContent,
          primaryLink: primaryLink,
          listItemDomId: actualListItemDomId
        };
      };

      // Function to process all references, collect MDPI ones, and style footnotes
      function refreshMdpiProcessingAndStyling() {
        // console.log("[MDPI Filter CS] Starting refreshMdpiProcessingAndStyling.");
        globalCollectedMdpiReferences = []; // Reset for this processing run

        if (!referenceListSelectors) {
          console.error("[MDPI Filter CS] referenceListSelectors is not defined. Cannot process references.");
          return;
        }
        const referenceItems = document.querySelectorAll(referenceListSelectors);
        // console.log(`[MDPI Filter CS] Found ${referenceItems.length} potential reference items.`);

        referenceItems.forEach(item => {
          if (!window.MDPIFilterReferenceIdExtractor || !window.MDPIFilterReferenceIdExtractor.extractInternalScrollId) {
            console.error("[MDPI Filter CS] MDPIFilterReferenceIdExtractor.extractInternalScrollId is not available.");
            return;
          }
          const { extractedId, updatedRefIdCounter } = window.MDPIFilterReferenceIdExtractor.extractInternalScrollId(item, refIdCounter);
          refIdCounter = updatedRefIdCounter; // Update script-local counter

          if (!window.MDPIFilterItemContentChecker || !window.MDPIFilterItemContentChecker.checkItemContent) {
            console.error("[MDPI Filter CS] MDPIFilterItemContentChecker.checkItemContent is not available.");
            return;
          }
          if (!window.MDPIFilterCaches || !window.MDPIFilterCaches.citationProcessCache) {
              console.error("[MDPI Filter CS] MDPIFilterCaches.citationProcessCache is not available.");
              return;
          }

          const isMdpi = window.MDPIFilterItemContentChecker.checkItemContent(
            item,
            window.MDPIFilterCaches.citationProcessCache,
            currentRunSettings.mdpiDoiPrefix,
            currentRunSettings.mdpiDomain
          );

          if (isMdpi) {
            const refData = extractReferenceData(item, extractedId);
            globalCollectedMdpiReferences.push(refData);
            
            // TODO: Implement styling/hiding of the reference list item itself based on currentRunSettings.mode
            // Example:
            // if (currentRunSettings.mode === 'highlight') {
            //   item.style.borderLeft = '3px solid #E2211C'; // MDPI Red
            //   item.style.paddingLeft = '5px';
            // } else if (currentRunSettings.mode === 'hide') {
            //   item.style.display = 'none';
            // }
          } else {
            // TODO: Ensure non-MDPI items are reset (e.g., remove border, set display to default)
            // Example:
            // item.style.borderLeft = '';
            // item.style.paddingLeft = '';
            // item.style.display = '';
          }
        });

        // console.log(`[MDPI Filter CS] Collected ${globalCollectedMdpiReferences.length} MDPI references for footnote styling.`);

        if (window.MDPIFilterUtils && window.MDPIFilterUtils.styleInlineFootnotes) {
          const mdpiColor = '#E2211C'; // MDPI Red, or pull from settings if configurable
          window.MDPIFilterUtils.styleInlineFootnotes(globalCollectedMdpiReferences, mdpiColor);
        } else {
          console.error("[MDPI Filter CS] MDPIFilterUtils.styleInlineFootnotes is not available.");
        }

        // TODO: Call a function to update the browser action badge with the count
        // e.g., updateBadgeCount(globalCollectedMdpiReferences.length);
      }

      // --- NEW: MutationObserver for dynamic reference and footnote updates ---
      function setupReferenceAndFootnoteObserver() {
        // Debounce to avoid excessive processing
        const debouncedRefresh = window.debounce
          ? window.debounce(refreshMdpiProcessingAndStyling, 300)
          : refreshMdpiProcessingAndStyling;

        // Observe the entire document body for subtree changes
        const observer = new MutationObserver((mutationsList, observer) => {
          // Check if any added/removed nodes might affect references or footnotes
          let relevantChange = false;
          for (const mutation of mutationsList) {
            if (
              mutation.type === 'childList' &&
              (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
            ) {
              relevantChange = true;
              break;
            }
          }
          if (relevantChange) {
            debouncedRefresh();
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });

        // Optionally, run a few delayed retries after initial load to catch late footnotes
        [500, 1200, 2500].forEach(delay => {
          setTimeout(refreshMdpiProcessingAndStyling, delay);
        });

        // Store the observer instance for potential cleanup
        window._mdpiFilterRefFootnoteObserver = observer;
      }

      if (chrome.runtime && chrome.runtime.id) {
        chrome.storage.sync.get({ 
          mode: 'highlight',
          highlightPotentialMdpiSites: true
        }, (retrievedStorageSettings) => {
          if (chrome.runtime.lastError) {
            console.error(`[MDPI Filter CS] Error accessing storage: ${chrome.runtime.lastError.message}. Using default settings.`);
            // currentRunSettings already has defaults
          } else if (retrievedStorageSettings) {
            currentRunSettings.mode = retrievedStorageSettings.mode;
            currentRunSettings.highlightPotentialMdpiSites = retrievedStorageSettings.highlightPotentialMdpiSites; // ADD THIS
          }
          console.log("[MDPI Filter CS] Settings loaded/defaulted:", currentRunSettings); // Enhanced log
          
          // Perform initial processing and styling
          refreshMdpiProcessingAndStyling();
          setupReferenceAndFootnoteObserver(); // <-- ADD THIS

          // TODO: If using a MutationObserver for dynamic content, ensure it's initialized
          // and its callback also triggers refreshMdpiProcessingAndStyling (possibly debounced).
          // Example:
          // const debouncedRefresh = window.debounce(refreshMdpiProcessingAndStyling, 300);
          // mainObserverInstance = new MutationObserver((mutationsList, observer) => {
          //   // Add logic to check if mutations are relevant before refreshing
          //   debouncedRefresh();
          // });
          // mainObserverInstance.observe(document.body, { childList: true, subtree: true });

        });
      } else {
        // Fallback for environments where chrome.runtime is not available (e.g. testing)
        console.warn("[MDPI Filter CS] chrome.runtime.id not available. Running with default settings and processing.");
        refreshMdpiProcessingAndStyling();
        setupReferenceAndFootnoteObserver(); // <-- ADD THIS
      }

      if (chrome.runtime && chrome.runtime.id) {
        chrome.storage.sync.get({ mode: 'highlight' }, (retrievedStorageSettings) => {
          if (chrome.runtime.lastError) {
            console.error(`[MDPI Filter CS] Error accessing storage: ${chrome.runtime.lastError.message}. Using default settings.`);
            // currentRunSettings already has defaults
          } else if (retrievedStorageSettings) {
            currentRunSettings.mode = retrievedStorageSettings.mode;
          }

          if (!(chrome.runtime && chrome.runtime.id)) {
            console.warn("[MDPI Filter CS] Extension context became invalidated after storage.sync.get. Halting script initialization for this frame.");
            return;
          }

          console.log('%c MDPI FILTER EXTENSION SCRIPT LOADED! ', 'background: yellow; color: black; font-size: 16px; font-weight: bold;');
          console.log("[MDPI Filter] Initial settings:", currentRunSettings);

          const { ncbiApiCache, citationProcessCache } = window.MDPIFilterCaches;
          const mdpiColor = '#E2211C';
          let isProcessing = false;

          // This function will be responsible for updating the global collectedMdpiReferences
          // and then calling sendUpdateToBackground.
          function updatePopupData(newCollectedReferences, count) {
            console.log(`[MDPI Filter CS] updatePopupData: raw count = ${newCollectedReferences.length}`);

            // --- DEDUPE BY ref.id ---
            const seen = new Set();
            const uniqueRefs = [];
            for (const r of newCollectedReferences) {
              if (!seen.has(r.id)) {
                seen.add(r.id);
                uniqueRefs.push(r);
              }
            }
            const dedupedCount = uniqueRefs.length;
            console.log(`[MDPI Filter CS] updatePopupData: de-duped  count = ${dedupedCount}`);

            // now send only the unique list
            chrome.runtime.sendMessage(
              { type: 'mdpiUpdate', data: { count: dedupedCount, references: uniqueRefs } },
              response => {
                // optional: handle response
                // console.log('[MDPI Filter CS] updatePopupData response:', response);
              }
            );
          }

          // --- Helper Function Definitions ---

          // New function to send updates to the background script
          function sendUpdateToBackground() {
            console.log(`[MDPI Filter CS] Attempting to send 'mdpiUpdate' to background. Number of references: ${collectedMdpiReferences.length}`);

            if (!chrome.runtime || !chrome.runtime.id) {
              console.error('[MDPI Filter CS] CRITICAL: chrome.runtime.id is not available. Cannot send message to background. Content script might be in an invalid context or the extension was reloaded/updated.');
              return;
            }

            const dataToSend = {
              badgeCount: collectedMdpiReferences.length,
              references: collectedMdpiReferences.map(ref => ({
                id: ref.id,
                text: ref.text,
                number: ref.number,
                listItemDomId: ref.listItemDomId
              }))
            };

            try {
              console.log('[MDPI Filter CS] Data prepared for background:', JSON.parse(JSON.stringify(dataToSend)));
            } catch (e) {
              console.warn('[MDPI Filter CS] Could not stringify dataToSend for logging:', e, dataToSend);
            }

            chrome.runtime.sendMessage({
              type: 'mdpiUpdate',
              data: dataToSend
            }, response => {
              if (chrome.runtime.lastError) {
                console.error('[MDPI Filter CS] Error sending mdpiUpdate to background:', chrome.runtime.lastError.message);
              } else {
                console.log('[MDPI Filter CS] mdpiUpdate successfully sent to background. Response from background:', response);
              }
            });
          }

          // The isSearchEnginePage function is now replaced by MDPIFilterDomainUtils.getActiveSearchConfig

          function clearPreviousHighlights() {
            document.querySelectorAll('.mdpi-highlighted-reference, .mdpi-hidden-reference, .mdpi-search-result-highlight, .mdpi-search-result-hidden').forEach(el => {
              el.classList.remove('mdpi-highlighted-reference', 'mdpi-hidden-reference', 'mdpi-search-result-highlight', 'mdpi-search-result-hidden');
              el.style.backgroundColor = '';
              el.style.border = '';
              el.style.padding = '';
              el.style.display = '';
              el.style.outline = ''; 
            });
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

          // Update styleRef to accept config and use highlightTargetSelector if present
          function styleRef(item, refId, config) {
            if (!item || typeof item.setAttribute !== 'function') {
              return;
            }
            let highlightTarget = item;
            if (config && config.highlightTargetSelector) {
              const targetElement = item.querySelector(config.highlightTargetSelector);
              if (targetElement) {
                highlightTarget = targetElement;
              }
            }
            highlightTarget.setAttribute('data-mdpi-filter-ref-id', refId);

            if (currentRunSettings.mode === 'hide') { // Use currentRunSettings.mode
              item.classList.add('mdpi-hidden-reference');
              item.style.display = 'none';
            } else {
              item.classList.add('mdpi-highlighted-reference');
              // Apply specific styling for Google search results
              if (config && (config.host === 'www.google.com' )) {
                highlightTarget.classList.add('mdpi-search-result-highlight');
                highlightTarget.style.backgroundColor = 'rgba(255, 182, 193, 0.3)';
                highlightTarget.style.border = `1px solid ${mdpiColor}`;
                highlightTarget.style.borderRadius = '3px';
                highlightTarget.style.padding = '1px 3px';
                highlightTarget.style.boxShadow = '';
              } else {
                highlightTarget.style.borderLeft = `3px solid ${mdpiColor}`;
                highlightTarget.style.paddingLeft = '5px';
                highlightTarget.style.backgroundColor = 'rgba(226, 33, 28, 0.05)';
              }
            }
          }

          const isMdpiItemByContent = (item, runCache, idExtractor) => { // Added idExtractor
            if (!item) return false;
            // Use currentRunSettings for mdpiDoiPrefix and mdpiDomain
            return window.MDPIFilterItemContentChecker.checkItemContent(
              item,
              runCache,
              currentRunSettings.mdpiDoiPrefix,
              currentRunSettings.mdpiDomain,
              null, // primaryLinkDoi (typically not pre-extracted for this generic call)
              null, // primaryLinkUrl
              idExtractor // Pass it through
            );
          };

          function updateBadgeAndReferences() {
            const badgeCount = collectedMdpiReferences.length;
            const text = badgeCount > 0 ? String(badgeCount) : '';
          
            if (chrome.runtime && chrome.runtime.id) {
              chrome.runtime.sendMessage({ action: 'updateBadge', text: text, count: badgeCount, color: mdpiColor }).catch(e => {
                if (!e.message.includes("Receiving end does not exist")) {
                  // console.warn("[MDPI Filter CS] Error sending updateBadge message:", e.message);
                }
              });
              // Send message to popup if it's open
              chrome.runtime.sendMessage({ action: 'updateReferences', references: collectedMdpiReferences }).catch(e => {
                if (!e.message.includes("Receiving end does not exist") && !e.message.includes("The message port closed before a response was received.")) {
                  // console.warn("[MDPI Filter CS] Error sending updateReferences message to popup:", e.message);
                }
              });
            } else {
              // console.warn("[MDPI Filter CS] updateBadgeAndReferences: Extension context invalidated. Cannot send message.");
            }
            // Call the function to style inline footnotes and other UI updates
            if (typeof window.MDPIFilterUtils !== 'undefined' && typeof window.MDPIFilterUtils.styleInlineFootnotes === 'function') {
              window.MDPIFilterUtils.styleInlineFootnotes(collectedMdpiReferences, mdpiColor);
            }
            // If there are no MDPI references on a non-search page, ensure the "no references found" message is potentially shown.
            if (collectedMdpiReferences.length === 0 && !window.MDPIFilterDomainUtils.getActiveSearchConfig(window.location.hostname, window.location.pathname, domains)) {
              // console.log("[MDPI Filter CS] No MDPI references found on a non-search page. Popup might show 'No MDPI references found'.");
            }
          }

          const extractReferenceData = (item) => {
            // Use MDPIFilterReferenceIdExtractor to get/generate an internal ID (e.g., "mdpi-ref-X")
            // This also sets 'data-mdpi-filter-ref-id' on the item.
            const { extractedId, updatedRefIdCounter } = window.MDPIFilterReferenceIdExtractor.extractInternalScrollId(item, refIdCounter);
            refIdCounter = updatedRefIdCounter;
            const textContent = item.textContent || '';
            const primaryLink = window.MDPIFilterLinkExtractor.extractPrimaryLink(item, window.MDPIFilterLinkExtractionSelectors);

            // Determine the ID to be used for linking inline footnotes.
            // Prefer item.id, then data-bib-id, then fallback to extractedId.
            const actualListItemDomId = item.id || item.getAttribute('data-bib-id') || extractedId;
            return {
              id: extractedId,
              text: sanitize(textContent.substring(0, 250) + (textContent.length > 250 ? '...' : '')),
              fullText: textContent,
              primaryLink: primaryLink,
              listItemDomId: actualListItemDomId
            };
          };

          // --- Main Processing Functions ---

          async function processSearchEngineResults(config) {
            isProcessing = true;
            // console.log("[MDPI Filter CS] Processing search engine results with config:", config);
            if (!config) {
              // console.log("[MDPI Filter CS] No search config provided to processSearchEngineResults. Aborting.");
              isProcessing = false;
              return;
            }
          
            const items = document.querySelectorAll(config.itemSelector || config.container);
            console.log(`[MDPI Filter CS] Found ${items.length} items for search processing using selector: ${config.itemSelector || config.container}`);
          
            let mdpiResultsCount = 0; 
            const runCache = new Map(); 
          
            for (const item of items) { 
              let isMdpiResult = false;
              const itemPreviewText = (item.textContent || "").substring(0, 70).trim().replace(/\s+/g, ' ');
              // console.log(`[MDPI Filter CS Search] Processing item: "${itemPreviewText}..."`);
          
              // 1. Direct MDPI link check (using config.linkSelector for MDPI domains/DOIs)
              if (config.linkSelector) {
                const mdpiLinkElement = item.querySelector(config.linkSelector);
                if (mdpiLinkElement && mdpiLinkElement.href) {
                  // For current googleWeb, config.linkSelector is 'a[href*="mdpi.com"]'.
                  // This check ensures the link actually matches MDPI_DOMAIN or MDPI_DOI_REGEX.
                  if (mdpiLinkElement.href.includes(currentRunSettings.mdpiDomain) || MDPI_DOI_REGEX.test(mdpiLinkElement.href)) {
                    isMdpiResult = true;
                    // console.log(`[MDPI Filter CS Search] Item "${itemPreviewText}..." is MDPI (direct MDPI link via config.linkSelector).`);
                  }
                }
              }
          
              // 2. NCBI API Check (if useNcbiApi is true and not already identified as MDPI)
              if (!isMdpiResult && config.useNcbiApi) {
                // Try to find the primary link of the search result item.
                // Common Google search result link structure:
                let mainLinkElement = item.querySelector('div.yuRUbf > a[href]');
                if (!mainLinkElement) {
                  // Fallback for other structures or if yuRUbf is not present (e.g., image items might not have it)
                  // or for other search engines where yuRUbf doesn't apply.
                  mainLinkElement = item.querySelector('a[href]');
                }

                if (mainLinkElement && mainLinkElement.href) {
                  const mainLinkHref = mainLinkElement.href;
                  let idToCheck = null;
                  let idType = null;
          
                  // Extract PMID from pubmed.ncbi.nlm.nih.gov links
                  const pmidMatch = mainLinkHref.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
                  if (pmidMatch && pmidMatch[1]) {
                    idToCheck = pmidMatch[1];
                    idType = 'pmid';
                  }
          
                  // Extract PMCID from ncbi.nlm.nih.gov/pmc/articles/ links
                  if (!idToCheck) {
                    const pmcidMatch = mainLinkHref.match(/ncbi\.nlm\.nih\.gov\/pmc\/articles\/(PMC\d+)/i);
                    if (pmcidMatch && pmcidMatch[1]) {
                      idToCheck = pmcidMatch[1];
                      idType = 'pmcid';
                    }
                  }

                  // Extract PMCID from europepmc.org links (e.g., /articles/PMC..., /article/PMC/PMC...)
                  if (!idToCheck) {
                    const europePmcPmcidMatch = mainLinkHref.match(/europepmc\.org\/(?:articles|article\/PMC)\/(PMC\d+)/i);
                    if (europePmcPmcidMatch && europePmcPmcidMatch[1]) {
                      idToCheck = europePmcPmcidMatch[1];
                      idType = 'pmcid';
                      // console.log(`[MDPI Filter CS Search] Extracted EuropePMC PMCID: ${idToCheck} from ${mainLinkHref}`);
                    }
                  }

                  // Extract PMID from europepmc.org links (e.g., /articles/123..., /abstract/MED/123..., /article/med/123...)
                  // Ensure it's purely numeric to treat as potential PMID
                  if (!idToCheck) {
                    const europePmcPmidMatch = mainLinkHref.match(/europepmc\.org\/(?:articles|abstract\/MED|article\/med)\/(\d+)(?:\/?$|\?|#)/i);
                    if (europePmcPmidMatch && europePmcPmidMatch[1] && /^\d+$/.test(europePmcPmidMatch[1])) {
                      idToCheck = europePmcPmidMatch[1];
                      idType = 'pmid';
                      // console.log(`[MDPI Filter CS Search] Extracted EuropePMC PMID: ${idToCheck} from ${mainLinkHref}`);
                    }
                  }
          
                  // Extract DOI if the link is a DOI link (e.g. doi.org)
                  // Only check non-MDPI DOIs via API, as MDPI DOIs would be caught by direct checks.
                  if (!idToCheck && typeof window.MDPIFilterItemContentChecker?.extractDoiFromLinkInternal === 'function') {
                      const doiInLink = window.MDPIFilterItemContentChecker.extractDoiFromLinkInternal(mainLinkHref);
                      if (doiInLink && !doiInLink.startsWith(currentRunSettings.mdpiDoiPrefix)) { 
                          idToCheck = doiInLink;
                          idType = 'doi';
                      }
                  }
          
                  if (idToCheck && idType) {
                    // console.log(`[MDPI Filter CS Search] Item "${itemPreviewText}..." requires NCBI check for ${idType}: ${idToCheck} from link ${mainLinkHref}.`);
                    isMdpiResult = await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi([idToCheck], idType, runCache, ncbiApiCache);
                    if (isMdpiResult) {
                      // console.log(`[MDPI Filter CS Search] Item "${itemPreviewText}..." is MDPI (NCBI API).`);
                    } else {
                      // console.log(`[MDPI Filter CS Search] Item "${itemPreviewText}..." is NOT MDPI (NCBI API).`);
                    }
                  }
                }
              }
          
              // 3. Fallback checks (if not already identified as MDPI)
              // These checks apply to the item's general content.
              if (!isMdpiResult && config.doiPattern && item.textContent && item.textContent.includes(config.doiPattern)) {
                isMdpiResult = true;
                // console.log(`[MDPI Filter CS Search] Item "${itemPreviewText}..." is MDPI (DOI pattern in text).`);
              }
              if (!isMdpiResult && config.htmlContains && item.innerHTML && item.innerHTML.includes(config.htmlContains)) {
                isMdpiResult = true;
                // console.log(`[MDPI Filter CS Search] Item "${itemPreviewText}..." is MDPI (HTML contains).`);
              }
              // Check for MDPI DOI regex in the item's text content
              // MDPI_DOI_REGEX is fine here as it's based on the constant MDPI_DOI_CONST, and settingsToUse.mdpiDoiPrefix is also based on it.
              if (!isMdpiResult && MDPI_DOI_REGEX.test(item.textContent || '')) {
                isMdpiResult = true;
                // console.log(`[MDPI Filter CS Search] Item "${itemPreviewText}..." is MDPI (MDPI DOI regex in text).`);
              }
              // Final fallback: check if any link within the item (not just the primary one identified by config.linkSelector) points to MDPI.
              if (!isMdpiResult) {
                // Check for any link containing MDPI domain or the MDPI DOI prefix.
                const anyMdpiLinkInItem = item.querySelector(`a[href*="${currentRunSettings.mdpiDomain}"], a[href*="${currentRunSettings.mdpiDoiPrefix}"]`);
                if (anyMdpiLinkInItem) {
                  isMdpiResult = true;
                  // console.log(`[MDPI Filter CS Search] Item "${itemPreviewText}..." is MDPI (fallback general MDPI link in item).`);
                }
              }
          
              if (isMdpiResult) {
                // Pass config to styleRef. styleRef uses currentRunSettings internally, which is effectively settingsToUse here.
                styleRef(item, `mdpi-search-${mdpiResultsCount + 1}`, config);
                mdpiResultsCount++;
              } else {
                // Remove highlight if previously set
                let highlightTarget = item;
                if (config && config.highlightTargetSelector) {
                  const found = item.querySelector(config.highlightTargetSelector);
                  if (found) highlightTarget = found;
                }
                highlightTarget.classList.remove('mdpi-highlighted-reference', 'mdpi-search-result-highlight', 'mdpi-hidden-reference', 'mdpi-search-result-hidden');
                highlightTarget.style.backgroundColor = '';
                highlightTarget.style.border = '';
                highlightTarget.style.padding = '';
                highlightTarget.style.display = '';
                highlightTarget.style.outline = '';
              }
            }
            // console.log(`[MDPI Filter CS] Processed search results. Found and styled ${mdpiResultsCount} MDPI results.`);
          
            if (chrome.runtime && chrome.runtime.id) {
              chrome.runtime.sendMessage({
                type: 'mdpiUpdate', 
                data: {
                  badgeCount: mdpiResultsCount, 
                  references: [] 
                }
              }, response => { 
                if (chrome.runtime.lastError) {
                  // console.warn("[MDPI Filter CS] Error sending search result badge update:", chrome.runtime.lastError.message);
                } else {
                  // console.log("[MDPI Filter CS] Search result badge update sent. Response:", response);
                }
              });
            }
          }

          // Add missing applySearchResultStyling function
          function applySearchResultStyling(item, activeConfig, type) {
            let highlightTarget = item;
            if (activeConfig && activeConfig.highlightTargetSelector) {
              const targetElement = item.querySelector(activeConfig.highlightTargetSelector);
              if (targetElement) {
                highlightTarget = targetElement;
              }
            }

            // Remove any existing styling first
            highlightTarget.classList.remove('mdpi-highlighted-reference', 'mdpi-search-result-highlight', 'mdpi-hidden-reference', 'mdpi-search-result-hidden', 'potential-mdpi-site-highlight');
            highlightTarget.style.backgroundColor = '';
            highlightTarget.style.border = '';
            highlightTarget.style.padding = '';
            highlightTarget.style.display = '';
            highlightTarget.style.outline = '';
            highlightTarget.style.borderLeft = '';
            highlightTarget.style.paddingLeft = '';

            if (type === 'mdpi') {
              // Secure MDPI styling (red solid border)
              highlightTarget.classList.add('mdpi-highlighted-reference');
              if (activeConfig && (activeConfig.host === 'www.google.com' || activeConfig.isGoogleWeb)) {
                highlightTarget.style.borderLeft = `3px solid ${mdpiColor}`;
                highlightTarget.style.paddingLeft = '5px';
                highlightTarget.style.backgroundColor = 'rgba(226, 33, 28, 0.05)';
              } else {
                highlightTarget.style.borderLeft = `3px solid ${mdpiColor}`;
                highlightTarget.style.paddingLeft = '5px';
                highlightTarget.style.backgroundColor = 'rgba(226, 33, 28, 0.05)';
              }

              if (currentRunSettings.mode === 'hide') {
                highlightTarget.classList.add('mdpi-hidden-reference');
                highlightTarget.style.display = 'none';
              }
            } else if (type === 'potential') {
              // Potential MDPI styling (yellow dashed border)
              highlightTarget.classList.add('potential-mdpi-site-highlight');
              highlightTarget.style.border = '2px dashed #FFA500';
              highlightTarget.style.borderRadius = '3px';
              highlightTarget.style.padding = '2px';
              highlightTarget.style.backgroundColor = 'rgba(255, 255, 153, 0.2)';
            }
          }

          // MODIFIED processSearchResults to handle Google via GoogleContentChecker
          // AND to pass googleCheckerInstance to ItemContentChecker for other sites
          async function processSearchResults(runCache, settingsToUse) {
            const currentHostname = window.location.hostname;
            const currentPathname = window.location.pathname;
            const activeConfig = window.MDPIFilterDomainUtils.getActiveSearchConfig(currentHostname, currentPathname, domains);
            
            if (!activeConfig) {
              // console.log("[MDPI Filter CS] No active search config for this page (processSearchResults).");
              return 0; // Return count
            }

            const itemSelector = activeConfig.itemSelector;
            if (!itemSelector) {
              // console.log("[MDPI Filter CS] No itemSelector in activeConfig (processSearchResults).");
              return 0; // Return count
            }

            const items = document.querySelectorAll(itemSelector);
            // console.log(`[MDPI Filter CS] Found ${items.length} items for search processing using selector: ${itemSelector}`);
            if (items.length === 0) return 0;

            let mdpiResultsCount = 0;

            for (const item of items) {
              const itemShortText = (item.textContent || "").substring(0, 70).trim().replace(/\s+/g, " ");
              const logPrefix = `[MDPI Filter CS Item - "${itemShortText}"]:`;

              if (MDPIFilterCaches.citationProcessCache.has(item)) {
                  // console.log(`${logPrefix} Item already processed and in citationProcessCache.`);
                  const cachedStatus = MDPIFilterCaches.citationProcessCache.get(item);
                  if (cachedStatus.isMdpi || cachedStatus.isPotential) {
                      if (cachedStatus.isMdpi) mdpiResultsCount++;
                      // Re-apply styling based on cached status
                      styleSearchItem(item, cachedStatus.isMdpi, cachedStatus.isPotential, settingsToUse, activeConfig, cachedStatus.source || "Cache");
                  }
                  continue;
              }

              let isMdpi = false;
              let isPotentialMdpi = false;
              let sourceOfDetection = 'unknown';

              if (activeConfig.isGoogleWeb) {
                if (!googleCheckerInstance || typeof googleCheckerInstance.checkGoogleItem !== 'function') {
                  console.error(`${logPrefix} googleCheckerInstance.checkGoogleItem is not available for Google Web.`);
                  continue;
                }
                // console.log(`${logPrefix} Processing with GoogleContentChecker (isGoogleWeb).`);
                const googleCheckResult = await googleCheckerInstance.checkGoogleItem(
                  item, runCache, settingsToUse.mdpiDoiPrefix, settingsToUse.mdpiDomain,
                  activeConfig, settingsToUse, MDPIFilterCaches.ncbiApiCache
                );
                isMdpi = googleCheckResult.isMdpi;
                isPotentialMdpi = googleCheckResult.isPotential;
                sourceOfDetection = googleCheckResult.source;
                // console.log(`${logPrefix} GoogleContentChecker result: isMdpi=${isMdpi}, isPotential=${isPotentialMdpi}, source=${sourceOfDetection}`);
              } else {
                // Logic for Scholar, PubMed, EuropePMC, etc.
                // console.log(`${logPrefix} Processing as non-GoogleWeb. Config host: ${activeConfig.host || activeConfig.hostRegex || 'N/A'}`);
                let itemIsMdpiByDirectIdentification = false;

                const mdpiDomainLinks = item.querySelectorAll(`a[href*="${settingsToUse.mdpiDomain}"]`);
                if (mdpiDomainLinks.length > 0) {
                  itemIsMdpiByDirectIdentification = true;
                  sourceOfDetection = `Direct MDPI domain link (${mdpiDomainLinks[0].getAttribute('href')})`;
                  // console.log(`${logPrefix} MDPI by direct domain link: ${mdpiDomainLinks[0].getAttribute('href')}`);
                }

                if (!itemIsMdpiByDirectIdentification) {
                  const itemTextContentForDoi = item.textContent || "";
                  const mdpiDoiPatternRegex = new RegExp(escapeRegex(settingsToUse.mdpiDoiPrefix) + "\\/[^\\s\"'<>&]+", "ig");
                  const foundDirectMdpiDois = new Set();
                  (itemTextContentForDoi.match(mdpiDoiPatternRegex) || []).forEach(doi => foundDirectMdpiDois.add(doi));
                  item.querySelectorAll('a[href]').forEach(link => {
                    const href = link.getAttribute('href');
                    if (href) {
                      const doiFromLink = MDPIFilterItemContentChecker.extractDoiFromLinkInternal(href);
                      if (doiFromLink && doiFromLink.startsWith(settingsToUse.mdpiDoiPrefix)) {
                        foundDirectMdpiDois.add(doiFromLink);
                      }
                    }
                  });
                  if (foundDirectMdpiDois.size > 0) {
                    itemIsMdpiByDirectIdentification = true;
                    sourceOfDetection = `Direct MDPI DOI (${[...foundDirectMdpiDois].join(', ')})`;
                    // console.log(`${logPrefix} MDPI by direct MDPI DOI: ${[...foundDirectMdpiDois].join(', ')}`);
                  }
                }
                
                isMdpi = itemIsMdpiByDirectIdentification;
                let itemIsMdpiByApi = false;

                if (!isMdpi && activeConfig.useNcbiApi) {
                  // console.log(`${logPrefix} Not MDPI by direct ID. Using NCBI API.`);
                  const pmidsToQuery = new Set();
                  const pmcidsToQuery = new Set();
                  const doisToQueryApi = new Set();

                  item.querySelectorAll('a[href]').forEach(link => {
                    const href = link.getAttribute('href');
                    if (!href) return;
                    const pmid = googleCheckerInstance.extractPmidFromUrl(href);
                    if (pmid) pmidsToQuery.add(pmid);
                    const pmcid = googleCheckerInstance.extractPmcidFromUrl(href);
                    if (pmcid) pmcidsToQuery.add(pmcid);
                    const doi = MDPIFilterItemContentChecker.extractDoiFromLinkInternal(href);
                    if (doi && !doi.startsWith(settingsToUse.mdpiDoiPrefix)) doisToQueryApi.add(doi);
                  });
                  
                  const textContent = item.textContent || "";
                  (googleCheckerInstance.extractPmidsFromText(textContent) || []).forEach(id => pmidsToQuery.add(id));
                  (googleCheckerInstance.extractPmcidsFromText(textContent) || []).forEach(id => pmcidsToQuery.add(id));
                  (googleCheckerInstance.extractDoisFromText(textContent) || []).forEach(doi => {
                    if (!doi.startsWith(settingsToUse.mdpiDoiPrefix)) doisToQueryApi.add(doi);
                  });

                  // console.log(`${logPrefix} IDs for API: PMIDs=${[...pmidsToQuery].join(',')||'0'}, PMCIDs=${[...pmcidsToQuery].join(',')||'0'}, DOIs=${[...doisToQueryApi].join(',')||'0'}`);

                  if (pmidsToQuery.size > 0) {
                    if (await MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi([...pmidsToQuery], 'pmid', runCache, MDPIFilterCaches.ncbiApiCache)) {
                      itemIsMdpiByApi = true; sourceOfDetection = 'NCBI API (PMID)';
                    }
                  }
                  if (!itemIsMdpiByApi && pmcidsToQuery.size > 0) {
                    if (await MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi([...pmcidsToQuery], 'pmcid', runCache, MDPIFilterCaches.ncbiApiCache)) {
                      itemIsMdpiByApi = true; sourceOfDetection = 'NCBI API (PMCID)';
                    }
                  }
                  if (!itemIsMdpiByApi && doisToQueryApi.size > 0) {
                    if (await MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi([...doisToQueryApi], 'doi', runCache, MDPIFilterCaches.ncbiApiCache)) {
                      itemIsMdpiByApi = true; sourceOfDetection = 'NCBI API (DOI)';
                    }
                  }
                  if (itemIsMdpiByApi) {
                    isMdpi = true;
                    // console.log(`${logPrefix} MDPI confirmed by NCBI API. Source: ${sourceOfDetection}`);
                  } else {
                    // console.log(`${logPrefix} NCBI API did not confirm MDPI for extracted IDs.`);
                  }
                }

                if (!isMdpi) {
                  // console.log(`${logPrefix} MDPI not yet confirmed. Calling ItemContentChecker.`);
                  const contentCheckResult = MDPIFilterItemContentChecker.checkItemContent(
                    item, runCache, settingsToUse.mdpiDoiPrefix, settingsToUse.mdpiDomain,
                    null, null, googleCheckerInstance // Pass googleCheckerInstance
                  );
                  if (contentCheckResult) {
                    isMdpi = true;
                    sourceOfDetection = 'ItemContentChecker';
                    // console.log(`${logPrefix} MDPI confirmed by ItemContentChecker.`);
                  } else {
                    // console.log(`${logPrefix} ItemContentChecker did NOT confirm MDPI.`);
                  }
                }
                
                if (!isMdpi && activeConfig.doiPattern && (item.textContent || "").includes(activeConfig.doiPattern)) {
                  if (activeConfig.doiPattern === settingsToUse.mdpiDoiPrefix) { // Ensure it's the MDPI pattern
                       isMdpi = true;
                       sourceOfDetection = `Config MDPI DOI Pattern in text (${activeConfig.doiPattern})`;
                       // console.log(`${logPrefix} MDPI by config.doiPattern (MDPI prefix) in text: ${activeConfig.doiPattern}`);
                  }
                }
              }

              // console.log(`${logPrefix} Final decision: isMdpi=${isMdpi}, isPotentialMdpi=${isPotentialMdpi}, Source: ${sourceOfDetection}`);

              if (isMdpi || isPotentialMdpi) {
                if (isMdpi) mdpiResultsCount++;
                styleSearchItem(item, isMdpi, isPotentialMdpi, settingsToUse, activeConfig, sourceOfDetection);
                MDPIFilterCaches.citationProcessCache.set(item, {isMdpi, isPotential: isPotentialMdpi, source: sourceOfDetection});
              } else {
                MDPIFilterCaches.citationProcessCache.set(item, {isMdpi: false, isPotential: false, source: sourceOfDetection});
                unstyleSearchItem(item, activeConfig);
              }
            }
            // Update badge count for search results
            if (chrome.runtime && chrome.runtime.id) {
              chrome.runtime.sendMessage({
                type: 'mdpiUpdate',
                data: { badgeCount: mdpiResultsCount, references: [] }
              }).catch(e => {
                if (!e.message.includes("Receiving end does not exist")) {
                  // console.warn("[MDPI Filter CS] Error sending search result badge update:", e.message);
                }
              });
            }
            return mdpiResultsCount;
          }

          async function processAllReferences(runCache, settingsToUse) { // settingsToUse is currentRunSettings
            // console.log("[MDPI Filter CS] processAllReferences called.");
            let collectedMdpiReferences = []; 
            let mdpiFoundInRefs = false;
            const uniqueMdpiRefsForThisRun = new Map(); // Key: contentKey, Value: refData object

            const referenceSelectorString = window.MDPIFilterReferenceSelectors;
            if (!referenceSelectorString) {
              console.error("[MDPI Filter CS] MDPIFilterReferenceSelectors is not defined. Cannot process references.");
              return { collectedMdpiReferences, mdpiFoundInRefs };
            }

            let allPotentialReferenceItems = Array.from(document.querySelectorAll(referenceSelectorString));

            // **** IMPORTANT FILTER: Exclude items within EuropePMC "article citations" ****
            // This ensures they are not processed as main references.
            allPotentialReferenceItems = allPotentialReferenceItems.filter(item => !item.closest('div#article-citations'));
            // **** END OF IMPORTANT FILTER ****

            // Filter out nested reference items (items that are children of other identified reference items)
            allPotentialReferenceItems = allPotentialReferenceItems.filter(item => {
              return !allPotentialReferenceItems.some(otherItem => otherItem !== item && otherItem.contains(item));
            });

            // Specific filter for EuropePMC article pages to exclude "Similar Articles" section
            // from being treated as main references.
            if (isHostnameAllowed('europepmc.org') &&
                (window.location.pathname.includes('/article/') || window.location.pathname.match(/^\/(med|pmc)\//i)) &&
                !window.location.pathname.startsWith('/search')) {
              allPotentialReferenceItems = allPotentialReferenceItems.filter(item => !item.closest('div.references-similar-articles-container'));
            }

            const referenceItems = allPotentialReferenceItems;

            if (referenceItems.length === 0) {
              // console.log("[MDPI Filter CS] No reference items found after filtering.");
              return { collectedMdpiReferences, mdpiFoundInRefs };
            }
            // console.log(`[MDPI Filter CS] Processing ${referenceItems.length} reference items after initial filtering.`);

            if (window.MDPIFilterLinkExtractor && typeof window.MDPIFilterLinkExtractor.resetExpansionFlags === 'function') {
              window.MDPIFilterLinkExtractor.resetExpansionFlags();
            }

            const allNcbiIdsToPreFetch = { pmid: new Set(), pmcid: new Set(), doi: new Set() };
            referenceItems.forEach(itemElement => {
              const itemText = itemElement.textContent || "";
              const links = Array.from(itemElement.querySelectorAll('a[href]'));

              // Use googleCheckerInstance for ID extraction
              (googleCheckerInstance.extractPmidsFromText(itemText) || []).forEach(id => allNcbiIdsToPreFetch.pmid.add(id));
              (googleCheckerInstance.extractPmcidsFromText(itemText) || []).forEach(id => allNcbiIdsToPreFetch.pmcid.add(id));
              
              links.forEach(link => {
                const href = link.href || "";
                const pmid = googleCheckerInstance.extractPmidFromUrl(href);
                if (pmid) allNcbiIdsToPreFetch.pmid.add(pmid);
                const pmcid = googleCheckerInstance.extractPmcidFromUrl(href);
                if (pmcid) allNcbiIdsToPreFetch.pmcid.add(pmcid);
                
                const doi = MDPIFilterItemContentChecker.extractDoiFromLinkInternal(href); // Keep using specific DOI extractor here
                if (doi && !doi.startsWith(settingsToUse.mdpiDoiPrefix)) {
                    allNcbiIdsToPreFetch.doi.add(doi.split('#')[0].split('?')[0].trim());
                }
              });
              const doiTextPattern = /\b(10\.\d{4,9}\/[^"\s'&<>]+)\b/gi;
              let doiMatch;
              while((doiMatch = doiTextPattern.exec(itemText)) !== null) {
                  if (doiMatch[1] && !doiMatch[1].startsWith(settingsToUse.mdpiDoiPrefix)) {
                      allNcbiIdsToPreFetch.doi.add(doiMatch[1].split('#')[0].split('?')[0].trim());
                  }
              }
            });

            const idsForAPICall = { pmid: [], pmcid: [], doi: [] };
            allNcbiIdsToPreFetch.pmid.forEach(id => { if (!ncbiApiCache.has(id)) idsForAPICall.pmid.push(id); else runCache.set(id, ncbiApiCache.get(id)); });
            allNcbiIdsToPreFetch.pmcid.forEach(id => { if (!ncbiApiCache.has(id)) idsForAPICall.pmcid.push(id); else runCache.set(id, ncbiApiCache.get(id)); });
            allNcbiIdsToPreFetch.doi.forEach(id => { if (!ncbiApiCache.has(id)) idsForAPICall.doi.push(id); else runCache.set(id, ncbiApiCache.get(id)); });


            if (idsForAPICall.pmid.length > 0) await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(idsForAPICall.pmid, 'pmid', runCache, ncbiApiCache);
            if (idsForAPICall.pmcid.length > 0) await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(idsForAPICall.pmcid, 'pmcid', runCache, ncbiApiCache);
            if (idsForAPICall.doi.length > 0) await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(idsForAPICall.doi, 'doi', runCache, ncbiApiCache);

            let localRefIdCounter = refIdCounter; // refIdCounter is global to content_script
            for (const itemElement of referenceItems) {
              const { extractedId, updatedRefIdCounter } = window.MDPIFilterReferenceIdExtractor.extractInternalScrollId(itemElement, localRefIdCounter);
              localRefIdCounter = updatedRefIdCounter; // Update local counter for this loop

              // Pass googleCheckerInstance to isMdpiItemByContent
              const isMdpi = isMdpiItemByContent(itemElement, runCache, googleCheckerInstance);
              citationProcessCache.set(itemElement, isMdpi); // Cache boolean result

              if (isMdpi) {
                mdpiFoundInRefs = true;
                // Pass the extractedId to extractReferenceData
                const refData = extractReferenceData(itemElement, extractedId); 

                // Deduplication logic based on contentKey (DOI or text)
                let contentKey = '';
                const itemTextContent = itemElement.textContent || "";

                // Try to get DOI from the primary link first for a more reliable key
                let finalDoi = null;
                if (refData.primaryLink && refData.primaryLink.doi) {
                  finalDoi = refData.primaryLink.doi;
                }
                // If no DOI from primary link, try to extract from text (more prone to errors but a fallback)
                if (!finalDoi) {
                  const doiMatchInText = itemTextContent.match(MDPI_DOI_REGEX); // General DOI regex, not just MDPI
                  if (doiMatchInText && doiMatchInText[0]) {
                    finalDoi = doiMatchInText[0];
                  }
                }

                if (finalDoi) {
                  contentKey = `doi:${finalDoi.toLowerCase()}`;
                } else {
                  // Fallback to sanitized text if no DOI found
                  contentKey = `text:${sanitize(itemTextContent.substring(0, 100).toLowerCase().replace(/\s+/g, ''))}`;
                }

                if (!contentKey) {
                  // If still no key, use the assigned refId as a last resort (less ideal for deduplication across runs)
                  contentKey = `id:${refData.id}`;
                }
                
                if (!uniqueMdpiRefsForThisRun.has(contentKey)) {
                  styleRef(itemElement, refData.id, null); // Apply styling (config is null for non-search pages)
                  uniqueMdpiRefsForThisRun.set(contentKey, { ...refData, number: 0 }); // Number will be assigned later
                  // console.log(`[MDPI Filter CS] Added MDPI ref (key: ${contentKey}):`, refData.text.substring(0,50));
                } else {
                  // console.log(`[MDPI Filter CS] Duplicate MDPI ref skipped (key: ${contentKey}):`, refData.text.substring(0,50));
                  // Ensure even duplicates get the refId attribute for consistency if needed by other parts,
                  // but styleRef might have already been called if it was the first instance.
                  // This ensures that if a duplicate is encountered, it still has the ID.
                  if (!itemElement.dataset.mdpiFilterRefId) {
                      itemElement.dataset.mdpiFilterRefId = uniqueMdpiRefsForThisRun.get(contentKey).id;
                  }
                   // And ensure it's styled if it's an MDPI item, even if a duplicate for collection purposes
                  styleRef(itemElement, uniqueMdpiRefsForThisRun.get(contentKey).id, null);
                }
              } else {
                // Non-MDPI reference item
                if (itemElement.dataset.mdpiFilterRefId) {
                  // If it was previously marked (e.g. by a mutation that made it non-MDPI), clear styling
                  itemElement.classList.remove('mdpi-highlighted-reference', 'mdpi-hidden-reference');
                  itemElement.style.borderLeft = '';
                  itemElement.style.paddingLeft = '';
                  itemElement.style.backgroundColor = '';
                  itemElement.style.display = '';
                  // console.log(`[MDPI Filter CS] Cleared styling for non-MDPI ref:`, itemElement.dataset.mdpiFilterRefId);
                }
              }
            }
            refIdCounter = localRefIdCounter; // Persist the counter state
            collectedMdpiReferences = Array.from(uniqueMdpiRefsForThisRun.values());
            // console.log(`[MDPI Filter CS] processAllReferences FINISHED. Collected MDPI references count: ${collectedMdpiReferences.length}`);
            return { collectedMdpiReferences, mdpiFoundInRefs };
          }

          const debouncedRunAll = window.debounce(() => {
            if (!chrome.runtime?.id) {
              console.warn('[MDPI Filter CS] debouncedRunAll: Extension context invalidated. Aborting.');
              if (mainObserverInstance) mainObserverInstance.disconnect();
              return;
            }
            runAll(currentRunSettings); // Pass the up-to-date settings
          }, 250);

          async function runAll(settingsToUse) { // Parameter name changed for clarity
            if (!settingsToUse) {
              console.error("[MDPI Filter CS] runAll called without settings. Aborting.");
              return;
            }
            // console.log("[MDPI Filter CS] runAll triggered. Settings:", settingsToUse);
            isProcessing = true;
            clearPreviousHighlights(); // Clear previous state before processing
            const runCache = new Map();

            const activeDomainConfig = window.MDPIFilterDomainUtils.getActiveSearchConfig(window.location.hostname, window.location.pathname, domains);

            if (activeDomainConfig) {
              // FIXED: Pass runCache and settingsToUse to processSearchResults
              await processSearchResults(runCache, settingsToUse);
            } else {
              // --- Step 0: Handle page-specific NCBI API check (e.g., on EuropePMC article page) ---
              const isEuropePMCArticlePage = isHostnameAllowed('europepmc.org') &&
                                       (window.location.pathname.includes('/article/') || window.location.pathname.match(/^\/(med|pmc)\//i)) &&
                                       !window.location.pathname.startsWith('/search');

              if (isEuropePMCArticlePage && domains.europepmc && domains.europepmc.useNcbiApi) {
                let pagePmid = null; let pagePmcid = null;
                let urlMatch = window.location.pathname.match(/^\/(?:article\/(?:MED|PMC)\/|med\/|pmc\/)(PMC\d+|\d+)/i);
                if (urlMatch && urlMatch[1]) { if (urlMatch[1].toUpperCase().startsWith('PMC')) pagePmcid = urlMatch[1].toUpperCase(); else if (/^\d+$/.test(urlMatch[1])) pagePmid = urlMatch[1]; }
                if (!pagePmid && !pagePmcid) { /* ... meta tag check ... */ }
                const idsForDirectApiCall = { pmid: [], pmcid: [], doi: [] };
                if (pagePmid) { if (ncbiApiCache.has(pagePmid)) runCache.set(pagePmid, ncbiApiCache.get(pagePmid)); else idsForDirectApiCall.pmid.push(pagePmid); }
                if (pagePmcid) { if (ncbiApiCache.has(pagePmcid)) runCache.set(pagePmcid, ncbiApiCache.get(pagePmcid)); else idsForDirectApiCall.pmcid.push(pagePmcid); }
                if (idsForDirectApiCall.pmid.length > 0) await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(idsForDirectApiCall.pmid, 'pmid', runCache, ncbiApiCache);
                if (idsForDirectApiCall.pmcid.length > 0) await window.MDPIFilterNcbiApiHandler.checkNcbiIdsForMdpi(idsForDirectApiCall.pmcid, 'pmcid', runCache, ncbiApiCache);
              }
              // --- End of Step 0 ---

              const { collectedMdpiReferences: mainCollectedRefs, mdpiFoundInRefs: mainMdpiFound } = await processAllReferences(runCache, settingsToUse);
              
              if (window.MDPIFilterCitedBy?.Processor?.processEntries) {
                // Updated call to pass the checkItemContent function, runCache, and settingsToUse
                await window.MDPIFilterCitedBy.Processor.processEntries(
                  window.MDPIFilterItemContentChecker.checkItemContent,
                  runCache,
                  settingsToUse
                );
              }
              if (window.MDPIFilterSimilarArticles?.Processor?.processEntries) {
                await window.MDPIFilterSimilarArticles.Processor.processEntries(runCache, settingsToUse);
              }
              if (window.MDPIFilterUtils?.styleInlineFootnotes) { // Check for the main styler function
                  // The new styleInlineFootnotes takes (mode, mdpiDoiPrefix, mdpiDomain, runCache)
                  // This needs to be reconciled with how it's called from processAllReferences.
                  // For now, let's assume the one in processAllReferences handles the specific item linking.
                  // A general call might be for unlinked footnotes if that's a feature.
                  // window.MDPIFilterUtils.styleInlineFootnotes(settingsToUse.mode, settingsToUse.mdpiDoiPrefix, settingsToUse.mdpiDomain, runCache);
              }
              updatePopupData(mainCollectedRefs, mainCollectedRefs.length);
            }
            isProcessing = false;
            // console.log("[MDPI Filter CS] runAll finished.");
          }

          function initializeOrReRun() {
            // console.log("[MDPI Filter CS] >>> initializeOrReRun function entered.");
            if (!chrome.runtime?.id) {
              console.warn('[MDPI Filter CS] initializeOrReRun: Extension context invalidated. Aborting.');
              return;
            }
            // currentRunSettings should be up-to-date here
            const currentHostname = window.location.hostname.toLowerCase();
            if (currentHostname === 'onlinelibrary.wiley.com' || currentHostname.endsWith('.onlinelibrary.wiley.com')) {
              const accordionControl = document.querySelector('div.article-accordion .accordion__control[aria-expanded="false"]');
              if (accordionControl) {
                const titleElement = accordionControl.querySelector('.section__title');
                if (titleElement && titleElement.textContent.trim().toLowerCase() === 'references') {
                  accordionControl.click();
                  let waited = 0;
                  const interval = setInterval(() => {
                    const ul = document.querySelector('div.article-accordion ul.rlist.separator');
                    if (ul || waited > 2000) {
                      clearInterval(interval);
                      runAll(currentRunSettings); // Pass current settings
                      setupMainObserver();
                    }
                    waited += 100;
                  }, 100);
                  return;
                }
              }
            }
            runAll(currentRunSettings); // Pass current settings
            setupMainObserver();
          }

          function setupMainObserver() {
            if (mainObserverInstance) mainObserverInstance.disconnect();
            mainObserverInstance = new MutationObserver((mutationsList, observer) => {
              if (!(chrome.runtime && chrome.runtime.id)) {
                console.warn('[MDPI Filter] Main observer: Extension context invalidated. Skipping debouncedRunAll.');
                if (mainObserverInstance) mainObserverInstance.disconnect();
                return;
              }
              debouncedRunAll(); // debouncedRunAll now calls runAll with currentRunSettings
            });
            mainObserverInstance.observe(document.documentElement, { childList: true, subtree: true });
          }

          // --- Message Listener for Scrolling ---
          if (chrome.runtime && chrome.runtime.onMessage) {
            chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
              // only accept messages from your content script
              if (!sender.tab) return; 

              // Accept both scrollToRef and scrollToRefOnPage for compatibility
              if ((msg.type === 'scrollToRefOnPage' || msg.type === 'scrollToRef') && msg.refId) {
                // --- Wiley: Expand References Accordion if Needed ---
                if (isHostnameAllowed('onlinelibrary.wiley.com')) {
                  // Find the accordion control for "References"
                  const accordionControls = document.querySelectorAll('div.article-accordion .accordion__control[aria-expanded="false"]');
                  for (const control of accordionControls) {
                    const titleElement = control.querySelector('.section__title');
                    if (titleElement && titleElement.textContent.trim().toLowerCase() === 'references') {
                      control.click();
                      // Wait for the accordion to expand before scrolling
                      setTimeout(() => {
                        const refElem = document.querySelector(`[data-mdpi-filter-ref-id="${msg.refId}"]`);
                        if (refElem) {
                          refElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          refElem.classList.add('mdpi-ref-scroll-highlight');
                          setTimeout(() => refElem.classList.remove('mdpi-ref-scroll-highlight'), 1500);
                        }
                      }, 400); // 400ms should be enough for the animation
                      sendResponse({ status: 'expanded-and-scrolled' });
                      return true;
                    }
                  }
                }
                // --- Default: Just Scroll ---
                const refElem = document.querySelector(`[data-mdpi-filter-ref-id="${msg.refId}"]`);
                if (refElem) {
                  refElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  refElem.classList.add('mdpi-ref-scroll-highlight');
                  setTimeout(() => refElem.classList.remove('mdpi-ref-scroll-highlight'), 1500);
                  sendResponse({ status: 'scrolled' });
                } else {
                  sendResponse({ status: 'not-found' });
                }
                return true;
              }
              if (msg.type === 'scrollToRef' && msg.refId) {
                const refId = msg.refId;
                console.log('[MDPI Filter CS] Received scrollToRef for refId:', refId);

                // Try to find the element by data-mdpi-filter-ref-id
                let target = document.querySelector(`[data-mdpi-filter-ref-id="${refId}"]`);
                if (!target) {
                  // Try fallback by id
                  target = document.getElementById(refId);
                }

                // Log all current data-mdpi-filter-ref-id values for debugging
                const allRefIds = Array.from(document.querySelectorAll('[data-mdpi-filter-ref-id]')).map(el => el.getAttribute('data-mdpi-filter-ref-id'));
                console.log('[MDPI Filter CS] All current data-mdpi-filter-ref-id values in DOM:', allRefIds);

                if (target) {
                  console.log('[MDPI Filter CS] Found target for scrollToRef:', target);
                  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  // Optionally highlight
                  target.classList.add('mdpi-scroll-highlight');
                  setTimeout(() => target.classList.remove('mdpi-scroll-highlight'), 1500);
                  sendResponse({ status: 'success', message: 'Scrolled to reference.' });
                } else {
                  console.warn('[MDPI Filter CS] Could not find element for refId:', refId);
                  sendResponse({ status: 'error', message: 'Reference element not found.', allRefIds });
                }
                return true; // Indicate async response
              }
              return false; 
            });
          } else {
            console.warn("[MDPI Filter CS] chrome.runtime.onMessage not available. Scrolling from popup will not work.");
          }

          // --- Add MutationObserver logging for reference list changes ---
          if (typeof MutationObserver !== 'undefined') {
            const refListObserver = new MutationObserver((mutationsList) => {
              for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                 
                  const allRefIds = Array.from(document.querySelectorAll('[data-mdpi-filter-ref-id]')).map(el => el.getAttribute('data-mdpi-filter-ref-id'));
                  console.log('[MDPI Filter CS] MutationObserver: Reference list changed. Current data-mdpi-filter-ref-id values:', allRefIds);
                }
              }
            });
            // Observe the whole document for changes to reference items
            refListObserver.observe(document.body, { childList: true, subtree: true });
          }

          // --- Add highlight style for scroll feedback ---
          (function addMdpiScrollHighlightStyle() {
            if (!document.getElementById('mdpi-ref-scroll-highlight-style')) {
              const style = document.createElement('style');
              style.id = 'mdpi-ref-scroll-highlight-style';
              style.textContent = `
                .mdpi-ref-scroll-highlight {
                  outline: 3px solid #E2211C !important;
                  background: #ffe0e0 !important;
                  transition: outline 0.2s, background 0.2s;
                }
              `;
              document.head.appendChild(style);
            }
          })();

          // --- Initial Execution ---
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
              if (!chrome.runtime?.id) { console.warn('[MDPI Filter CS] DOMContentLoaded: Extension context invalidated. Skipping initial run.'); return; }
              initializeOrReRun();
            });
          } else {
            if (!chrome.runtime?.id) { console.warn('[MDPI Filter CS] Document ready: Extension context invalidated. Skipping initial run.'); }
            else { initializeOrReRun(); }
          }

          // Listen for force resend request from popup
          chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg && msg.type === 'forceResendMdpiReferences') {
              // This needs to access the *latest* collected references.
              // runAll should be responsible for the final update to the popup.
              // A direct call to updatePopupData here might send stale data if runAll hasn't completed.
              // Better to trigger a re-run or ensure runAll's update is the source of truth.
              // For now, let's re-trigger runAll, which will call updatePopupData.
              console.log("[MDPI Filter CS] Received forceResendMdpiReferences. Triggering runAll.");
              if (chrome.runtime?.id) {
                  runAll(currentRunSettings); // Re-run with current settings
                  sendResponse({ status: 'rerun-triggered' });
              } else {
                  sendResponse({ status: 'context-invalidated' });
              }
              return true; // Indicate async response
            }
            return false; // Important for other listeners
          });

      // Enhanced MutationObserver to handle dynamic content like popups
      const observerConfig = { 
        childList: true, 
        subtree: true,
        attributes: false // Focus on DOM structure changes, not attribute changes
      };

      const debouncedProcessReferences = debounce(() => {
        // console.log("[MDPI Filter CS] Debounced processReferences triggered by MutationObserver.");
        processReferences();
      }, 500); // 500ms delay to avoid excessive calls

      const observer = new MutationObserver(mutations => {
        let shouldReprocess = false;
        
        mutations.forEach(mutation => {
          // Check for added nodes that might contain references or popups
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if the added node contains reference elements
              if (node.matches && node.matches(window.MDPIFilterReferenceSelectors)) {
                shouldReprocess = true;
              } else if (node.querySelector && node.querySelector(window.MDPIFilterReferenceSelectors)) {
                shouldReprocess = true;
              }
              // Specifically check for Oxford University Press popup content
              else if (node.id === 'revealContent' || node.querySelector('#revealContent')) {
                shouldReprocess = true;
              }
            }
          });
        });

        if (shouldReprocess) {
          debouncedProcessReferences();
        }
      });

      observer.observe(document.body, observerConfig);

        }); // End of chrome.storage.sync.get callback
      } else {
        console.warn("[MDPI Filter CS] Extension context invalidated before storage access. Main script logic will not execute for this frame.");
      }
    } // End of if (!dependenciesMet) else
  } // End of if (!window.mdpiFilterInjected)
})();

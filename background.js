// background.js

// --- Robust Per-Tab Debounce ---
const historyUpdateDebounceTimeouts = new Map();
const backgroundDebouncePerTab = (func, wait) => {
  return (tabId, ...args) => {
    const existingTimeout = historyUpdateDebounceTimeouts.get(tabId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      // console.log(`[MDPI Filter BG] Debounce cleared existing timeout for tab ${tabId}.`);
    }
    // console.log(`[MDPI Filter BG] Debounce setting new timeout for tab ${tabId} (${wait}ms).`);
    historyUpdateDebounceTimeouts.set(tabId, setTimeout(() => {
      historyUpdateDebounceTimeouts.delete(tabId); // Clean up map
      console.log(`[MDPI Filter BG] Debounce executing injectModules for tab ${tabId} after ${wait}ms.`);
      func.apply(this, [tabId, ...args]);
    }, wait));
  };
};

// Debounced version of injectModules for history updates
// const debouncedInjectForHistory = backgroundDebouncePerTab(injectModules, 300); // 300ms delay

// --- Data Store for References ---
const tabReferenceData = {}; // { tabId: [references] }

async function injectModules(tabId, triggerSource = "unknown") {
  console.log(`[MDPI Filter BG] injectModules called for tab ${tabId} by ${triggerSource}`);
  // --- Ensure the guard variable is reset ---
  try {
    await chrome.scripting.executeScript({
        target: { tabId, allFrames: true }, // Target all frames for reset
        func: () => {
            if (typeof window !== 'undefined') {
                delete window.mdpiFilterInjected;
                // console.log('[MDPI Filter BG Pre-Inject] Attempted reset window.mdpiFilterInjected');
            }
        },
        world: "MAIN" // Try resetting in MAIN world too, although content scripts are isolated
    });
     await chrome.scripting.executeScript({
        target: { tabId, allFrames: true }, // Target all frames for reset
        func: () => {
            if (typeof window !== 'undefined') {
                delete window.mdpiFilterInjected;
                // console.log('[MDPI Filter BG Pre-Inject] Attempted reset window.mdpiFilterInjected (ISOLATED)');
            }
        }
        // Default is ISOLATED world
    });
  } catch(e) {
      // console.warn('[MDPI Filter BG Pre-Inject] Failed to reset guard:', e.message);
  }
  // ---

  const modules = [
    'content/domains.js',
    'content/sanitizer.js',
    'content/utils.js',
    'content/cache_manager.js',
    'content/reference_selectors.js',
    'content/inline_footnote_selectors.js',
    'content/inline_footnote_styler.js',
    'content/cited_by_selectors.js',
    'content/cited_by_styler.js',
    'content/cited_by_processor.js',
    'content/link_extraction_selectors.js',
    'content/link_extractor.js',
    'content/item_content_checker.js',
    'content/reference_id_extractor.js',
    'content/ncbi_api_handler.js', // Added new module
    'content/content_script.js'
  ];
  try {
    // Inject sequentially into the main frame only initially? Let's stick to allFrames for now.
    for (const file of modules) {
        await chrome.scripting.executeScript({
            target: { tabId, allFrames: true }, // Inject into all frames
            files: [file]
        });
    }
    console.log(`[MDPI Filter BG] Successfully injected modules sequentially into tab ${tabId} (Trigger: ${triggerSource})`);
  } catch (error) {
     // Ignore common errors during navigation/injection races
     if (!(error.message.includes('Cannot access') ||
           error.message.includes('Receiving end does not exist') ||
           error.message.includes('context invalidated') ||
           error.message.includes('Could not establish connection') ||
           error.message.includes('No tab with id'))) {
        console.warn(`[MDPI Filter BG] Failed to inject modules into tab ${tabId} (Trigger: ${triggerSource}):`, error);
     }
  }
}

// --- Simplified Event Listeners ---

// 1) Clear badge AND reference data when the main URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if status is loading AND a URL is provided in changeInfo
  if (changeInfo.status === 'loading' && changeInfo.url) {
    try {
      // Compare the new URL (without hash) to the existing tab URL (without hash)
      const newUrl = new URL(changeInfo.url);
      if (tab.url) { // Check if tab.url is defined and not empty
        const oldUrl = new URL(tab.url); // Get current URL from tab object

        // Clear badge and references only if the origin or pathname has changed
        if (newUrl.origin !== oldUrl.origin || newUrl.pathname !== oldUrl.pathname) {
          chrome.action.setBadgeText({ text: '', tabId });
          delete tabReferenceData[tabId]; // Clear stored references for the tab
          console.log(`[MDPI Filter BG] Cleared badge and references for loading tab ${tabId} (URL changed)`);
        } else {
          // console.log(`[MDPI Filter BG] Tab ${tabId} loading, but URL path/origin unchanged (likely hash change). Badge not cleared.`);
        }
      } else {
        // console.log(`[MDPI Filter BG] Tab ${tabId} loading, but tab.url is not yet available. Badge not cleared.`);
        // Potentially clear badge here if changeInfo.url indicates a new navigation
        // and oldUrl is not available to compare. This might be too aggressive.
        // For now, if oldUrl can't be determined, we don't clear.
      }
    } catch (e) {
       // Ignore errors (e.g., invalid URLs, tab closed)
       // console.log(`[MDPI Filter BG] Error during tabs.onUpdated check for tab ${tabId}: ${e.message}`);
    }
  }
});

// 2) Inject on every full load (main frame ONLY)
chrome.webNavigation.onCompleted.addListener(
  details => {
    if (details.frameId === 0) {
      console.log(`[MDPI Filter BG] webNavigation.onCompleted: Attempting to inject scripts into main frame of tab ${details.tabId}`);
      chrome.scripting.executeScript({
        target: { tabId: details.tabId, allFrames: false }, // Inject only into the main frame
        files: [
          'content/domains.js',
          'content/sanitizer.js',
          'content/utils.js',
          'content/cache_manager.js',
          'content/reference_selectors.js',
          'content/inline_footnote_selectors.js',
          'content/inline_footnote_styler.js',
          'content/cited_by_selectors.js',
          'content/cited_by_styler.js',
          'content/cited_by_processor.js',
          'content/link_extraction_selectors.js',
          'content/link_extractor.js',
          'content/item_content_checker.js',
          'content/reference_id_extractor.js',
          'content/ncbi_api_handler.js', // Added new module
          'content/content_script.js'
        ]
      }).catch(e => {
          // Ignore common injection errors, especially during navigation
          if (!(e.message.includes('Cannot access') ||
                e.message.includes('Receiving end does not exist') ||
                e.message.includes('context invalidated') ||
                e.message.includes('Could not establish connection') ||
                e.message.includes('No tab with id'))) {
             console.warn(`[MDPI Filter BG] Failed to inject modules into main frame of tab ${details.tabId} (onCompleted):`, e);
          }
      });
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);

// 3) Message listener for updates, popup requests, AND scroll requests
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Message from Content Script with count and references
  if (msg.type === 'mdpiUpdate' && sender.tab?.id) { // Changed msg.action back to msg.type
    const tabId = sender.tab.id;
    // Access data from msg.data
    const count = msg.data?.badgeCount ?? 0; 
    // Ensure badge is updated (example, actual badge logic might be more complex)
    chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '', tabId: tabId });
    if (count > 0) {
      chrome.action.setBadgeBackgroundColor({ color: '#E2211C', tabId: tabId });
    }

    // Store references
    if (msg.data && Array.isArray(msg.data.references)) {
      tabReferenceData[tabId] = msg.data.references;
      // console.log(`[MDPI Filter BG] Stored ${msg.data.references.length} references for tab ${tabId}.`);
    } else {
      // console.log(`[MDPI Filter BG] No references in mdpiUpdate or not an array for tab ${tabId}. Clearing.`);
      delete tabReferenceData[tabId]; // Clear if no valid references
    }
    // Optional: sendResponse({status: "MDPI data received by background"});
  }

  // Message from Popup Script requesting references
  if (msg.type === 'getMdpiReferences') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        const tabId = tabs[0].id;
        const refsForTab = tabReferenceData[tabId] || [];
        // console.log(`[MDPI Filter BG] Popup requested references for tab ${tabId}. Found: ${refsForTab.length}`);
        sendResponse({ references: refsForTab });
      } else {
        console.warn("[MDPI Filter BG] getMdpiReferences: No active tab found or tab has no ID.");
        sendResponse({ references: [] });
      }
    });
    return true; // Indicate asynchronous response
  }

  // --- New: Message from Popup Script to Scroll to Reference ---
  if (msg.type === 'scrollToRef' && msg.refId) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0 && tabs[0].id) {
            const tabId = tabs[0].id;
            console.log(`[MDPI Filter BG] Forwarding scrollToRefOnPage to tab ${tabId} for refId: ${msg.refId}`);
            chrome.tabs.sendMessage(tabId, { type: 'scrollToRefOnPage', refId: msg.refId }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error(`[MDPI Filter BG] Error sending scrollToRefOnPage to tab ${tabId}:`, chrome.runtime.lastError.message);
                    sendResponse({ status: 'error_sending_to_content', message: chrome.runtime.lastError.message });
                } else {
                    console.log(`[MDPI Filter BG] Response from content script for scrollToRefOnPage:`, response);
                    sendResponse(response); // Forward content script's response to popup
                }
            });
        } else {
            console.warn("[MDPI Filter BG] scrollToRef: No active tab found or tab has no ID.");
            sendResponse({ status: 'error_no_active_tab', message: 'No active tab found to send scroll message.' });
        }
    });
    return true; // Indicate asynchronous response
  }
  // --- End New Handler ---

  // Return true for asynchronous sendResponse calls if any path might use it.
  // For 'mdpiUpdate', if it's fire-and-forget from content script, no return true is needed for that branch.
  // For 'getMdpiReferences' and 'scrollToRef', 'return true' is correctly placed if they are async.
  if (msg.type === 'getMdpiReferences' || (msg.type === 'scrollToRef' && msg.refId)) {
    return true; // Keep this for async operations
  }
});

// Clean up references when a tab is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  delete tabReferenceData[tabId];
  console.log(`[MDPI Filter BG] Cleared references for closed tab ${tabId}.`);
});

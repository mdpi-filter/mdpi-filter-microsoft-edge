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
      console.log(`[MDPI Filter BG] webNavigation.onCompleted: Tab ${details.tabId} main frame completed loading.`);
      // Assuming manifest.json handles all script injections now.
      // If issues persist with scripts not loading, this might need to be revisited,
      // but for now, rely on manifest to avoid double injection or conflicts.
      // injectModules(details.tabId, "webNavigation.onCompleted"); // Commented out
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);

// 3) Message listener for updates, popup requests, AND scroll requests
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Message from Content Script with count and references
  // Make it robust: check for msg.type === 'mdpiUpdate' OR msg.action === 'mdpiUpdate'
  const isMdpiUpdateMessage = (msg.type === 'mdpiUpdate' || msg.action === 'mdpiUpdate');

  if (isMdpiUpdateMessage && sender.tab?.id) {
    const tabId = sender.tab.id;
    const data = msg.data || {}; // Ensure data object exists, and default to empty if not.
    const count = data.badgeCount ?? 0;

    // Update badge
    chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '', tabId: tabId });
    if (count > 0) {
      chrome.action.setBadgeBackgroundColor({ color: '#E2211C', tabId: tabId });
    } else {
      // Optional: Clear badge background color if count is 0, e.g., by setting to transparent
      // chrome.action.setBadgeBackgroundColor({ color: [0, 0, 0, 0], tabId: tabId });
    }

    // Store references
    if (data.references && Array.isArray(data.references)) {
      tabReferenceData[tabId] = data.references;
      // console.log(`[MDPI Filter BG] Stored ${data.references.length} references for tab ${tabId} (using ${msg.type ? 'type' : 'action'}).`);
    } else {
      // console.log(`[MDPI Filter BG] No valid references array in mdpiUpdate for tab ${tabId}. Clearing. Received data.references:`, data.references);
      delete tabReferenceData[tabId]; // Clear if no valid references
    }
    // mdpiUpdate is usually fire-and-forget from content script, so no sendResponse needed for this branch.
  }

  // Message from Popup Script requesting references
  if (msg.type === 'getMdpiReferences') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0 && tabs[0].id != null) {
        const tabId = tabs[0].id;
        const refs = tabReferenceData[tabId] || [];
        // console.log(`[MDPI Filter BG] Popup requested references for tab ${tabId}. Found: ${refs.length}`);
        sendResponse({ references: refs });
      } else {
        // console.log("[MDPI Filter BG] Popup requested references, but no active tab found or tab ID missing.");
        sendResponse({ references: [] }); // Send empty array if no active tab
      }
    });
    return true; // Important for async sendResponse
  }

  // Message from Popup Script to Scroll to Reference
  if (msg.type === 'scrollToRef' && msg.refId) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0 && tabs[0].id != null) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'scrollToRef', refId: msg.refId }, response => {
          if (chrome.runtime.lastError) {
            // console.error('[MDPI Filter BG] Error sending scrollToRef to content script:', chrome.runtime.lastError.message);
          }
          // console.log('[MDPI Filter BG] scrollToRef response from content script:', response);
          if (sendResponse) { // Check if sendResponse is still valid
            try {
              sendResponse(response);
            } catch (e) {
              // console.warn('[MDPI Filter BG] Could not sendResponse for scrollToRef:', e.message);
            }
          }
        });
      } else {
        // console.log("[MDPI Filter BG] scrollToRef: No active tab found.");
        if (sendResponse) {
          try {
            sendResponse({ success: false, error: "No active tab found" });
          } catch (e) { /* console.warn */ }
        }
      }
    });
    return true; // Important for async sendResponse
  }

  // If other message types are added and are async, they also need to return true.
  // For the mdpiUpdate message, since it's fire-and-forget, we don't return true from its branch.
});

// Clean up references when a tab is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  delete tabReferenceData[tabId];
  console.log(`[MDPI Filter BG] Cleared references for closed tab ${tabId}.`);
});

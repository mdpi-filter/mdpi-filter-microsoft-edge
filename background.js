// background.js

// Simplified Debounce function for background script
let historyUpdateTimeout; // Use a single timeout variable

const backgroundDebounceSimple = (func, wait) => {
  return (tabId, ...args) => {
    console.log(`[MDPI Filter BG] Debounce triggered for tab ${tabId}. Clearing previous timeout.`);
    clearTimeout(historyUpdateTimeout);
    historyUpdateTimeout = setTimeout(() => {
      console.log(`[MDPI Filter BG] Debounce executing injectModules for tab ${tabId} after ${wait}ms.`);
      func.apply(this, [tabId, ...args]);
    }, wait);
  };
};

// Debounced version of injectModules using the simplified debounce
// Reduce delay back to a more responsive value
const debouncedInjectForHistory = backgroundDebounceSimple(injectModules, 250); // Reduced to 250ms

async function injectModules(tabId) {
  // --- Ensure the guard variable is reset ---
  // This tries to unset the guard in the content script environment before injecting.
  // It might fail if the context is already invalid, but worth trying.
  try {
    await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
            if (typeof window !== 'undefined') {
                delete window.mdpiFilterInjected;
                console.log('[MDPI Filter BG Pre-Inject] Reset window.mdpiFilterInjected');
            }
        }
    });
  } catch(e) {
      // console.warn('[MDPI Filter BG Pre-Inject] Failed to reset guard:', e.message);
  }
  // ---

  const modules = [
    'content/domains.js',
    'content/sanitizer.js',
    'content/content_script.js'
  ];
  try {
    // Inject sequentially to ensure dependencies are met and potentially reduce race conditions
    for (const file of modules) {
        await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            files: [file]
        });
    }
    console.log(`[MDPI Filter BG] Successfully injected modules sequentially into tab ${tabId}`);
  } catch (error) {
     if (error.message.includes('Cannot access') || error.message.includes('Receiving end does not exist') || error.message.includes('context invalidated')) {
        // console.log(`[MDPI Filter BG] Injection error (likely navigation/timing): ${error.message}`);
     } else {
        console.warn(`[MDPI Filter BG] Failed to inject modules into tab ${tabId}:`, error);
     }
  }
}

// Full page loads - Inject immediately
chrome.webNavigation.onCompleted.addListener(
  details => {
    if (details.frameId === 0) {
      console.log(`[MDPI Filter BG] onCompleted triggered for tab ${details.tabId}, injecting modules.`);
      injectModules(details.tabId);
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);

// History state updates (fragment changes) - Use simplified debounced injection
chrome.webNavigation.onHistoryStateUpdated.addListener(
  details => {
     if (details.frameId === 0) {
      console.log(`[MDPI Filter BG] onHistoryStateUpdated triggered for tab ${details.tabId}, queueing debounced injection.`);
      debouncedInjectForHistory(details.tabId);
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'mdpiCount' && sender.tab?.id) {
    const count = message.count;
    const text = count > 0 ? count.toString() : ''; // Show count or clear badge
    try {
        chrome.action.setBadgeText({
          text: text,
          tabId: sender.tab.id
        });
        if (count > 0) {
            chrome.action.setBadgeBackgroundColor({
                color: '#E2211C', // Red background for the badge
                tabId: sender.tab.id
            });
        }
    } catch (error) {
        // console.log(`[MDPI Filter BG] Error setting badge for tab ${sender.tab.id}: ${error.message}`);
    }
  }
});

// Optional: Clear badge when tab is updated (e.g., navigating away)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
         console.log(`[MDPI Filter BG] onUpdated status 'loading' for tab ${tabId}, clearing badge.`);
         try {
            chrome.action.setBadgeText({ text: '', tabId: tabId });
         } catch (error) {
            // console.log(`[MDPI Filter BG] Error clearing badge for tab ${tabId}: ${error.message}`);
         }
    }
});

// Optional: Clear badge when a tab is closed (though usually handled by Chrome)
// chrome.tabs.onRemoved.addListener((tabId) => { ... });

// background.js

// Debounce function specifically for background script usage
const backgroundDebounce = (func, wait) => {
  let timeout;
  // Use a Map to store timeouts per tabId
  const timeouts = new Map();

  return (tabId, ...args) => {
    clearTimeout(timeouts.get(tabId));
    timeouts.set(tabId, setTimeout(() => {
      timeouts.delete(tabId);
      func.apply(this, [tabId, ...args]);
    }, wait));
  };
};

// Debounced version of injectModules specifically for history updates
const debouncedInjectForHistory = backgroundDebounce(injectModules, 300); // 300ms delay

async function injectModules(tabId) {
  const modules = [
    'content/domains.js',
    'content/sanitizer.js',
    'content/content_script.js'
  ];
  try {
    await Promise.all(modules.map(file =>
      chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: [file]
      })
    ));
    console.log(`[MDPI Filter BG] Successfully injected modules into tab ${tabId}`);
  } catch (error) {
     if (error.message.includes('Cannot access') || error.message.includes('Receiving end does not exist')) {
        // console.log(`[MDPI Filter BG] Injection error (likely navigation): ${error.message}`);
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
      injectModules(details.tabId); // Inject directly, no debounce needed
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);

// History state updates (fragment changes) - Use debounced injection
chrome.webNavigation.onHistoryStateUpdated.addListener(
  details => {
     if (details.frameId === 0) {
      console.log(`[MDPI Filter BG] onHistoryStateUpdated triggered for tab ${details.tabId}, queueing debounced injection.`);
      // Call the debounced function, passing the tabId
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

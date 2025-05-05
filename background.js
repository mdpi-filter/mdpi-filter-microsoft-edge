// background.js
async function injectModules(tabId) {
  // REMOVED: Badge clearing before injecting/re-injecting

  const modules = [
    'content/utils.js',
    'content/domains.js',
    'content/sanitizer.js', // Ensure sanitizer is loaded first
    'content/content_script.js'
  ];
  // Use Promise.all for potentially faster parallel injection
  try {
    await Promise.all(modules.map(file =>
      chrome.scripting.executeScript({
        target: { tabId, allFrames: true }, // Inject into all frames
        files: [file]
      })
    ));
    console.log(`[MDPI Filter BG] Successfully injected modules into tab ${tabId}`);
  } catch (error) {
     // Log errors more informatively, but ignore common ones during navigation
     if (error.message.includes('Cannot access') || error.message.includes('Receiving end does not exist')) {
        // console.log(`[MDPI Filter BG] Injection error (likely navigation): ${error.message}`);
     } else {
        console.warn(`[MDPI Filter BG] Failed to inject modules into tab ${tabId}:`, error);
     }
  }
}

// Full page loads
chrome.webNavigation.onCompleted.addListener(
  details => {
    // Inject only into the main frame after it's fully loaded
    if (details.frameId === 0) {
      console.log(`[MDPI Filter BG] onCompleted triggered for tab ${details.tabId}, injecting modules.`);
      injectModules(details.tabId);
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);

// *** RE-ADD onHistoryStateUpdated Listener ***
// Handles URL fragment changes (e.g., clicking #links) in SPAs or regular pages
chrome.webNavigation.onHistoryStateUpdated.addListener(
  details => {
     // Inject only into the main frame after history state update
     if (details.frameId === 0) {
      console.log(`[MDPI Filter BG] onHistoryStateUpdated triggered for tab ${details.tabId}, injecting modules.`);
      injectModules(details.tabId);
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);
// *** END RE-ADD ***

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'mdpiCount' && sender.tab?.id) {
    const count = message.count;
    const text = count > 0 ? count.toString() : ''; // Show count or clear badge
    // Use try-catch as the tab might close between message send and badge update
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
  // Return true to indicate async response possibility if needed, though not currently used
  // return true;
});


// Optional: Clear badge when tab is updated (e.g., navigating away)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Clear badge ONLY when the page is actively loading a new document
    if (changeInfo.status === 'loading') {
         console.log(`[MDPI Filter BG] onUpdated status 'loading' for tab ${tabId}, clearing badge.`);
         // Use try-catch as tab might close
         try {
            chrome.action.setBadgeText({ text: '', tabId: tabId });
         } catch (error) {
            // console.log(`[MDPI Filter BG] Error clearing badge for tab ${tabId}: ${error.message}`);
         }
    }
});

// Optional: Clear badge when a tab is closed (though usually handled by Chrome)
// chrome.tabs.onRemoved.addListener((tabId) => { ... });

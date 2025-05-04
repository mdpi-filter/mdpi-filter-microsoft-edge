// background.js
async function injectModules(tabId) {
  // Clear badge before injecting/re-injecting
  try {
    await chrome.action.setBadgeText({ text: '', tabId: tabId });
  } catch (e) {
    // Ignore errors, tab might be closed
  }

  const modules = [
    'content/utils.js',
    'content/domains.js',
    'content/sanitizer.js', // Ensure sanitizer is loaded first
    'content/content_script.js'
  ];
  for (const file of modules) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: [file]
      });
    } catch (error) {
      // console.warn(`Failed to inject ${file} into tab ${tabId}: ${error.message}`);
    }
  }
}

// Full page loads
chrome.webNavigation.onCompleted.addListener(
  details => {
    if (details.frameId === 0) { // Only main frame
      injectModules(details.tabId);
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);

// SPA / history‐state updates
chrome.webNavigation.onHistoryStateUpdated.addListener(
  details => {
     if (details.frameId === 0) { // Only main frame
      injectModules(details.tabId);
    }
  },
  { url: [{ schemes: ['http','https'] }] }
);

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'mdpiCount' && sender.tab?.id) {
    const count = message.count;
    const text = count > 0 ? count.toString() : ''; // Show count or clear badge
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
  }
});

// Optional: Clear badge when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  // No need to explicitly clear, badge is tab-specific
});

// Optional: Clear badge when tab is updated (e.g., navigating away)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Clear badge if the URL changes significantly or page is loading
    if (changeInfo.status === 'loading' || changeInfo.url) {
         chrome.action.setBadgeText({ text: '', tabId: tabId });
    }
});

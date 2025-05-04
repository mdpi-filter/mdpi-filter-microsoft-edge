// background.js
async function injectModules(tabId) {
  const modules = [
    'content/utils.js',
    'content/domains.js',
    'content/sanitizer.js',
    'content/content_script.js'
  ];
  for (const file of modules) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [file]
    });
  }
}

// Full page loads
chrome.webNavigation.onCompleted.addListener(
  details => injectModules(details.tabId),
  { url: [{ schemes: ['http','https'] }] }
);

// SPA / history‐state updates
chrome.webNavigation.onHistoryStateUpdated.addListener(
  details => injectModules(details.tabId),
  { url: [{ schemes: ['http','https'] }] }
);

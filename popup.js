// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const radios = document.querySelectorAll('input[name="mode"]');
  const saveBtn = document.getElementById('save');
  const status = document.getElementById('status');
  const reportBtn = document.getElementById('reportIssue');
  const referencesList = document.getElementById('referencesList');
  const referencesPlaceholder = document.getElementById('referencesPlaceholder'); // The static <li>
  const referencesCountSpan = document.getElementById('referencesCount');

  // --- Load Mode Setting ---
  chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
    radios.forEach(r => r.checked = (r.value === mode));
  });

  // --- Save Mode Setting ---
  saveBtn.addEventListener('click', () => {
    const selected = Array.from(radios).find(r => r.checked).value;
    chrome.storage.sync.set({ mode: selected }, () => {
      status.textContent = `Mode set to "${selected}"`;
      setTimeout(() => status.textContent = '', 2000);
    });
  });

  // --- Report Issue Button ---
  reportBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].url) {
        const currentTabUrl = tabs[0].url;
        const githubRepo = 'mdpi-filter/mdpi-filter-chrome';
        const currentMode = Array.from(radios).find(r => r.checked)?.value || 'N/A';
        const manifest = chrome.runtime.getManifest();
        const extensionName = manifest.name;
        const extensionVersion = manifest.version;

        const issueTitle = encodeURIComponent(`Filter Issue on: ${currentTabUrl}`);
        const issueBody = encodeURIComponent(
`**Report a filter issue**

Report filter issues with specific websites to the ${githubRepo} issue tracker. Requires a GitHub account.

To avoid burdening volunteers with duplicate reports, please verify that the issue has not already been reported by searching the existing issues:
https://github.com/${githubRepo}/issues

*Note: clicking the button will cause the page's origin to be sent to GitHub.*

---

**Address of the webpage:**

${currentTabUrl}

**Describe the filter issue:**

[Please describe the problem you encountered. Was an MDPI result missed? Was a non-MDPI result incorrectly flagged? Provide details.]

---
**Troubleshooting Information:**

*   **Extension Name:** ${extensionName}
*   **Extension Version:** ${extensionVersion}
*   **Current Filter Mode:** ${currentMode}
*   **Browser:** [Please fill in - e.g., Chrome 123.0.6312.122]
*   **Operating System:** [Please fill in - e.g., Windows 11 / macOS Sonoma]

**Screenshots (Optional but helpful):**

[If applicable, drag and drop screenshots here to help explain the problem.]

**Additional context (Optional):**

[Add any other context about the problem here, e.g., specific search query used.]
`);
        const githubIssueUrl = `https://github.com/${githubRepo}/issues/new?title=${issueTitle}&body=${issueBody}`;
        chrome.tabs.create({ url: githubIssueUrl });
      } else {
        status.textContent = 'Could not get current tab URL.';
        setTimeout(() => status.textContent = '', 3000);
      }
    });
  });

  // --- Load and Display References ---
  function displayReferences(referencesArray) {
    const validReferences = Array.isArray(referencesArray) ? referencesArray : [];
    const count = validReferences.length;
    referencesCountSpan.textContent = count;

    // Clear only dynamically added <li> items, keeping the static placeholder structure
    Array.from(referencesList.querySelectorAll('li:not(#referencesPlaceholder)'))
         .forEach(li => li.remove());

    if (count === 0) {
      // Message in placeholder should be set by the sendMessage callback for errors or initial empty.
      // This function just ensures it's visible.
      referencesPlaceholder.style.display = 'block';
      // If not an error state and truly no references, ensure appropriate message.
      if (!referencesPlaceholder.classList.contains('error')) {
        referencesPlaceholder.textContent = 'No MDPI references detected on this page.';
      }
    } else { // count > 0
      referencesPlaceholder.style.display = 'none'; // Hide static placeholder

      validReferences.forEach(ref => {
        // Defensive check for ref structure
        if (typeof ref !== 'object' || ref === null || typeof ref.id !== 'string' || typeof ref.text !== 'string') {
          console.warn('[MDPI Filter Popup] Skipping invalid reference object:', ref);
          return; // Skip this malformed reference
        }

        const li = document.createElement('li');
        li.dataset.refId = ref.id;
        li.title = "Click to scroll to reference";
        let content = '';
        if (ref.number) {
          content += `<span class="ref-number">${escapeHtml(String(ref.number))}. </span>`;
        }
        content += `<span class="ref-text">${escapeHtml(ref.text)}</span>`;
        li.innerHTML = content;
        referencesList.appendChild(li); // Add new items after the placeholder (which is now hidden)
      });
    }
  }

  // --- Add Click Listener for Scrolling ---
  referencesList.addEventListener('click', (event) => {
    const clickedLi = event.target.closest('li[data-ref-id]');
    if (clickedLi) {
      const refId = clickedLi.dataset.refId;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0 && tabs[0].id != null) {
          chrome.runtime.sendMessage({ type: 'scrollToRef', refId: refId, tabId: tabs[0].id }, (response) => {
            if (chrome.runtime.lastError) {
              console.error('[MDPI Filter Popup] Error sending scrollToRef:', chrome.runtime.lastError.message);
            }
          });
        }
      });
    }
  });

  // Helper to escape HTML
  function escapeHtml(unsafe) {
    if (unsafe === null || typeof unsafe === 'undefined') return '';
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }

  // --- Robust Reference Loader with Retry ---
  function loadReferencesWithRetry(retries = 3, delayMs = 300) {
    referencesPlaceholder.textContent = 'Loading references...';
    referencesPlaceholder.classList.remove('error');
    referencesPlaceholder.style.display = 'block';
    referencesCountSpan.textContent = '0';

    function tryLoad(attempt) {
      chrome.runtime.sendMessage({ type: 'getMdpiReferences' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error getting references:", chrome.runtime.lastError.message);
          referencesPlaceholder.textContent = 'Error loading references.';
          referencesPlaceholder.classList.add('error');
          displayReferences([]);
        } else if (response && response.references && Array.isArray(response.references)) {
          if (response.references.length === 0 && attempt < retries) {
            // Try again after a short delay
            setTimeout(() => tryLoad(attempt + 1), delayMs);
          } else {
            if (response.references.length === 0) {
              referencesPlaceholder.textContent = 'No MDPI references detected on this page.';
            }
            displayReferences(response.references);
          }
        } else {
          referencesPlaceholder.textContent = 'Could not load references from page.';
          referencesPlaceholder.classList.add('error');
          displayReferences([]);
        }
      });
    }

    tryLoad(0);
  }

  // --- Call the robust loader on popup open ---
  loadReferencesWithRetry();
});

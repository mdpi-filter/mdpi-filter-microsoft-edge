// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const radios = document.querySelectorAll('input[name="mode"]');
  const saveBtn = document.getElementById('save');
  const status = document.getElementById('status');
  const reportBtn = document.getElementById('reportIssue');
  const referencesList = document.getElementById('referencesList'); // Get the UL element
  const referencesPlaceholder = document.getElementById('referencesPlaceholder'); // Get the placeholder LI

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
  function displayReferences(references) {
    referencesList.innerHTML = ''; // Clear existing list

    if (!references || references.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No MDPI references detected on this page.';
      li.className = 'placeholder'; // Style as placeholder
      referencesList.appendChild(li);
      return;
    }

    references.forEach(ref => {
      const li = document.createElement('li');
      // Store the unique reference ID from the content script
      li.dataset.refId = ref.id; // Use the ID received from background
      li.title = "Click to scroll to reference"; // Add tooltip

      let content = '';
      if (ref.number) {
        content += `<span class="ref-number">${ref.number}.</span> `;
      }
      // Escape and add the text - Make the text part of the clickable item
      content += `<span class="ref-text">${escapeHtml(ref.text)}</span>`;

      li.innerHTML = content; // Set the content
      referencesList.appendChild(li);
    });
  }

  // --- Add Click Listener for Scrolling ---
  referencesList.addEventListener('click', (event) => {
    const clickedLi = event.target.closest('li[data-ref-id]'); // Find the parent LI with the ID
    if (clickedLi) {
      const refId = clickedLi.dataset.refId;
      console.log(`[MDPI Filter Popup] Clicked reference LI, requesting scroll to ID: ${refId}`);
      // Send message to background script to trigger scroll in content script
      chrome.runtime.sendMessage({ type: 'scrollToRef', refId: refId }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("[MDPI Filter Popup] Error sending scrollToRef:", chrome.runtime.lastError.message);
            // Optionally show feedback to user in the popup
        } else {
            console.log("[MDPI Filter Popup] scrollToRef response:", response);
            // Optionally close popup after click, or show status
            // window.close(); // Uncomment to close popup on click
        }
      });
    }
  });
  // --- End Click Listener ---

  // Helper to escape HTML
  function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }

  // Request references from background script when popup opens
  chrome.runtime.sendMessage({ type: 'getMdpiReferences' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error getting references:", chrome.runtime.lastError.message);
      referencesPlaceholder.textContent = 'Error loading references.';
      referencesPlaceholder.classList.add('error');
    } else if (response && response.references) {
      displayReferences(response.references);
    } else {
       referencesPlaceholder.textContent = 'Could not load references.';
       referencesPlaceholder.classList.add('error');
    }
  });

});

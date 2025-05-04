// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const radios = document.querySelectorAll('input[name="mode"]');
  const saveBtn = document.getElementById('save');
  const status  = document.getElementById('status');

  // Load current setting
  chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
    radios.forEach(r => r.checked = (r.value === mode));
  });

  // Save new setting
  saveBtn.addEventListener('click', () => {
    const selected = Array.from(radios).find(r => r.checked).value;
    chrome.storage.sync.set({ mode: selected }, () => {
      status.textContent = `Mode set to "${selected}"`;
      setTimeout(() => status.textContent = '', 2000);
    });
  });
});

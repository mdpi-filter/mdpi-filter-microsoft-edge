// content/utils.js
// A simple debounce helper for MutationObserver callbacks
window.debounce = (fn, ms = 200) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

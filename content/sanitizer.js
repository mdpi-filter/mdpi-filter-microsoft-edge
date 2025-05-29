// content/sanitizer.js
// window.sanitize = html => html.replace(/<[^>]+>/g, ''); // Original version

/**
 * Basic HTML tag stripper.
 * NOTE: For robust XSS protection when setting innerHTML, using a dedicated library
 * like DOMPurify is strongly recommended, or preferably, avoid setting innerHTML
 * with dynamic content by using `textContent` and `document.createElement`.
 * This function is a naive approach and may not cover all XSS vectors.
 */
window.sanitize = (htmlInput) => {
  if (typeof htmlInput !== 'string') {
    return ''; // Ensure a string is always returned
  }
  // You can pass configuration as 2nd arg if needed.
  return DOMPurify.sanitize(htmlInput);
};

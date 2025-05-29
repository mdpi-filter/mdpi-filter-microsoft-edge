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
  const SCRIPT_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
  // Remove script tags
  let sanitized = htmlInput.replace(SCRIPT_REGEX, "");

  // Remove other tags (basic version)
  // This regex is very basic and can be bypassed.
  // For example, it doesn't handle attributes that can execute script (e.g., onerror, onload).
  sanitized = sanitized.replace(/<[^>]+>/g, "");

  // It's often better to escape HTML entities if the goal is to display potentially unsafe HTML as text
  // For example:
  // sanitized = sanitized.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  // However, the original intent seems to be stripping tags, not escaping them.

  return sanitized; // Ensure the sanitized string is returned
};

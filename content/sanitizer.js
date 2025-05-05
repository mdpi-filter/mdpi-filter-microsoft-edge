// content/sanitizer.js
window.sanitize = html => html.replace(/<[^>]+>/g, '');

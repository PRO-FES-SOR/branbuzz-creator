// Utility functions

/**
 * S4: Escape HTML special characters to prevent XSS
 * Use this on all user-controlled strings before inserting into innerHTML
 */
export function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape a URL for use in href/src attributes
 * Returns empty string for javascript: or data: URIs
 */
export function escUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (/^(javascript|data):/i.test(trimmed)) return '';
  return escHtml(trimmed);
}

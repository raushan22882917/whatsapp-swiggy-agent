'use strict';

/**
 * Response formatting utilities for AutoBot360.
 * Ensures all outbound WhatsApp messages are safe, concise, and well-structured.
 */

/**
 * Renders a numbered list from up to 3 items.
 * @template T
 * @param {T[]} items - Array of items (max 3 will be used)
 * @param {(item: T, index: number) => string} formatFn - Formats a single item
 * @returns {string}
 */
function formatOptionSet(items, formatFn) {
  const limited = items.slice(0, 3);
  return limited
    .map((item, i) => `${i + 1}. ${formatFn(item, i)}`)
    .join('\n');
}

/**
 * Truncates a response to at most `max` newline-delimited lines.
 * @param {string} text
 * @param {number} [max=4]
 * @returns {string}
 */
function enforceLineLimit(text, max = 4) {
  if (!text) return '';
  const lines = text.split('\n');
  if (lines.length <= max) return text;
  return lines.slice(0, max).join('\n');
}

/**
 * Sanitises a string before sending to the user.
 * Removes JSON notation, stack trace patterns, and raw HTTP status codes.
 * @param {string} text
 * @returns {string}
 */
function sanitiseForUser(text) {
  if (!text) return '';
  return text
    // Remove JSON object/array notation
    .replace(/[{}[\]]/g, '')
    // Remove stack trace patterns like "at Object.<anonymous>"
    .replace(/\bat\s+\S+/g, '')
    // Remove "Error:" prefix
    .replace(/\bError:\s*/g, '')
    // Remove raw HTTP status codes like "500", "404", "503" when standalone
    .replace(/\b[45]\d{2}\b/g, '')
    // Collapse multiple spaces/newlines left by removals
    .replace(/\n{3,}/g, '\n\n')
    .replace(/  +/g, ' ')
    .trim();
}

module.exports = { formatOptionSet, enforceLineLimit, sanitiseForUser };

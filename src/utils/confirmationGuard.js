'use strict';

/**
 * Confirmation guard for AutoBot360.
 * Only explicit affirmative tokens trigger order/booking placement.
 */

const CONFIRMATION_TOKENS = new Set(['yes', 'haan', 'confirm', 'ok', '1']);

/**
 * Returns true iff the input is a valid confirmation token.
 * Matching is case-insensitive and whitespace-trimmed.
 * @param {string} input
 * @returns {boolean}
 */
function isConfirmation(input) {
  if (!input || typeof input !== 'string') return false;
  return CONFIRMATION_TOKENS.has(input.toLowerCase().trim());
}

module.exports = { isConfirmation, CONFIRMATION_TOKENS };

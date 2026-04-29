'use strict';

// Feature: autobot360-whatsapp-ai, Property 9: Confirmation guard — only valid tokens trigger placement

const fc = require('fast-check');
const { isConfirmation, CONFIRMATION_TOKENS } = require('../../src/utils/confirmationGuard');

test('Property 9: only valid confirmation tokens return true', () => {
  fc.assert(
    fc.property(fc.string(), (input) => {
      const normalized = (input || '').toLowerCase().trim();
      const expected = CONFIRMATION_TOKENS.has(normalized);
      return isConfirmation(input) === expected;
    }),
    { numRuns: 100 }
  );
});

test('Property 9b: isConfirmation is stable (same input always same result)', () => {
  fc.assert(
    fc.property(fc.string(), (input) => {
      return isConfirmation(input) === isConfirmation(input);
    }),
    { numRuns: 100 }
  );
});

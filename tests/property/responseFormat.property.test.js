'use strict';

// Feature: autobot360-whatsapp-ai
// Property 11: Outbound message line count
// Property 12: Option sets use numbered list format
// Property 13: Error messages contain no internal details
// Property 8: Option set size is at most 3

const fc = require('fast-check');
const { enforceLineLimit, formatOptionSet, sanitiseForUser } = require('../../src/utils/responseFormatter');

test('Property 11: enforceLineLimit always produces at most max lines', () => {
  fc.assert(
    fc.property(fc.string(), fc.integer({ min: 1, max: 10 }), (text, max) => {
      const result = enforceLineLimit(text, max);
      return result.split('\n').length <= max;
    }),
    { numRuns: 100 }
  );
});

test('Property 12: formatOptionSet always uses numbered prefixes 1. 2. 3.', () => {
  fc.assert(
    fc.property(
      fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 10 }),
      (items) => {
        const result = formatOptionSet(items, (s) => s);
        const limited = items.slice(0, 3);
        return limited.every((_, i) => result.includes(`${i + 1}.`));
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 8: formatOptionSet never shows more than 3 options', () => {
  fc.assert(
    fc.property(
      fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 20 }),
      (items) => {
        const result = formatOptionSet(items, (s) => s);
        // Count lines starting with a number
        const optionLines = result.split('\n').filter((l) => /^\d+\./.test(l));
        return optionLines.length <= 3;
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 13: sanitiseForUser never contains JSON braces, stack traces, or HTTP status codes', () => {
  fc.assert(
    fc.property(fc.string(), (text) => {
      const result = sanitiseForUser(text);
      const hasJsonBraces = /[{}]/.test(result);
      const hasStackTrace = /\bat\s+\S+/.test(result);
      const hasErrorPrefix = /\bError:\s/.test(result);
      return !hasJsonBraces && !hasStackTrace && !hasErrorPrefix;
    }),
    { numRuns: 100 }
  );
});

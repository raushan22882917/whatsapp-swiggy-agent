'use strict';

const { isConfirmation } = require('../../src/utils/confirmationGuard');

test.each(['yes', 'YES', 'Yes', ' yes ', 'haan', 'HAAN', 'confirm', 'CONFIRM', 'ok', 'OK', '1'])(
  'isConfirmation returns true for valid token: %s',
  (token) => expect(isConfirmation(token)).toBe(true)
);

test.each(['no', 'nahi', 'cancel', 'nope', '2', '3', '', 'maybe', 'sure', 'yep'])(
  'isConfirmation returns false for invalid token: %s',
  (token) => expect(isConfirmation(token)).toBe(false)
);

test('isConfirmation returns false for null/undefined', () => {
  expect(isConfirmation(null)).toBe(false);
  expect(isConfirmation(undefined)).toBe(false);
});

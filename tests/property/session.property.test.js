'use strict';

// Feature: autobot360-whatsapp-ai
// Property 2: Session isolation
// Property 3: Session update round-trip

const fc = require('fast-check');
const sm = require('../../src/sessionManager');

beforeEach(() => sm.clearAll());

test('Property 2: sessions for distinct phone numbers are isolated', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 5, maxLength: 15 }),
      fc.string({ minLength: 5, maxLength: 15 }),
      fc.string({ minLength: 1 }),
      (phone1, phone2, intent) => {
        fc.pre(phone1 !== phone2);
        sm.clearAll();
        sm.getOrCreate(phone1);
        sm.getOrCreate(phone2);
        sm.update(phone1, { intent });
        // phone2's session must be unaffected
        return sm.get(phone2).intent === null;
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 3: update then get reflects all updated fields', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 5, maxLength: 15 }),
      fc.constantFrom('FOOD_ORDER', 'GROCERY_ORDER', 'DINEOUT_BOOKING', 'GENERAL_QUERY', null),
      fc.constantFrom('idle', 'collecting_budget', 'confirming', 'ordered'),
      (phone, intent, step) => {
        sm.clearAll();
        sm.getOrCreate(phone);
        sm.update(phone, { intent, step });
        const session = sm.get(phone);
        return session.intent === intent && session.step === step;
      }
    ),
    { numRuns: 100 }
  );
});

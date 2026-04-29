'use strict';

const sm = require('../../src/sessionManager');

beforeEach(() => sm.clearAll());

test('getOrCreate creates a new session with correct initial shape', () => {
  const session = sm.getOrCreate('+919876543210');
  expect(session.phoneNumber).toBe('+919876543210');
  expect(session.intent).toBeNull();
  expect(session.step).toBe('idle');
  expect(session.history).toEqual([]);
  expect(session.foodOrder).toBeNull();
  expect(session.groceryOrder).toBeNull();
  expect(session.dineoutBooking).toBeNull();
  expect(session.hasActiveOrder).toBe(false);
  expect(typeof session.createdAt).toBe('number');
  expect(typeof session.updatedAt).toBe('number');
});

test('getOrCreate returns the same session on subsequent calls', () => {
  const s1 = sm.getOrCreate('+91111');
  const s2 = sm.getOrCreate('+91111');
  expect(s1).toBe(s2);
});

test('update merges fields without overwriting unrelated ones', () => {
  sm.getOrCreate('+91222');
  sm.update('+91222', { intent: 'FOOD_ORDER', step: 'collecting_budget' });
  const session = sm.get('+91222');
  expect(session.intent).toBe('FOOD_ORDER');
  expect(session.step).toBe('collecting_budget');
  expect(session.history).toEqual([]); // untouched
});

test('update sets updatedAt to a newer timestamp', () => {
  sm.getOrCreate('+91333');
  const before = sm.get('+91333').updatedAt;
  sm.update('+91333', { step: 'confirming' });
  const after = sm.get('+91333').updatedAt;
  expect(after).toBeGreaterThanOrEqual(before);
});

test('clear removes the session', () => {
  sm.getOrCreate('+91444');
  sm.clear('+91444');
  expect(sm.get('+91444')).toBeUndefined();
});

test('sessions for different phone numbers are independent', () => {
  sm.getOrCreate('+91AAA');
  sm.getOrCreate('+91BBB');
  sm.update('+91AAA', { intent: 'FOOD_ORDER' });
  expect(sm.get('+91BBB').intent).toBeNull();
});

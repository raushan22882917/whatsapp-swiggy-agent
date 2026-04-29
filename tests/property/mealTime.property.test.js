'use strict';

// Feature: autobot360-whatsapp-ai, Property 14: Meal-time suggestion is appended when appropriate

const fc = require('fast-check');
const { getCurrentMealTime, getMealTimeSuggestion, MEAL_WINDOWS } = require('../../src/utils/mealTime');

test('Property 14a: getCurrentMealTime returns a valid meal time or null for any hour', () => {
  const validMealTimes = new Set(['breakfast', 'lunch', 'snacks', 'dinner', null]);
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 23 }), (hour) => {
      const result = getCurrentMealTime(hour);
      return validMealTimes.has(result);
    }),
    { numRuns: 100 }
  );
});

test('Property 14b: getMealTimeSuggestion returns a non-empty string for every valid meal time', () => {
  const mealTimes = ['breakfast', 'lunch', 'snacks', 'dinner'];
  fc.assert(
    fc.property(fc.constantFrom(...mealTimes), (mt) => {
      const suggestion = getMealTimeSuggestion(mt);
      return typeof suggestion === 'string' && suggestion.length > 0;
    }),
    { numRuns: 100 }
  );
});

test('Property 14c: meal time windows are non-overlapping', () => {
  // For every hour 0-23, at most one window matches
  for (let hour = 0; hour < 24; hour++) {
    const matches = MEAL_WINDOWS.filter((w) => hour >= w.start && hour < w.end);
    expect(matches.length).toBeLessThanOrEqual(1);
  }
});

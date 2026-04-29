'use strict';

const { getCurrentMealTime, getMealTimeSuggestion } = require('../../src/utils/mealTime');

describe('getCurrentMealTime with hour override', () => {
  test.each([
    [5, null],
    [6, 'breakfast'],
    [9, 'breakfast'],
    [10, null],   // 10:00 is outside breakfast (end is exclusive)
    [11, 'lunch'],
    [13, 'lunch'],
    [14, null],
    [15, 'snacks'],
    [16, 'snacks'],
    [17, null],
    [18, 'dinner'],
    [21, 'dinner'],
    [22, null],
    [23, null],
  ])('hour %i → %s', (hour, expected) => {
    expect(getCurrentMealTime(hour)).toBe(expected);
  });
});

describe('getMealTimeSuggestion', () => {
  test('returns non-empty string for each meal time', () => {
    ['breakfast', 'lunch', 'snacks', 'dinner'].forEach((mt) => {
      const suggestion = getMealTimeSuggestion(mt);
      expect(typeof suggestion).toBe('string');
      expect(suggestion.length).toBeGreaterThan(0);
    });
  });

  test('returns empty string for unknown meal time', () => {
    expect(getMealTimeSuggestion('brunch')).toBe('');
  });
});

'use strict';

/**
 * Meal-time detection utility for AutoBot360.
 * All times are in IST (UTC+5:30).
 *
 * Windows:
 *   Breakfast : 06:00 – 09:59
 *   Lunch     : 11:00 – 13:59
 *   Snacks    : 15:00 – 16:59
 *   Dinner    : 18:00 – 21:59
 */

/** @typedef {'breakfast'|'lunch'|'snacks'|'dinner'} MealTime */

const MEAL_WINDOWS = [
  { name: 'breakfast', start: 6, end: 10 },
  { name: 'lunch', start: 11, end: 14 },
  { name: 'snacks', start: 15, end: 17 },
  { name: 'dinner', start: 18, end: 22 },
];

const SUGGESTIONS = {
  breakfast: '🌅 Breakfast time hai! Idli, poha ya paratha order karein?',
  lunch: '🍛 Lunch time ho gaya — kya order karu aapke liye?',
  snacks: '☕ Snack time! Samosa, chai ya kuch aur mangwau?',
  dinner: '🌙 Dinner time hai! Biryani, dal-roti ya kuch special order karein?',
};

/**
 * Returns the current IST hour (0–23).
 * Exported separately so tests can override it.
 * @returns {number}
 */
function getISTHour() {
  const now = new Date();
  // IST = UTC + 5:30 = UTC + 330 minutes
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const istMs = utcMs + 330 * 60000;
  return new Date(istMs).getHours();
}

/**
 * Returns the current meal time window, or null if outside all windows.
 * @param {number} [hourOverride] - Optional IST hour for testing
 * @returns {MealTime|null}
 */
function getCurrentMealTime(hourOverride) {
  const hour = hourOverride !== undefined ? hourOverride : getISTHour();
  for (const window of MEAL_WINDOWS) {
    if (hour >= window.start && hour < window.end) {
      return window.name;
    }
  }
  return null;
}

/**
 * Returns a Hinglish meal-time suggestion for the given meal time.
 * @param {MealTime} mealTime
 * @returns {string}
 */
function getMealTimeSuggestion(mealTime) {
  return SUGGESTIONS[mealTime] || '';
}

module.exports = { getCurrentMealTime, getMealTimeSuggestion, getISTHour, MEAL_WINDOWS };

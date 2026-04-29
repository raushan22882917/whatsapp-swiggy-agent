'use strict';

/**
 * In-memory session store for AutoBot360.
 * Keyed by user phone number (WhatsApp `From` field).
 *
 * @typedef {'idle'
 *   | 'collecting_preference' | 'collecting_budget'
 *   | 'showing_options' | 'showing_menu'
 *   | 'extracting_items' | 'showing_products' | 'building_cart'
 *   | 'collecting_location' | 'collecting_booking_details'
 *   | 'confirming' | 'ordered' | 'booked'} FlowStep
 *
 * @typedef {'FOOD_ORDER'|'GROCERY_ORDER'|'DINEOUT_BOOKING'|'GENERAL_QUERY'|null} Intent
 *
 * @typedef {Object} Session
 * @property {string} phoneNumber
 * @property {Intent} intent
 * @property {FlowStep} step
 * @property {string[]} history
 * @property {object|null} foodOrder
 * @property {object|null} groceryOrder
 * @property {object|null} dineoutBooking
 * @property {boolean} hasActiveOrder
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/** @type {Map<string, Session>} */
const store = new Map();

/**
 * Creates a fresh session object.
 * @param {string} phoneNumber
 * @returns {Session}
 */
function createSession(phoneNumber) {
  const now = Date.now();
  return {
    phoneNumber,
    intent: null,
    step: 'idle',
    history: [],
    foodOrder: null,
    groceryOrder: null,
    dineoutBooking: null,
    hasActiveOrder: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Returns the existing session for a phone number, or creates a new one.
 * @param {string} phoneNumber
 * @returns {Session}
 */
function getOrCreate(phoneNumber) {
  if (!store.has(phoneNumber)) {
    store.set(phoneNumber, createSession(phoneNumber));
  }
  return store.get(phoneNumber);
}

/**
 * Returns the session for a phone number, or undefined if none exists.
 * @param {string} phoneNumber
 * @returns {Session|undefined}
 */
function get(phoneNumber) {
  return store.get(phoneNumber);
}

/**
 * Shallow-merges partialSession into the existing session and updates `updatedAt`.
 * @param {string} phoneNumber
 * @param {Partial<Session>} partialSession
 */
function update(phoneNumber, partialSession) {
  const existing = getOrCreate(phoneNumber);
  const updated = { ...existing, ...partialSession, updatedAt: Date.now() };
  store.set(phoneNumber, updated);
}

/**
 * Removes the session for a phone number.
 * @param {string} phoneNumber
 */
function clear(phoneNumber) {
  store.delete(phoneNumber);
}

/**
 * Returns the number of active sessions (for testing/monitoring).
 * @returns {number}
 */
function size() {
  return store.size;
}

/**
 * Clears all sessions (for testing only).
 */
function clearAll() {
  store.clear();
}

module.exports = { getOrCreate, get, update, clear, size, clearAll };

'use strict';

/**
 * Swiggy Dineout MCP client.
 *
 * Tool names from the Swiggy MCP manifest:
 *   search_restaurants, get_restaurant_details,
 *   get_available_slots, book_table
 */

const { callTool } = require('./mcpClient');

const SERVER = 'dineout';

/**
 * @typedef {Object} Venue
 * @property {string} id
 * @property {string} name
 * @property {string} cuisine
 * @property {number} avgCostPerPerson - in INR
 * @property {number} rating
 * @property {string|null} activeDeal
 */

/**
 * @typedef {Object} BookingResult
 * @property {string} bookingId
 * @property {string} restaurantName
 * @property {string} date
 * @property {string} time
 * @property {number} guests
 */

/**
 * Searches for dine-out venues matching budget and location.
 * @param {number} budget - Budget per person in INR
 * @param {string} location - Area or neighbourhood
 * @returns {Promise<Venue[]>}
 */
async function searchVenues(budget, location) {
  const data = await callTool(SERVER, 'search_restaurants', { budget, location });
  const list = Array.isArray(data) ? data : (data.restaurants || data.venues || data.data || []);
  return list.slice(0, 10).map(normaliseVenue);
}

/**
 * Gets available booking slots for a venue.
 * @param {string} venueId
 * @param {string} date - e.g. "2026-05-01"
 * @param {number} guests
 * @returns {Promise<string[]>} Available time slots
 */
async function getAvailableSlots(venueId, date, guests) {
  const data = await callTool(SERVER, 'get_available_slots', { restaurantId: venueId, date, guests });
  return Array.isArray(data) ? data : (data.slots || data.availableSlots || []);
}

/**
 * Books a table at a venue (free bookings only).
 * @param {string} venueId
 * @param {string} date
 * @param {string} time
 * @param {number} guests
 * @returns {Promise<BookingResult>}
 */
async function bookTable(venueId, date, time, guests) {
  const data = await callTool(SERVER, 'book_table', {
    restaurantId: venueId,
    date,
    time,
    guests,
  });
  return {
    bookingId: data.bookingId || data.booking_id || data.id || 'N/A',
    restaurantName: data.restaurantName || data.name || 'Restaurant',
    date: data.date || date,
    time: data.time || time,
    guests: data.guests || guests,
  };
}

// ── Normalisers ───────────────────────────────────────────────────────────────

/** @param {any} v @returns {Venue} */
function normaliseVenue(v) {
  return {
    id: v.id || v.restaurantId || String(Math.random()),
    name: v.name || v.restaurantName || 'Unknown Venue',
    cuisine: v.cuisine || v.cuisineType || 'Mixed',
    avgCostPerPerson: Number(v.avgCostPerPerson || v.averageCost || (v.costForTwo ? v.costForTwo / 2 : 0)),
    rating: Number(v.rating || v.avgRating || 0),
    activeDeal: v.activeDeal || v.offer || v.deal || null,
  };
}

module.exports = { searchVenues, getAvailableSlots, bookTable };

'use strict';

/**
 * Swiggy Food MCP client.
 * All calls go through the official MCP SDK via callTool().
 *
 * Tool names are from the Swiggy MCP manifest:
 *   get_addresses, search_restaurants, get_restaurant_menu,
 *   add_item_to_cart, get_cart, place_order, get_order_status
 */

const { callTool, McpError } = require('./mcpClient');

const SERVER = 'food';

/**
 * @typedef {Object} Restaurant
 * @property {string} id
 * @property {string} name
 * @property {string} cuisine
 * @property {string} eta        - e.g. "30-40 mins"
 * @property {number} startingPrice - in INR
 */

/**
 * @typedef {Object} MenuItem
 * @property {string} id
 * @property {string} name
 * @property {number} price
 */

/**
 * @typedef {Object} OrderResult
 * @property {string} orderId
 * @property {string} eta
 */

/**
 * Fetches the user's saved delivery addresses.
 * @returns {Promise<Array>}
 */
async function getAddresses() {
  const data = await callTool(SERVER, 'get_addresses', {});
  return Array.isArray(data) ? data : (data.addresses || data.data || []);
}

/**
 * Searches for restaurants matching the given preference and budget.
 * @param {string} preference - Cuisine or dish name
 * @param {number} budget - Budget in INR
 * @param {string} [addressId] - Delivery address ID from getAddresses()
 * @returns {Promise<Restaurant[]>}
 */
async function searchRestaurants(preference, budget, addressId) {
  const args = { query: preference, budget };
  if (addressId) args.addressId = addressId;

  const data = await callTool(SERVER, 'search_restaurants', args);
  const list = Array.isArray(data) ? data : (data.restaurants || data.data || []);
  return list.slice(0, 10).map(normaliseRestaurant);
}

/**
 * Fetches menu items for a restaurant.
 * @param {string} restaurantId
 * @returns {Promise<MenuItem[]>}
 */
async function getMenuItems(restaurantId) {
  const data = await callTool(SERVER, 'get_restaurant_menu', { restaurantId });
  const list = Array.isArray(data) ? data : (data.items || data.menu || data.categories?.[0]?.items || data.data || []);
  return list.slice(0, 20).map(normaliseMenuItem);
}

/**
 * Adds an item to the cart.
 * @param {string} restaurantId
 * @param {string} itemId
 * @param {number} [quantity=1]
 * @returns {Promise<any>}
 */
async function addToCart(restaurantId, itemId, quantity = 1) {
  return callTool(SERVER, 'add_item_to_cart', { restaurantId, itemId, quantity });
}

/**
 * Places the food order (COD only).
 * @param {string} addressId
 * @returns {Promise<OrderResult>}
 */
async function placeOrder(addressId) {
  const data = await callTool(SERVER, 'place_order', { addressId, paymentMethod: 'COD' });
  return {
    orderId: data.orderId || data.order_id || data.id || 'N/A',
    eta: data.eta || data.estimatedDeliveryTime || '30-45 mins',
  };
}

/**
 * Gets the current status of an order.
 * @param {string} orderId
 * @returns {Promise<any>}
 */
async function getOrderStatus(orderId) {
  return callTool(SERVER, 'get_order_status', { orderId });
}

// ── Normalisers ───────────────────────────────────────────────────────────────

/** @param {any} r @returns {Restaurant} */
function normaliseRestaurant(r) {
  return {
    id: r.id || r.restaurantId || String(Math.random()),
    name: r.name || r.restaurantName || 'Unknown',
    cuisine: r.cuisine || r.cuisineType || 'Mixed',
    eta: r.eta || r.deliveryTime || '30-40 mins',
    startingPrice: Number(r.startingPrice || r.minPrice || r.price || 0),
  };
}

/** @param {any} m @returns {MenuItem} */
function normaliseMenuItem(m) {
  return {
    id: m.id || m.itemId || String(Math.random()),
    name: m.name || m.itemName || 'Unknown Item',
    price: Number(m.price || m.cost || 0),
  };
}

module.exports = { getAddresses, searchRestaurants, getMenuItems, addToCart, placeOrder, getOrderStatus };

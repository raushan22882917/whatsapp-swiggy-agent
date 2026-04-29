'use strict';

/**
 * Swiggy Instamart MCP client.
 *
 * Tool names from the Swiggy MCP manifest:
 *   get_addresses, search_products, add_product_to_cart,
 *   get_cart, place_order
 */

const { callTool } = require('./mcpClient');

const SERVER = 'im';

/**
 * @typedef {Object} Product
 * @property {string} id
 * @property {string} name
 * @property {string} brand
 * @property {string} quantity  - e.g. "500g", "1L"
 * @property {number} price     - in INR
 */

/**
 * @typedef {Object} CartItem
 * @property {string} productId
 * @property {string} name
 * @property {string} brand
 * @property {string} quantity
 * @property {number} price
 */

/**
 * @typedef {Object} OrderResult
 * @property {string} orderId
 * @property {string} eta
 */

/**
 * Searches for products matching the given item name.
 * @param {string} itemName
 * @param {string} [addressId]
 * @returns {Promise<Product[]>}
 */
async function searchProducts(itemName, addressId) {
  const args = { query: itemName };
  if (addressId) args.addressId = addressId;

  const data = await callTool(SERVER, 'search_products', args);
  const list = Array.isArray(data) ? data : (data.products || data.data || []);
  return list.slice(0, 10).map(normaliseProduct);
}

/**
 * Adds a product to the Instamart cart.
 * @param {string} productId
 * @param {number} [quantity=1]
 * @returns {Promise<any>}
 */
async function addProductToCart(productId, quantity = 1) {
  return callTool(SERVER, 'add_product_to_cart', { productId, quantity });
}

/**
 * Places the grocery order (COD only).
 * @param {string} addressId
 * @returns {Promise<OrderResult>}
 */
async function placeGroceryOrder(addressId) {
  const data = await callTool(SERVER, 'place_order', { addressId, paymentMethod: 'COD' });
  return {
    orderId: data.orderId || data.order_id || data.id || 'N/A',
    eta: data.eta || data.estimatedDeliveryTime || '10-20 mins',
  };
}

// ── Normalisers ───────────────────────────────────────────────────────────────

/** @param {any} p @returns {Product} */
function normaliseProduct(p) {
  return {
    id: p.id || p.productId || String(Math.random()),
    name: p.name || p.productName || 'Unknown Product',
    brand: p.brand || p.brandName || 'Generic',
    quantity: p.quantity || p.weight || p.size || '',
    price: Number(p.price || p.mrp || p.cost || 0),
  };
}

module.exports = { searchProducts, addProductToCart, placeGroceryOrder };

'use strict';

/**
 * Food Order flow handler for AutoBot360.
 *
 * State machine:
 *   idle → collecting_preference → collecting_budget
 *   → showing_options → showing_menu → confirming → ordered
 */

const { searchRestaurants, getMenuItems, addToCart, placeOrder, getAddresses } = require('../mcp/swiggyFood');
const { McpError } = require('../mcp/mcpClient');
const { isConfirmation } = require('../utils/confirmationGuard');
const { formatOptionSet, enforceLineLimit } = require('../utils/responseFormatter');
const sessionManager = require('../sessionManager');
const logger = require('../utils/logger');

/**
 * Handles a FOOD_ORDER intent message.
 * Reads and updates session state, returns a Hinglish response string.
 *
 * @param {string} userMessage
 * @param {import('../sessionManager').Session} session
 * @returns {Promise<string>}
 */
async function handleFoodOrder(userMessage, session) {
  // Initialise food order state if needed
  if (!session.foodOrder) {
    sessionManager.update(session.phoneNumber, {
      foodOrder: {
        preference: null,
        budget: null,
        options: null,
        selected: null,
        menuItems: null,
        selectedItem: null,
        orderId: null,
        eta: null,
        addressId: null,
        placementLock: false,
        trackingTimer: null,
      },
      step: 'collecting_preference',
      hasActiveOrder: true,
    });
    session = sessionManager.get(session.phoneNumber);
    return enforceLineLimit(
      '🍛 Kya khana chahoge? Cuisine ya dish batao (e.g. biryani, pizza, dosa)\n' +
      'Ya choose karo:\n1. Budget meal\n2. Healthy\n3. Fast food'
    );
  }

  const fo = session.foodOrder;
  const step = session.step;

  // ── collecting_preference ──────────────────────────────────────────────────
  if (step === 'collecting_preference' || step === 'idle') {
    const preference = extractPreference(userMessage);
    sessionManager.update(session.phoneNumber, {
      foodOrder: { ...fo, preference },
      step: 'collecting_budget',
    });
    return enforceLineLimit(`${preference} — great choice! 👍\nAapka budget kitna hai? (INR mein, e.g. 150, 300, 500)`);
  }

  // ── collecting_budget ──────────────────────────────────────────────────────
  if (step === 'collecting_budget') {
    const budget = extractNumber(userMessage);
    if (!budget) {
      return 'Budget samajh nahi aaya 😅 Please number mein batao (e.g. 200)';
    }
    sessionManager.update(session.phoneNumber, {
      foodOrder: { ...fo, budget },
      step: 'showing_options',
    });
    session = sessionManager.get(session.phoneNumber);

    return await fetchAndShowRestaurants(session);
  }

  // ── showing_options — user picks a restaurant ──────────────────────────────
  if (step === 'showing_options') {
    const options = fo.options || [];
    const selected = pickFromOptions(userMessage, options);
    if (!selected) {
      return `1, 2, ya 3 mein se choose karo 😊\n${formatRestaurantOptions(options)}`;
    }
    sessionManager.update(session.phoneNumber, {
      foodOrder: { ...fo, selected },
      step: 'showing_menu',
    });
    session = sessionManager.get(session.phoneNumber);

    return await fetchAndShowMenu(session);
  }

  // ── showing_menu — user picks a menu item ─────────────────────────────────
  if (step === 'showing_menu') {
    const menuItems = fo.menuItems || [];
    const selectedItem = pickFromOptions(userMessage, menuItems);
    if (!selectedItem) {
      return `1, 2, ya 3 mein se choose karo 😊\n${formatMenuOptions(menuItems)}`;
    }
    sessionManager.update(session.phoneNumber, {
      foodOrder: { ...fo, selectedItem },
      step: 'confirming',
    });
    session = sessionManager.get(session.phoneNumber);
    const updatedFo = session.foodOrder;

    return enforceLineLimit(
      `📋 Order summary:\n` +
      `${updatedFo.selectedItem.name} — ₹${updatedFo.selectedItem.price}\n` +
      `From: ${updatedFo.selected.name} | ETA: ${updatedFo.selected.eta}\n` +
      `Order kar du? (yes/haan/confirm)`
    );
  }

  // ── confirming ─────────────────────────────────────────────────────────────
  if (step === 'confirming') {
    if (isConfirmation(userMessage)) {
      return await placeOrderAndConfirm(session);
    } else {
      // Cancel
      sessionManager.update(session.phoneNumber, {
        foodOrder: null,
        step: 'idle',
        hasActiveOrder: false,
      });
      return 'Order cancel kar diya ✅\nKuch aur order karna hai? Bas batao!';
    }
  }

  // ── ordered — tracking ─────────────────────────────────────────────────────
  if (step === 'ordered') {
    return `Aapka order already placed hai! 🛵\nOrder ID: ${fo.orderId} | ETA: ${fo.eta}`;
  }

  // Fallback
  return 'Kuch samajh nahi aaya 😅 "reset" type karo aur dobara try karo.';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchAndShowRestaurants(session) {
  const fo = session.foodOrder;
  try {
    const results = await searchRestaurants(fo.preference, fo.budget);
    if (!results || results.length === 0) {
      sessionManager.update(session.phoneNumber, { foodOrder: null, step: 'idle', hasActiveOrder: false });
      return 'Koi restaurant nahi mila 😔 Budget ya preference change karke try karo.';
    }
    const options = results.slice(0, 3);
    sessionManager.update(session.phoneNumber, {
      foodOrder: { ...fo, options },
      step: 'showing_options',
    });
    return enforceLineLimit(`Yeh restaurants mile 🍽️\n${formatRestaurantOptions(options)}\nKaunsa choose karoge? (1/2/3)`);
  } catch (err) {
    if (err instanceof McpError) {
      logger.error('Food MCP error in searchRestaurants', { error: err.message });
      return 'Swiggy se connect nahi ho pa raha 😔 Thodi der mein retry karo.';
    }
    throw err;
  }
}

async function fetchAndShowMenu(session) {
  const fo = session.foodOrder;
  try {
    const items = await getMenuItems(fo.selected.id);
    if (!items || items.length === 0) {
      sessionManager.update(session.phoneNumber, { foodOrder: { ...fo, selected: null }, step: 'showing_options' });
      return 'Menu load nahi hua 😔 Koi aur restaurant choose karo.';
    }
    const menuItems = items.slice(0, 3);
    sessionManager.update(session.phoneNumber, {
      foodOrder: { ...fo, menuItems },
      step: 'showing_menu',
    });
    return enforceLineLimit(`${fo.selected.name} ka menu 🍴\n${formatMenuOptions(menuItems)}\nKya order karna hai? (1/2/3)`);
  } catch (err) {
    if (err instanceof McpError) {
      return 'Menu load nahi hua 😔 Thodi der mein retry karo.';
    }
    throw err;
  }
}

async function placeOrderAndConfirm(session) {
  const fo = session.foodOrder;

  // Idempotency guard
  if (fo.placementLock) {
    logger.warn('Food order placement attempted while lock is set', { phone: logger.maskPhone(session.phoneNumber) });
    return `Order already place ho raha hai ⏳ Order ID: ${fo.orderId || 'processing...'}`;
  }

  sessionManager.update(session.phoneNumber, {
    foodOrder: { ...fo, placementLock: true },
  });

  try {
    // Add item to cart first
    await addToCart(fo.selected.id, fo.selectedItem.id, 1);

    // Get address (use first saved address)
    let addressId = fo.addressId;
    if (!addressId) {
      const addresses = await getAddresses();
      addressId = addresses?.[0]?.id || addresses?.[0]?.addressId || null;
      sessionManager.update(session.phoneNumber, {
        foodOrder: { ...sessionManager.get(session.phoneNumber).foodOrder, addressId },
      });
    }

    const result = await placeOrder(addressId);

    sessionManager.update(session.phoneNumber, {
      foodOrder: {
        ...sessionManager.get(session.phoneNumber).foodOrder,
        orderId: result.orderId,
        eta: result.eta,
        placementLock: false,
      },
      step: 'ordered',
    });

    // Schedule tracking messages every 10 minutes
    scheduleTracking(session.phoneNumber, result.orderId);

    return enforceLineLimit(
      `✅ Order placed!\nOrder ID: ${result.orderId}\nETA: ${result.eta}\nTrack karte rahenge 🛵`
    );
  } catch (err) {
    // Release lock on error so user can retry
    sessionManager.update(session.phoneNumber, {
      foodOrder: { ...sessionManager.get(session.phoneNumber).foodOrder, placementLock: false },
    });
    if (err instanceof McpError) {
      return 'Order place nahi hua 😔 Aapka order details save hai — "confirm" type karke retry karo.';
    }
    throw err;
  }
}

/**
 * Schedules tracking messages every 10 minutes.
 * The sender is injected at runtime to avoid circular deps.
 */
function scheduleTracking(phoneNumber, orderId) {
  // Lazy require to avoid circular dependency with webhook
  const sender = require('../twilio/sender');
  const { getOrderStatus } = require('../mcp/swiggyFood');

  const timer = setInterval(async () => {
    const session = sessionManager.get(phoneNumber);
    if (!session || session.step !== 'ordered') {
      clearInterval(timer);
      return;
    }
    try {
      const status = await getOrderStatus(orderId);
      const statusText = status?.status || status?.orderStatus || 'In transit';
      await sender.sendMessage(phoneNumber, `🛵 Order update: ${statusText}\nOrder ID: ${orderId}`);
      if (statusText.toLowerCase().includes('delivered')) {
        clearInterval(timer);
        sessionManager.update(phoneNumber, { step: 'idle', hasActiveOrder: false });
      }
    } catch {
      // Silently ignore tracking errors
    }
  }, 10 * 60 * 1000); // 10 minutes

  // Store timer reference for cleanup on reset
  const session = sessionManager.get(phoneNumber);
  if (session?.foodOrder) {
    sessionManager.update(phoneNumber, {
      foodOrder: { ...session.foodOrder, trackingTimer: timer },
    });
  }
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatRestaurantOptions(options) {
  return formatOptionSet(options, (r) => `${r.name} (${r.cuisine}) — ₹${r.startingPrice}+ | ${r.eta}`);
}

function formatMenuOptions(items) {
  return formatOptionSet(items, (m) => `${m.name} — ₹${m.price}`);
}

// ── Extractors ────────────────────────────────────────────────────────────────

function extractPreference(msg) {
  const lower = msg.toLowerCase().trim();
  if (lower === '1' || lower.includes('budget')) return 'budget meal';
  if (lower === '2' || lower.includes('health')) return 'healthy food';
  if (lower === '3' || lower.includes('fast')) return 'fast food';
  return msg.trim() || 'any';
}

function extractNumber(msg) {
  const match = msg.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function pickFromOptions(msg, options) {
  const lower = msg.toLowerCase().trim();
  // Try numeric selection
  const num = parseInt(lower, 10);
  if (!isNaN(num) && num >= 1 && num <= options.length) {
    return options[num - 1];
  }
  // Try name match
  return options.find((o) => {
    const name = (o.name || '').toLowerCase();
    return name.includes(lower) || lower.includes(name.split(' ')[0]);
  }) || null;
}

module.exports = { handleFoodOrder };

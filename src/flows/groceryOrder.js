'use strict';

/**
 * Grocery Order flow handler for AutoBot360.
 *
 * State machine:
 *   idle → extracting_items → showing_products → building_cart → confirming → ordered
 */

const Groq = require('groq-sdk');
const { searchProducts, addProductToCart, placeGroceryOrder } = require('../mcp/swiggyInstamart');
const { McpError } = require('../mcp/mcpClient');
const { isConfirmation } = require('../utils/confirmationGuard');
const { formatOptionSet, enforceLineLimit } = require('../utils/responseFormatter');
const sessionManager = require('../sessionManager');
const logger = require('../utils/logger');
const { getAddresses } = require('../mcp/swiggyFood'); // reuse address fetch

let groqClient = null;
function getGroqClient() {
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

/**
 * Handles a GROCERY_ORDER intent message.
 * @param {string} userMessage
 * @param {import('../sessionManager').Session} session
 * @returns {Promise<string>}
 */
async function handleGroceryOrder(userMessage, session) {
  if (!session.groceryOrder) {
    // First touch — extract items from the message
    sessionManager.update(session.phoneNumber, {
      groceryOrder: {
        requestedItems: [],
        currentItemIndex: 0,
        currentOptions: [],
        cart: [],
        orderId: null,
        eta: null,
        addressId: null,
        placementLock: false,
      },
      step: 'extracting_items',
      hasActiveOrder: true,
    });
    session = sessionManager.get(session.phoneNumber);
    return await extractAndStartShopping(userMessage, session);
  }

  const go = session.groceryOrder;
  const step = session.step;

  // ── extracting_items ───────────────────────────────────────────────────────
  if (step === 'extracting_items') {
    return await extractAndStartShopping(userMessage, session);
  }

  // ── showing_products — user picks a product ────────────────────────────────
  if (step === 'showing_products') {
    const options = go.currentOptions || [];
    const selected = pickFromOptions(userMessage, options);
    if (!selected) {
      return `1, 2, ya 3 mein se choose karo 😊\n${formatProductOptions(options)}`;
    }

    const updatedCart = [...go.cart, {
      productId: selected.id,
      name: selected.name,
      brand: selected.brand,
      quantity: selected.quantity,
      price: selected.price,
    }];

    const nextIndex = go.currentItemIndex + 1;

    if (nextIndex < go.requestedItems.length) {
      // More items to shop
      sessionManager.update(session.phoneNumber, {
        groceryOrder: { ...go, cart: updatedCart, currentItemIndex: nextIndex, currentOptions: [] },
        step: 'showing_products',
      });
      session = sessionManager.get(session.phoneNumber);
      return await fetchNextProduct(session);
    } else {
      // All items selected — show cart summary
      sessionManager.update(session.phoneNumber, {
        groceryOrder: { ...go, cart: updatedCart, currentItemIndex: nextIndex },
        step: 'confirming',
      });
      session = sessionManager.get(session.phoneNumber);
      return buildCartSummary(session.groceryOrder.cart);
    }
  }

  // ── confirming ─────────────────────────────────────────────────────────────
  if (step === 'confirming') {
    if (isConfirmation(userMessage)) {
      return await placeGroceryOrderAndConfirm(session);
    } else {
      sessionManager.update(session.phoneNumber, {
        groceryOrder: null,
        step: 'idle',
        hasActiveOrder: false,
      });
      return 'Order cancel kar diya ✅\nKuch aur chahiye? Bas batao!';
    }
  }

  // ── ordered ────────────────────────────────────────────────────────────────
  if (step === 'ordered') {
    return `Aapka grocery order placed hai! 🛒\nOrder ID: ${go.orderId} | ETA: ${go.eta}`;
  }

  return 'Kuch samajh nahi aaya 😅 "reset" type karo aur dobara try karo.';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function extractAndStartShopping(userMessage, session) {
  const go = session.groceryOrder;

  // Use Groq to extract grocery items from the message
  let items = [];
  try {
    const groq = getGroqClient();
    const completion = await groq.chat.completions.create({
      model: 'llama3-70b-8192',
      messages: [
        {
          role: 'system',
          content: 'Extract grocery item names from the user message. Return a JSON array of strings only. Example: ["milk","bread","eggs"]. No explanation.',
        },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 100,
      temperature: 0,
    });
    const raw = completion.choices?.[0]?.message?.content?.trim() || '[]';
    items = JSON.parse(raw);
  } catch {
    // Fallback: split by comma/and
    items = userMessage
      .replace(/\band\b/gi, ',')
      .split(/[,،]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (!items.length) {
    return 'Kaunsi grocery chahiye? Please list karo (e.g. milk, bread, eggs)';
  }

  sessionManager.update(session.phoneNumber, {
    groceryOrder: { ...go, requestedItems: items, currentItemIndex: 0 },
    step: 'showing_products',
  });
  session = sessionManager.get(session.phoneNumber);
  return await fetchNextProduct(session);
}

async function fetchNextProduct(session) {
  const go = session.groceryOrder;
  const itemName = go.requestedItems[go.currentItemIndex];

  try {
    const results = await searchProducts(itemName);
    if (!results || results.length === 0) {
      // Skip this item and move on
      const nextIndex = go.currentItemIndex + 1;
      if (nextIndex < go.requestedItems.length) {
        sessionManager.update(session.phoneNumber, {
          groceryOrder: { ...go, currentItemIndex: nextIndex },
        });
        session = sessionManager.get(session.phoneNumber);
        return `"${itemName}" nahi mila 😔\n` + await fetchNextProduct(session);
      } else {
        return buildCartSummary(go.cart);
      }
    }

    const options = results.slice(0, 3);
    sessionManager.update(session.phoneNumber, {
      groceryOrder: { ...go, currentOptions: options },
    });

    return enforceLineLimit(
      `🛒 "${itemName}" ke options:\n${formatProductOptions(options)}\nKaunsa chahiye? (1/2/3)`
    );
  } catch (err) {
    if (err instanceof McpError) {
      return `"${itemName}" search nahi hua 😔 Thodi der mein retry karo.`;
    }
    throw err;
  }
}

async function placeGroceryOrderAndConfirm(session) {
  const go = session.groceryOrder;

  if (go.placementLock) {
    return `Order already place ho raha hai ⏳`;
  }

  sessionManager.update(session.phoneNumber, {
    groceryOrder: { ...go, placementLock: true },
  });

  try {
    // Add all cart items
    for (const item of go.cart) {
      await addProductToCart(item.productId, 1);
    }

    // Get address
    let addressId = go.addressId;
    if (!addressId) {
      const addresses = await getAddresses();
      addressId = addresses?.[0]?.id || addresses?.[0]?.addressId || null;
    }

    const result = await placeGroceryOrder(addressId);

    sessionManager.update(session.phoneNumber, {
      groceryOrder: {
        ...sessionManager.get(session.phoneNumber).groceryOrder,
        orderId: result.orderId,
        eta: result.eta,
        placementLock: false,
      },
      step: 'ordered',
    });

    return enforceLineLimit(
      `✅ Grocery order placed!\nOrder ID: ${result.orderId}\nETA: ${result.eta} 🛵`
    );
  } catch (err) {
    sessionManager.update(session.phoneNumber, {
      groceryOrder: { ...sessionManager.get(session.phoneNumber).groceryOrder, placementLock: false },
    });
    if (err instanceof McpError) {
      return 'Order place nahi hua 😔 Cart save hai — "confirm" type karke retry karo.';
    }
    throw err;
  }
}

function buildCartSummary(cart) {
  if (!cart.length) return 'Cart empty hai 😅';
  const lines = cart.map((item, i) => `${i + 1}. ${item.name} (${item.brand}) — ₹${item.price}`);
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  return enforceLineLimit(
    `🛒 Cart summary:\n${lines.join('\n')}\nTotal: ₹${total}\nOrder kar du? (yes/haan/confirm)`
  );
}

function formatProductOptions(options) {
  return formatOptionSet(options, (p) => `${p.name} ${p.quantity} (${p.brand}) — ₹${p.price}`);
}

function pickFromOptions(msg, options) {
  const lower = msg.toLowerCase().trim();
  const num = parseInt(lower, 10);
  if (!isNaN(num) && num >= 1 && num <= options.length) return options[num - 1];
  return options.find((o) => (o.name || '').toLowerCase().includes(lower)) || null;
}

module.exports = { handleGroceryOrder };

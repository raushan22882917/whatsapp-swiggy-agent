'use strict';

/**
 * Twilio WhatsApp webhook handler for AutoBot360.
 * Receives inbound messages, routes to flow handlers, sends responses.
 */

const express = require('express');
const sessionManager = require('./sessionManager');
const { classifyIntent } = require('./intentClassifier');
const { handleFoodOrder } = require('./flows/foodOrder');
const { handleGroceryOrder } = require('./flows/groceryOrder');
const { handleDineoutBooking } = require('./flows/dineoutBooking');
const { handleGeneralQuery } = require('./flows/generalQuery');
const { sendMessage } = require('./twilio/sender');
const { getCurrentMealTime, getMealTimeSuggestion } = require('./utils/mealTime');
const { enforceLineLimit, sanitiseForUser } = require('./utils/responseFormatter');
const logger = require('./utils/logger');

const router = express.Router();

const RESET_COMMANDS = new Set(['reset', 'start over', 'restart', 'cancel', 'shuru karo']);
const GREETING = 'Namaste! 🙏 Main AutoBot360 hoon.\n1. Khana order karo 🍛\n2. Grocery mangwao 🛒\n3. Table book karo 🍽️\nKya chahiye?';

router.post('/webhook', async (req, res) => {
  // Respond to Twilio immediately to prevent timeout
  res.status(200).send('OK');

  const from = req.body?.From;
  const body = req.body?.Body;

  if (!from || !body) {
    logger.warn('Malformed webhook payload', { hasFrom: !!from, hasBody: !!body });
    return; // Already sent 200
  }

  logger.info('Inbound message received', {
    from: logger.maskPhone(from),
    length: body.length,
  });

  // Get or create session
  let session = sessionManager.getOrCreate(from);

  // Append user message to history
  sessionManager.update(from, {
    history: [...(session.history || []), `User: ${body}`],
  });
  session = sessionManager.get(from);

  // Handle reset command
  if (RESET_COMMANDS.has(body.toLowerCase().trim())) {
    // Clear any active tracking timer
    if (session.foodOrder?.trackingTimer) {
      clearInterval(session.foodOrder.trackingTimer);
    }
    sessionManager.clear(from);
    await sendMessage(from, GREETING);
    return;
  }

  let response;

  try {
    // Classify intent
    let intent;
    try {
      intent = await classifyIntent(body, session);
      sessionManager.update(from, { intent });
      session = sessionManager.get(from);
    } catch {
      await sendMessage(from, 'Abhi service thodi busy hai, thodi der mein try karein 🙏');
      return;
    }

    // Route to appropriate flow handler
    switch (intent) {
      case 'FOOD_ORDER':
        response = await handleFoodOrder(body, session);
        break;
      case 'GROCERY_ORDER':
        response = await handleGroceryOrder(body, session);
        break;
      case 'DINEOUT_BOOKING':
        response = await handleDineoutBooking(body, session);
        break;
      case 'GENERAL_QUERY':
      default:
        response = await handleGeneralQuery(body, session);
        break;
    }
  } catch (err) {
    logger.error('Unhandled error in webhook handler', { error: err.message });
    response = 'Kuch issue aa gaya 😔 Thodi der mein try karo ya "reset" type karo.';
  }

  // Append meal-time suggestion if appropriate
  session = sessionManager.get(from);
  if (!session?.hasActiveOrder) {
    const mealTime = getCurrentMealTime();
    if (mealTime) {
      const suggestion = getMealTimeSuggestion(mealTime);
      if (suggestion && response) {
        response = `${response}\n${suggestion}`;
      }
    }
  }

  // Sanitise and enforce line limit
  response = enforceLineLimit(sanitiseForUser(response || ''), 4);

  // Append bot response to history
  sessionManager.update(from, {
    history: [...(sessionManager.get(from)?.history || []), `Bot: ${response}`],
  });

  await sendMessage(from, response);
});

module.exports = router;

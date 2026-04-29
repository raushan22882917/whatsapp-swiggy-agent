'use strict';

/**
 * Intent classifier for AutoBot360.
 * Uses Groq LLM (llama3-70b-8192) to classify user messages into one of:
 *   FOOD_ORDER | GROCERY_ORDER | DINEOUT_BOOKING | GENERAL_QUERY
 */

const Groq = require('groq-sdk');
const logger = require('./utils/logger');

/** @typedef {'FOOD_ORDER'|'GROCERY_ORDER'|'DINEOUT_BOOKING'|'GENERAL_QUERY'} Intent */

const VALID_INTENTS = new Set(['FOOD_ORDER', 'GROCERY_ORDER', 'DINEOUT_BOOKING', 'GENERAL_QUERY']);
const GROQ_TIMEOUT_MS = 10000;

// Lazy-initialised Groq client
let groqClient = null;
function getGroqClient() {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}

/**
 * Builds a session summary string for the classification prompt.
 * @param {import('./sessionManager').Session} session
 * @returns {string}
 */
function buildSessionSummary(session) {
  if (!session.history || session.history.length === 0) return 'No prior context.';
  // Include last 4 turns to keep prompt short
  const recent = session.history.slice(-4);
  return recent.join(' | ');
}

/**
 * Classifies the user's message into an intent.
 * On failure, throws so the caller can preserve session state.
 *
 * @param {string} userMessage
 * @param {import('./sessionManager').Session} session
 * @returns {Promise<Intent>}
 */
async function classifyIntent(userMessage, session) {
  const sessionSummary = buildSessionSummary(session);

  const systemPrompt = `You are AutoBot360, a friendly WhatsApp assistant for food ordering and dining in India.
Always respond in Hinglish (mix of Hindi and English).
Classify the user's message into exactly one of: FOOD_ORDER, GROCERY_ORDER, DINEOUT_BOOKING, GENERAL_QUERY.
Return ONLY the intent label — nothing else, no punctuation, no explanation.

Intent definitions:
- FOOD_ORDER: user wants to order food for delivery (bhook, khana, order, lunch, dinner, biryani, pizza, etc.)
- GROCERY_ORDER: user wants to buy groceries or household items (milk, sabzi, ration, grocery, doodh, etc.)
- DINEOUT_BOOKING: user wants to book a table or dine at a restaurant (restaurant, table, booking, date, dineout, etc.)
- GENERAL_QUERY: anything else (questions, greetings, help, etc.)

Session context: ${sessionSummary}`;

  const groq = getGroqClient();

  // Race against a timeout
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('GROQ_TIMEOUT')), GROQ_TIMEOUT_MS)
  );

  const start = Date.now();
  try {
    const completion = await Promise.race([
      groq.chat.completions.create({
        model: 'llama3-70b-8192',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 20,
        temperature: 0,
      }),
      timeoutPromise,
    ]);

    const elapsed = Date.now() - start;
    const raw = completion.choices?.[0]?.message?.content?.trim().toUpperCase() || '';

    logger.info('Intent classified', {
      intent: raw,
      elapsedMs: elapsed,
      promptLength: systemPrompt.length,
    });

    if (VALID_INTENTS.has(raw)) return raw;

    // Default to GENERAL_QUERY for unexpected values
    logger.warn('Unexpected intent from Groq — defaulting to GENERAL_QUERY', { raw });
    return 'GENERAL_QUERY';
  } catch (err) {
    const elapsed = Date.now() - start;
    if (err.message === 'GROQ_TIMEOUT') {
      logger.error('Groq intent classification timed out', { elapsedMs: elapsed });
      throw new Error('Groq timeout');
    }
    logger.error('Groq intent classification failed', { error: err.message, elapsedMs: elapsed });
    throw err;
  }
}

module.exports = { classifyIntent, VALID_INTENTS };

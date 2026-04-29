'use strict';

/**
 * General Query handler for AutoBot360.
 * Uses Groq LLM to answer food/dining questions in Hinglish.
 */

const Groq = require('groq-sdk');
const { enforceLineLimit, sanitiseForUser } = require('../utils/responseFormatter');
const logger = require('../utils/logger');

const GROQ_TIMEOUT_MS = 10000;
const FALLBACK = 'Abhi service thodi busy hai, thodi der mein try karein 🙏';

let groqClient = null;
function getGroqClient() {
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

const SYSTEM_PROMPT = `You are AutoBot360, a friendly WhatsApp assistant for food ordering and dining in India.
Always respond in Hinglish (natural mix of Hindi and English).
Keep responses to 2 sentences maximum.
Be helpful, warm, and concise.
You help users with food ordering, grocery delivery, and restaurant bookings via Swiggy.`;

/**
 * Handles a GENERAL_QUERY intent message.
 * @param {string} userMessage
 * @param {import('../sessionManager').Session} session
 * @returns {Promise<string>}
 */
async function handleGeneralQuery(userMessage, session) {
  const groq = getGroqClient();

  // Build context from session history (last 4 turns)
  const historyMessages = (session.history || [])
    .slice(-4)
    .map((turn, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: turn,
    }));

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('GROQ_TIMEOUT')), GROQ_TIMEOUT_MS)
  );

  const start = Date.now();
  try {
    const completion = await Promise.race([
      groq.chat.completions.create({
        model: 'llama3-70b-8192',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...historyMessages,
          { role: 'user', content: userMessage },
        ],
        max_tokens: 100,
        temperature: 0.7,
      }),
      timeoutPromise,
    ]);

    const elapsed = Date.now() - start;
    logger.info('General query answered', { elapsedMs: elapsed });

    const raw = completion.choices?.[0]?.message?.content?.trim() || FALLBACK;
    return enforceLineLimit(sanitiseForUser(raw), 2);
  } catch (err) {
    const elapsed = Date.now() - start;
    logger.error('General query Groq call failed', { error: err.message, elapsedMs: elapsed });
    return FALLBACK;
  }
}

module.exports = { handleGeneralQuery };

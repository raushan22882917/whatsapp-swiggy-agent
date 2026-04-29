'use strict';

/**
 * Twilio WhatsApp outbound message sender for AutoBot360.
 * - Sends via Twilio WhatsApp API
 * - Retries once after 2 seconds on failure
 * - Logs every attempt with masked phone number (last 4 digits only)
 */

const twilio = require('twilio');
const logger = require('../utils/logger');

// Lazy-initialised Twilio client
let twilioClient = null;
function getClient() {
  if (!twilioClient) {
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
  return twilioClient;
}

const RETRY_DELAY_MS = 2000;

/**
 * Sends a WhatsApp message via Twilio.
 * Retries once on failure. Logs all attempts.
 *
 * @param {string} toPhoneNumber - Recipient's WhatsApp number (e.g. "whatsapp:+919876543210")
 * @param {string} messageBody   - Message text (max 4 lines, already sanitised)
 * @returns {Promise<void>}
 */
async function sendMessage(toPhoneNumber, messageBody) {
  const maskedPhone = logger.maskPhone(toPhoneNumber);
  const from = process.env.TWILIO_WHATSAPP_NUMBER;

  // Ensure the number has the whatsapp: prefix
  const to = toPhoneNumber.startsWith('whatsapp:')
    ? toPhoneNumber
    : `whatsapp:${toPhoneNumber}`;

  await attemptSend(to, from, messageBody, maskedPhone, 1);
}

/**
 * @param {string} to
 * @param {string} from
 * @param {string} body
 * @param {string} maskedPhone
 * @param {number} attempt
 */
async function attemptSend(to, from, body, maskedPhone, attempt) {
  try {
    await getClient().messages.create({ from, to, body });
    logger.info('Message sent', {
      to: maskedPhone,
      length: body.length,
      attempt,
      status: 'success',
    });
  } catch (err) {
    logger.warn('Message send failed', {
      to: maskedPhone,
      length: body.length,
      attempt,
      error: err.message,
    });

    if (attempt < 2) {
      await sleep(RETRY_DELAY_MS);
      await attemptSend(to, from, body, maskedPhone, attempt + 1);
    } else {
      logger.error('Message discarded after 2 failed attempts', {
        to: maskedPhone,
        length: body.length,
      });
      // Do not throw — a failed send should not crash the webhook handler
    }
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Allow injecting a mock client in tests
function _setClient(client) {
  twilioClient = client;
}

module.exports = { sendMessage, _setClient };

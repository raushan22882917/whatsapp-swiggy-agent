'use strict';

/**
 * Structured logger for AutoBot360.
 *
 * SECURITY CONVENTION: Never pass secret env var values to any log call.
 * Secrets: GROQ_API_KEY, TWILIO_AUTH_TOKEN, TWILIO_ACCOUNT_SID
 * Always use maskPhone() before logging phone numbers.
 */

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Masks a phone number, keeping only the last 4 digits.
 * @param {string} phone
 * @returns {string}
 */
function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '****';
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return `****${digits.slice(-4)}`;
}

/**
 * Formats a log entry as a string.
 * @param {string} level
 * @param {string} message
 * @param {object} [meta]
 * @returns {string}
 */
function format(level, message, meta) {
  const ts = new Date().toISOString();
  if (isDev) {
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${ts}] ${level.toUpperCase()} ${message}${metaStr}`;
  }
  return JSON.stringify({ ts, level, message, ...meta });
}

const logger = {
  /**
   * @param {string} message
   * @param {object} [meta]
   */
  info(message, meta) {
    console.log(format('info', message, meta));
  },

  /**
   * @param {string} message
   * @param {object} [meta]
   */
  warn(message, meta) {
    console.warn(format('warn', message, meta));
  },

  /**
   * @param {string} message
   * @param {object} [meta]
   */
  error(message, meta) {
    console.error(format('error', message, meta));
  },

  /**
   * @param {string} message
   * @param {object} [meta]
   */
  debug(message, meta) {
    if (isDev) {
      console.debug(format('debug', message, meta));
    }
  },

  maskPhone,
};

module.exports = logger;

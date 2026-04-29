'use strict';

/**
 * Dine-Out Booking flow handler for AutoBot360.
 *
 * State machine:
 *   idle → collecting_budget → collecting_location
 *   → showing_options → collecting_booking_details → confirming → booked
 */

const { searchVenues, bookTable } = require('../mcp/swiggyDineout');
const { McpError } = require('../mcp/mcpClient');
const { isConfirmation } = require('../utils/confirmationGuard');
const { formatOptionSet, enforceLineLimit } = require('../utils/responseFormatter');
const sessionManager = require('../sessionManager');
const logger = require('../utils/logger');

/**
 * Handles a DINEOUT_BOOKING intent message.
 * @param {string} userMessage
 * @param {import('../sessionManager').Session} session
 * @returns {Promise<string>}
 */
async function handleDineoutBooking(userMessage, session) {
  if (!session.dineoutBooking) {
    sessionManager.update(session.phoneNumber, {
      dineoutBooking: {
        budgetPerPerson: null,
        location: null,
        options: null,
        selected: null,
        date: null,
        time: null,
        guests: null,
        bookingId: null,
        placementLock: false,
      },
      step: 'collecting_budget',
      hasActiveOrder: true,
    });
    return enforceLineLimit(
      '🍽️ Dineout booking! Budget per person kitna hai? (INR mein, e.g. 500, 1000)'
    );
  }

  const db = session.dineoutBooking;
  const step = session.step;

  // ── collecting_budget ──────────────────────────────────────────────────────
  if (step === 'collecting_budget') {
    const budget = extractNumber(userMessage);
    if (!budget) return 'Budget samajh nahi aaya 😅 Number mein batao (e.g. 500)';
    sessionManager.update(session.phoneNumber, {
      dineoutBooking: { ...db, budgetPerPerson: budget },
      step: 'collecting_location',
    });
    return 'Kaunse area mein restaurant chahiye? (e.g. Koramangala, Indiranagar, Bandra)';
  }

  // ── collecting_location ────────────────────────────────────────────────────
  if (step === 'collecting_location') {
    const location = userMessage.trim();
    sessionManager.update(session.phoneNumber, {
      dineoutBooking: { ...db, location },
      step: 'showing_options',
    });
    session = sessionManager.get(session.phoneNumber);
    return await fetchAndShowVenues(session);
  }

  // ── showing_options — user picks a venue ──────────────────────────────────
  if (step === 'showing_options') {
    const options = db.options || [];
    const selected = pickFromOptions(userMessage, options);
    if (!selected) {
      return `1, 2, ya 3 mein se choose karo 😊\n${formatVenueOptions(options)}`;
    }
    sessionManager.update(session.phoneNumber, {
      dineoutBooking: { ...db, selected },
      step: 'collecting_booking_details',
    });
    return enforceLineLimit(
      `${selected.name} — great choice! 🎉\nDate batao (e.g. 2026-05-10), time (e.g. 8:00 PM), aur kitne log? (e.g. 2)`
    );
  }

  // ── collecting_booking_details ─────────────────────────────────────────────
  if (step === 'collecting_booking_details') {
    const { date, time, guests } = extractBookingDetails(userMessage, db);

    if (!date) {
      return 'Date samajh nahi aaya 😅 Format: YYYY-MM-DD (e.g. 2026-05-10)';
    }
    if (!time) {
      return 'Time batao (e.g. 7:30 PM, 8 PM)';
    }
    if (!guests) {
      return 'Kitne log hain? (e.g. 2, 4)';
    }

    sessionManager.update(session.phoneNumber, {
      dineoutBooking: { ...db, date, time, guests },
      step: 'confirming',
    });
    session = sessionManager.get(session.phoneNumber);
    const updatedDb = session.dineoutBooking;

    return enforceLineLimit(
      `📋 Booking summary:\n` +
      `${updatedDb.selected.name} | ${updatedDb.date} ${updatedDb.time}\n` +
      `${updatedDb.guests} guests | ₹${updatedDb.selected.avgCostPerPerson}/person\n` +
      `Table book kar du? (yes/haan/confirm)`
    );
  }

  // ── confirming ─────────────────────────────────────────────────────────────
  if (step === 'confirming') {
    if (isConfirmation(userMessage)) {
      return await bookTableAndConfirm(session);
    } else {
      sessionManager.update(session.phoneNumber, {
        dineoutBooking: null,
        step: 'idle',
        hasActiveOrder: false,
      });
      return 'Booking cancel kar diya ✅\nKuch aur chahiye? Bas batao!';
    }
  }

  // ── booked ─────────────────────────────────────────────────────────────────
  if (step === 'booked') {
    return `Aapki booking confirmed hai! 🎉\nBooking ID: ${db.bookingId}`;
  }

  return 'Kuch samajh nahi aaya 😅 "reset" type karo aur dobara try karo.';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchAndShowVenues(session) {
  const db = session.dineoutBooking;
  try {
    const results = await searchVenues(db.budgetPerPerson, db.location);
    if (!results || results.length === 0) {
      sessionManager.update(session.phoneNumber, { dineoutBooking: null, step: 'idle', hasActiveOrder: false });
      return 'Koi restaurant nahi mila 😔 Budget ya location change karke try karo.';
    }
    const options = results.slice(0, 3);
    sessionManager.update(session.phoneNumber, {
      dineoutBooking: { ...db, options },
      step: 'showing_options',
    });
    return enforceLineLimit(`Yeh restaurants mile 🍽️\n${formatVenueOptions(options)}\nKaunsa choose karoge? (1/2/3)`);
  } catch (err) {
    if (err instanceof McpError) {
      return 'Swiggy Dineout se connect nahi ho pa raha 😔 Thodi der mein retry karo.';
    }
    throw err;
  }
}

async function bookTableAndConfirm(session) {
  const db = session.dineoutBooking;

  if (db.placementLock) {
    return `Booking already process ho rahi hai ⏳`;
  }

  sessionManager.update(session.phoneNumber, {
    dineoutBooking: { ...db, placementLock: true },
  });

  try {
    const result = await bookTable(db.selected.id, db.date, db.time, db.guests);

    sessionManager.update(session.phoneNumber, {
      dineoutBooking: {
        ...sessionManager.get(session.phoneNumber).dineoutBooking,
        bookingId: result.bookingId,
        placementLock: false,
      },
      step: 'booked',
      hasActiveOrder: false,
    });

    return enforceLineLimit(
      `✅ Table booked!\nBooking ID: ${result.bookingId}\n` +
      `${result.restaurantName} | ${result.date} ${result.time} | ${result.guests} guests 🎉`
    );
  } catch (err) {
    sessionManager.update(session.phoneNumber, {
      dineoutBooking: { ...sessionManager.get(session.phoneNumber).dineoutBooking, placementLock: false },
    });
    if (err instanceof McpError) {
      return 'Booking nahi hui 😔 Details save hai — "confirm" type karke retry karo.';
    }
    throw err;
  }
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatVenueOptions(options) {
  return formatOptionSet(options, (v) => {
    const deal = v.activeDeal ? ` | 🎁 ${v.activeDeal}` : '';
    return `${v.name} (${v.cuisine}) — ₹${v.avgCostPerPerson}/person ⭐${v.rating}${deal}`;
  });
}

// ── Extractors ────────────────────────────────────────────────────────────────

function extractNumber(msg) {
  const match = msg.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function pickFromOptions(msg, options) {
  const lower = msg.toLowerCase().trim();
  const num = parseInt(lower, 10);
  if (!isNaN(num) && num >= 1 && num <= options.length) return options[num - 1];
  return options.find((o) => (o.name || '').toLowerCase().includes(lower)) || null;
}

/**
 * Extracts date, time, and guest count from a free-form message.
 * Merges with existing partial booking details.
 */
function extractBookingDetails(msg, existing) {
  let date = existing.date;
  let time = existing.time;
  let guests = existing.guests;

  // Date: YYYY-MM-DD
  const dateMatch = msg.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (dateMatch) date = dateMatch[1];

  // Time: 7:30 PM, 8 PM, 19:30
  const timeMatch = msg.match(/\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\b/);
  if (timeMatch) time = timeMatch[1].trim();

  // Guests: standalone number not already captured as time
  const guestMatch = msg.match(/\b(\d+)\s*(?:log|people|person|guests?)?\b/);
  if (guestMatch && !timeMatch?.[1]?.includes(guestMatch[1])) {
    const n = parseInt(guestMatch[1], 10);
    if (n >= 1 && n <= 20) guests = n;
  }

  return { date, time, guests };
}

module.exports = { handleDineoutBooking };

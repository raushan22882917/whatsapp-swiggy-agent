'use strict';

require('dotenv').config();

const logger = require('./utils/logger');

// ── Startup env-var validation ────────────────────────────────────────────────
// SECURITY: Never log the VALUES of these variables — only their names.
const REQUIRED_ENV = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_NUMBER',
  'GROQ_API_KEY',
  'SWIGGY_ACCESS_TOKEN',
];

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  logger.error('Missing required environment variables', { missing });
  process.exit(1);
}

// ── Express app ───────────────────────────────────────────────────────────────
const express = require('express');
const webhookRouter = require('./webhook');
const { disconnectAll } = require('./mcp/mcpClient');

const app = express();

// Parse URL-encoded bodies (Twilio sends application/x-www-form-urlencoded)
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'autobot360' }));

// Webhook
app.use('/', webhookRouter);

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  logger.error('Unhandled Express error', { error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
const server = app.listen(PORT, () => {
  logger.info(`AutoBot360 running on port ${PORT}`, { env: process.env.NODE_ENV });
  logger.info('Swiggy MCP OAuth note: ensure SWIGGY_ACCESS_TOKEN is set. Run src/auth/swiggyOAuth.js to get tokens.');
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await disconnectAll();
    logger.info('Server closed');
    process.exit(0);
  });
  // Force exit after 10 seconds
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app; // for integration tests

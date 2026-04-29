'use strict';

/**
 * Token store for Swiggy MCP OAuth 2.1 tokens.
 *
 * Tokens are loaded from environment variables at startup.
 * In production, persist tokens to a secure store (e.g. Redis, AWS Secrets Manager).
 *
 * Environment variables:
 *   SWIGGY_ACCESS_TOKEN   — OAuth access token (from PKCE flow)
 *   SWIGGY_REFRESH_TOKEN  — OAuth refresh token
 *   SWIGGY_CLIENT_ID      — OAuth client_id (from Builders Club approval)
 *   SWIGGY_CLIENT_SECRET  — OAuth client_secret (if applicable)
 */

const logger = require('../utils/logger');

// In-memory token state
let state = {
  accessToken: process.env.SWIGGY_ACCESS_TOKEN || null,
  refreshToken: process.env.SWIGGY_REFRESH_TOKEN || null,
  expiresAt: null, // Unix ms — null means unknown
};

const TOKEN_ENDPOINT = 'https://mcp.swiggy.com/oauth/token';

/**
 * Returns the current access token.
 * Throws if no token is available.
 * @returns {string}
 */
function getAccessToken() {
  if (!state.accessToken) {
    throw new Error(
      'No Swiggy access token available. ' +
      'Run the OAuth PKCE flow first (see src/auth/swiggyOAuth.js) ' +
      'and set SWIGGY_ACCESS_TOKEN in your .env file.'
    );
  }
  return state.accessToken;
}

/**
 * Attempts to refresh the access token using the refresh token.
 * Updates in-memory state on success.
 * @returns {Promise<void>}
 */
async function refresh() {
  if (!state.refreshToken) {
    throw new Error('No refresh token available. Re-run the OAuth PKCE flow.');
  }

  const { default: fetch } = await import('node-fetch');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: state.refreshToken,
    client_id: process.env.SWIGGY_CLIENT_ID || '',
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error('Token refresh failed', { status: response.status });
    throw new Error(`Token refresh failed: ${response.status} — ${text}`);
  }

  const data = await response.json();
  state.accessToken = data.access_token;
  if (data.refresh_token) state.refreshToken = data.refresh_token;
  state.expiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : null;

  logger.info('Swiggy access token refreshed successfully');
}

/**
 * Manually sets tokens (e.g. after completing the PKCE flow).
 * @param {{ accessToken: string, refreshToken?: string, expiresIn?: number }} tokens
 */
function setTokens({ accessToken, refreshToken, expiresIn }) {
  state.accessToken = accessToken;
  if (refreshToken) state.refreshToken = refreshToken;
  state.expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;
}

module.exports = { getAccessToken, refresh, setTokens };

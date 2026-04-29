'use strict';

/**
 * Swiggy MCP client factory using the official @modelcontextprotocol/sdk.
 *
 * Swiggy MCP uses:
 *   - Transport: Streamable HTTP  (mcp.swiggy.com/{server})
 *   - Auth:      OAuth 2.1 + PKCE — bearer token passed on every request
 *
 * Token lifecycle:
 *   1. On first use, the token is read from SWIGGY_ACCESS_TOKEN env var
 *      (obtained via the OAuth PKCE flow — see src/auth/swiggyOAuth.js).
 *   2. On 401, the token manager attempts a refresh using SWIGGY_REFRESH_TOKEN.
 *   3. If refresh fails, the error is surfaced so the operator can re-auth.
 *
 * Each server (food, instamart, dineout) gets its own Client instance,
 * created lazily and cached for the process lifetime.
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const logger = require('../utils/logger');
const tokenStore = require('../auth/tokenStore');

const MCP_TIMEOUT_MS = 8000;

/**
 * Typed error for Swiggy MCP failures.
 */
class McpError extends Error {
  /**
   * @param {string} server  - 'food' | 'im' | 'dineout'
   * @param {string} tool    - tool name
   * @param {string} message
   */
  constructor(server, tool, message) {
    super(message);
    this.name = 'McpError';
    this.server = server;
    this.tool = tool;
  }
}

/** @type {Map<string, import('@modelcontextprotocol/sdk/client/index.js').Client>} */
const clientCache = new Map();

/**
 * Returns (or creates) a connected MCP Client for the given server.
 * @param {'food'|'im'|'dineout'} server
 * @returns {Promise<import('@modelcontextprotocol/sdk/client/index.js').Client>}
 */
async function getClient(server) {
  if (clientCache.has(server)) return clientCache.get(server);

  const serverUrls = {
    food: process.env.SWIGGY_FOOD_MCP_URL || 'https://mcp.swiggy.com/food',
    im: process.env.SWIGGY_IM_MCP_URL || 'https://mcp.swiggy.com/im',
    dineout: process.env.SWIGGY_DINEOUT_MCP_URL || 'https://mcp.swiggy.com/dineout',
  };

  const url = serverUrls[server];
  if (!url) throw new McpError(server, '', `Unknown MCP server: ${server}`);

  // AuthProvider: supplies bearer token before every request, refreshes on 401
  const authProvider = {
    async token() {
      return tokenStore.getAccessToken();
    },
    async onUnauthorized() {
      logger.warn('MCP 401 received — attempting token refresh', { server });
      await tokenStore.refresh();
    },
  };

  const transport = new StreamableHTTPClientTransport(new URL(url), { authProvider });
  const client = new Client({ name: 'autobot360', version: '1.0.0' });

  await client.connect(transport);
  logger.info('MCP client connected', { server, url });

  clientCache.set(server, client);
  return client;
}

/**
 * Calls a tool on a Swiggy MCP server.
 * Handles timeout, logs timing, and wraps errors as McpError.
 *
 * @param {'food'|'im'|'dineout'} server
 * @param {string} toolName
 * @param {object} args
 * @returns {Promise<any>} The tool result content
 */
async function callTool(server, toolName, args = {}) {
  const start = Date.now();

  // Wrap the entire call in a timeout race
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('MCP_TIMEOUT')), MCP_TIMEOUT_MS)
  );

  try {
    const client = await getClient(server);

    const result = await Promise.race([
      client.callTool({ name: toolName, arguments: args }),
      timeoutPromise,
    ]);

    const elapsed = Date.now() - start;
    logger.info('MCP tool call succeeded', { server, tool: toolName, elapsedMs: elapsed });

    // MCP result shape: { content: [{ type: 'text', text: '...' }] }
    // Parse the text content as JSON if possible
    const raw = result?.content?.[0]?.text;
    if (!raw) return result;

    try {
      return JSON.parse(raw);
    } catch {
      return raw; // return as-is if not JSON
    }
  } catch (err) {
    const elapsed = Date.now() - start;

    if (err.message === 'MCP_TIMEOUT') {
      logger.error('MCP tool call timed out', { server, tool: toolName, elapsedMs: elapsed });
      // Evict cached client so next call reconnects
      clientCache.delete(server);
      throw new McpError(server, toolName, `Tool call timed out after ${MCP_TIMEOUT_MS}ms`);
    }

    logger.error('MCP tool call failed', {
      server,
      tool: toolName,
      error: err.message,
      elapsedMs: elapsed,
    });
    // Evict on connection errors
    clientCache.delete(server);
    throw new McpError(server, toolName, err.message);
  }
}

/**
 * Disconnects all cached MCP clients (call on graceful shutdown).
 */
async function disconnectAll() {
  for (const [server, client] of clientCache.entries()) {
    try {
      await client.close();
      logger.info('MCP client disconnected', { server });
    } catch (err) {
      logger.warn('Error disconnecting MCP client', { server, error: err.message });
    }
  }
  clientCache.clear();
}

module.exports = { callTool, disconnectAll, McpError, MCP_TIMEOUT_MS };

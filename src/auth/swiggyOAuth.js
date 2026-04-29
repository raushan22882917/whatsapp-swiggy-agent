'use strict';

/**
 * Swiggy MCP OAuth 2.1 + PKCE flow helper.
 *
 * Usage (run once to get tokens, then store in .env):
 *   node src/auth/swiggyOAuth.js
 *
 * Flow:
 *   1. Generate PKCE code_verifier + code_challenge
 *   2. Print the authorization URL — open it in a browser
 *   3. User logs in with Swiggy phone + OTP
 *   4. Browser redirects to REDIRECT_URI with ?code=...
 *   5. Exchange code for access_token + refresh_token
 *   6. Print tokens — copy to .env
 *
 * Required env vars for this script:
 *   SWIGGY_CLIENT_ID      — from Builders Club approval email
 *   SWIGGY_REDIRECT_URI   — must match what you registered (e.g. http://localhost/callback)
 *
 * Scopes: mcp:tools mcp:resources mcp:prompts
 */

const crypto = require('crypto');
const http = require('http');
const { URL } = require('url');
require('dotenv').config();

const AUTH_ENDPOINT = 'https://mcp.swiggy.com/oauth/authorize';
const TOKEN_ENDPOINT = 'https://mcp.swiggy.com/oauth/token';

const CLIENT_ID = process.env.SWIGGY_CLIENT_ID;
const REDIRECT_URI = process.env.SWIGGY_REDIRECT_URI || 'http://localhost/callback';
const SCOPES = 'mcp:tools mcp:resources mcp:prompts';

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

// ── Main flow ─────────────────────────────────────────────────────────────────

async function run() {
  if (!CLIENT_ID) {
    console.error('❌  SWIGGY_CLIENT_ID is not set. Add it to your .env file.');
    process.exit(1);
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  const authUrl = new URL(AUTH_ENDPOINT);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  console.log('\n🔐  Swiggy MCP OAuth 2.1 + PKCE\n');
  console.log('1. Open this URL in your browser:\n');
  console.log(`   ${authUrl.toString()}\n`);
  console.log('2. Log in with your Swiggy account (phone + OTP).');
  console.log('3. After redirect, paste the full callback URL below.\n');

  // If redirect URI is localhost, spin up a temporary server to catch the callback
  const redirectUrl = new URL(REDIRECT_URI);
  if (redirectUrl.hostname === 'localhost' || redirectUrl.hostname === '127.0.0.1') {
    await listenForCallback(codeVerifier, state, redirectUrl.port || 80);
  } else {
    // Manual paste mode
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Paste the full callback URL: ', async (callbackUrl) => {
      rl.close();
      await exchangeCode(callbackUrl, codeVerifier, state);
    });
  }
}

/**
 * Spins up a temporary HTTP server on localhost to catch the OAuth callback.
 */
async function listenForCallback(codeVerifier, expectedState, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');

      if (!code) {
        res.end('No code received. Please try again.');
        return;
      }

      if (returnedState !== expectedState) {
        res.end('State mismatch — possible CSRF. Please try again.');
        server.close();
        reject(new Error('State mismatch'));
        return;
      }

      res.end('✅ Auth code received! You can close this tab. Check your terminal for tokens.');
      server.close();

      try {
        await exchangeCode(code, codeVerifier);
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    server.listen(port, () => {
      console.log(`\n⏳  Waiting for OAuth callback on port ${port}...\n`);
    });
  });
}

/**
 * Exchanges an auth code for tokens.
 * @param {string} codeOrUrl - The auth code or full callback URL
 * @param {string} codeVerifier
 */
async function exchangeCode(codeOrUrl, codeVerifier) {
  // Accept either a raw code or a full URL
  let code = codeOrUrl;
  if (codeOrUrl.startsWith('http')) {
    const url = new URL(codeOrUrl);
    code = url.searchParams.get('code');
    if (!code) throw new Error('No code found in callback URL');
  }

  const { default: fetch } = await import('node-fetch');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: codeVerifier,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${response.status} — ${text}`);
  }

  const data = await response.json();

  console.log('\n✅  Tokens received! Add these to your .env file:\n');
  console.log(`SWIGGY_ACCESS_TOKEN=${data.access_token}`);
  if (data.refresh_token) {
    console.log(`SWIGGY_REFRESH_TOKEN=${data.refresh_token}`);
  }
  console.log(`\nAccess token expires in: ${data.expires_in}s`);
  console.log('\nDone! Restart AutoBot360 with the new tokens.\n');
}

// Run if called directly
if (require.main === module) {
  run().catch((err) => {
    console.error('OAuth flow failed:', err.message);
    process.exit(1);
  });
}

module.exports = { generateCodeVerifier, generateCodeChallenge };

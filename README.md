# AutoBot360 🤖🍛

WhatsApp-based AI assistant for food ordering, grocery delivery, and restaurant bookings in India.

**Stack:** Node.js 20 · Express · Twilio WhatsApp · Groq (llama3-70b-8192) · Swiggy MCP (OAuth 2.1 + PKCE)

---

## Architecture

```
WhatsApp User
     │  POST /webhook (Twilio)
     ▼
Express Webhook Handler
     │
     ├─ Session Manager (in-memory Map)
     ├─ Intent Classifier (Groq LLM)
     │
     ├─ FOOD_ORDER    → flows/foodOrder.js    → Swiggy Food MCP
     ├─ GROCERY_ORDER → flows/groceryOrder.js → Swiggy Instamart MCP
     ├─ DINEOUT_BOOKING → flows/dineoutBooking.js → Swiggy Dineout MCP
     └─ GENERAL_QUERY → flows/generalQuery.js → Groq LLM
          │
     Twilio Sender → WhatsApp User
```

---

## Quick Start

### 1. Install dependencies

```bash
cd autobot360
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Where to get it |
|---|---|
| `TWILIO_ACCOUNT_SID` | [Twilio Console](https://console.twilio.com) |
| `TWILIO_AUTH_TOKEN` | Twilio Console |
| `TWILIO_WHATSAPP_NUMBER` | Twilio Sandbox: `whatsapp:+14155238886` |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) |
| `SWIGGY_CLIENT_ID` | [Swiggy Builders Club](https://mcp.swiggy.com/access) |
| `SWIGGY_ACCESS_TOKEN` | Run OAuth flow (step 3) |
| `SWIGGY_REFRESH_TOKEN` | Run OAuth flow (step 3) |

### 3. Get Swiggy OAuth tokens

Apply for access at **https://mcp.swiggy.com/access** (Builders Club).

Once approved, run the PKCE flow:

```bash
SWIGGY_CLIENT_ID=your_client_id \
SWIGGY_REDIRECT_URI=http://localhost/callback \
node src/auth/swiggyOAuth.js
```

Copy the printed tokens into your `.env`.

### 4. Set up Twilio WhatsApp Sandbox

1. Go to [Twilio Console → Messaging → WhatsApp Sandbox](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn)
2. Send the join code from your phone
3. Set the **"When a message comes in"** webhook URL to your public URL + `/webhook`

For local dev, use [ngrok](https://ngrok.com):

```bash
ngrok http 3000
# Copy the https URL → paste into Twilio sandbox webhook
```

### 5. Start the server

```bash
npm start
# or for development with auto-reload:
npm run dev
```

### 6. Test it

Send any of these to the Twilio sandbox number on WhatsApp:

- `bhook lagi hai` → Food order flow
- `milk aur bread chahiye` → Grocery flow
- `dinner ke liye table book karna hai` → Dineout flow
- `reset` → Restart conversation

---

## Project Structure

```
autobot360/
├── src/
│   ├── index.js              # Express entry point + startup validation
│   ├── webhook.js            # Twilio webhook handler + intent router
│   ├── sessionManager.js     # In-memory session store (Map)
│   ├── intentClassifier.js   # Groq LLM intent classification
│   ├── auth/
│   │   ├── swiggyOAuth.js    # OAuth 2.1 + PKCE flow helper (run once)
│   │   └── tokenStore.js     # Access/refresh token management
│   ├── flows/
│   │   ├── foodOrder.js      # FOOD_ORDER state machine
│   │   ├── groceryOrder.js   # GROCERY_ORDER state machine
│   │   ├── dineoutBooking.js # DINEOUT_BOOKING state machine
│   │   └── generalQuery.js   # GENERAL_QUERY via Groq
│   ├── mcp/
│   │   ├── mcpClient.js      # MCP SDK client factory (OAuth bearer auth)
│   │   ├── swiggyFood.js     # Swiggy Food MCP tools
│   │   ├── swiggyInstamart.js# Swiggy Instamart MCP tools
│   │   └── swiggyDineout.js  # Swiggy Dineout MCP tools
│   ├── twilio/
│   │   └── sender.js         # Outbound WhatsApp sender (retry logic)
│   └── utils/
│       ├── logger.js         # Structured logger (phone masking)
│       ├── mealTime.js       # IST meal-time detection
│       ├── confirmationGuard.js # Order confirmation token check
│       └── responseFormatter.js # Line limit, option sets, sanitisation
├── tests/
│   ├── unit/                 # Unit tests
│   ├── property/             # Property-based tests (fast-check)
│   └── integration/          # Integration tests
├── .env.example
├── jest.config.js
└── package.json
```

---

## Swiggy MCP — Important Notes

- **Access is whitelist-only.** Apply at https://mcp.swiggy.com/access
- **OAuth 2.1 + PKCE** — tokens expire; use `SWIGGY_REFRESH_TOKEN` for auto-refresh
- **COD only** — all orders use Cash on Delivery
- **Free bookings only** — Dineout supports free table reservations
- **Keep Swiggy app closed** while using MCP to avoid session conflicts

---

## Running Tests

```bash
npm test                    # all tests
npm run test:unit           # unit tests only
npm run test:property       # property-based tests only
npm run test:integration    # integration tests only
```

---

## Conversation Examples

**Food order:**
```
User: bhook lagi hai, biryani chahiye
Bot:  biryani — great choice! 👍
      Aapka budget kitna hai? (INR mein)
User: 250
Bot:  Yeh restaurants mile 🍽️
      1. Paradise Biryani (Biryani) — ₹180+ | 30-40 mins
      2. Behrouz Biryani (Biryani) — ₹220+ | 35-45 mins
      3. Biryani Blues (Biryani) — ₹150+ | 25-35 mins
      Kaunsa choose karoge? (1/2/3)
```

**Grocery:**
```
User: milk aur eggs chahiye
Bot:  🛒 "milk" ke options:
      1. Amul Milk 500ml (Amul) — ₹28
      2. Mother Dairy Milk 1L (Mother Dairy) — ₹54
      3. Nandini Milk 500ml (Nandini) — ₹26
      Kaunsa chahiye? (1/2/3)
```

/**
 * server.js — Meta Cloud API Webhook Server
 * شغّله بـ: npm start
 */

require('dotenv').config();

const express            = require('express');
const { processMessage } = require('./src/agent');
const { sendMessage, markAsRead } = require('./src/whatsapp-meta');
const { getStats }       = require('./src/memory');

// ── Validation ────────────────────────────────────────────────────────
const required = ['OPENROUTER_API_KEY','META_ACCESS_TOKEN','META_PHONE_NUMBER_ID','META_WEBHOOK_VERIFY_TOKEN'];
const missing  = required.filter(k => !process.env[k] || process.env[k].startsWith('ضع_'));
if (missing.length) {
  console.error('❌  المتغيرات دي ناقصة في .env:', missing.join(', '));
  process.exit(1);
}

const app   = express();
const PORT  = process.env.PORT || 3000;
const TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;

app.use(express.json());

// ── GET /webhook — Meta Verification ─────────────────────────────────
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === TOKEN) {
    console.log('✅  Webhook verified!');
    res.status(200).send(challenge);
  } else {
    console.error('❌  Webhook verification failed');
    res.sendStatus(403);
  }
});

// ── POST /webhook — incoming messages ────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // رد فوري لـ Meta

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        for (const msg of change.value?.messages || []) {
          await handleMessage(msg);
        }
      }
    }
  } catch (err) {
    console.error('❌  Webhook error:', err.message);
  }
});

// ── Anti-flood ───────────────────────────────────────────────────────
const busy      = new Set();
const lastSeen  = new Map();
const processed = new Set();

async function handleMessage(msg) {
  if (msg.type !== 'text') {
    await sendMessage(msg.from, 'معلش، بفهم النصوص بس دلوقتي 😊');
    return;
  }

  const msgId  = msg.id;
  const chatId = msg.from;
  const text   = msg.text?.body?.trim();
  if (!text) return;

  // تجنب التكرار
  if (processed.has(msgId)) return;
  processed.add(msgId);
  setTimeout(() => processed.delete(msgId), 3600000);

  await markAsRead(msgId);

  // حماية من الـ flood
  const now = Date.now();
  if (now - (lastSeen.get(chatId) || 0) < 1500) return;
  lastSeen.set(chatId, now);

  if (busy.has(chatId)) {
    await sendMessage(chatId, 'لحظة، بجهزلك الرد... ⏳');
    return;
  }

  busy.add(chatId);
  try {
    console.log(`\n💬 [${chatId}]: ${text}`);
    const reply = await processMessage(chatId, text);
    await sendMessage(chatId, reply);
  } catch (err) {
    console.error('❌  Processing error:', err.message);
    await sendMessage(chatId, 'معلش، حصل خطأ. جرب تاني 😊');
  } finally {
    busy.delete(chatId);
  }
}

// ── Health check ─────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const stats = await getStats();
  res.json({
    status:  'ok',
    uptime:  Math.round(process.uptime()) + 's',
    users:   stats.users,
    messages: stats.total
  });
});

app.get('/', (req, res) => {
  res.json({ name: 'مساعد مركز الارائج', status: 'running' });
});

// ── Start ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🤖  مساعد مركز الارائج — Meta Cloud API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅  Server on port ${PORT}`);
  console.log(`🔗  Webhook: /webhook`);
  console.log(`❤️   Health:  /health`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

process.on('uncaughtException',  e => console.error('❌', e.message));
process.on('unhandledRejection', e => console.error('❌', e));

/**
 * whatsapp-qr.js — الطريقة 1: WhatsApp Web (QR Code)
 * ════════════════════════════════════════════════════
 * شغّله بـ:  node src/whatsapp-qr.js
 *
 * بيربط الرقم 01017973649 عن طريق QR بالظبط زي WhatsApp Web
 * التليفون لازم يكون متصل بالنت طول ما البوت شغال
 */

require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode              = require('qrcode-terminal');
const { processMessage }  = require('./agent');
const { getStats }        = require('./memory');

// ─── Validation ───────────────────────────────────────────────────────────────
if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.includes('your_')) {
  console.error('❌  OPENROUTER_API_KEY مش موجود في .env');
  process.exit(1);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🤖  مساعد مركز الارائج — WhatsApp QR Mode');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// ─── Client ──────────────────────────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './data/wwa-session' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', '--disable-gpu',
      '--no-first-run', '--no-zygote'
    ]
  }
});

// ─── Events ───────────────────────────────────────────────────────────────────
client.on('qr', (qr) => {
  console.log('\n📱  امسح الـ QR دا بواتساب:');
  console.log('    واتساب ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  const { users, total } = await getStats();
  console.log('\n✅  متصل وجاهز!');
  console.log(`    إحصائيات: ${users} مستخدم | ${total} رسالة محفوظة`);
  console.log('    📩  بيستنى رسائل...\n');
});

client.on('auth_failure', () => console.error('❌  فشل المصادقة — امسح ./data/wwa-session وحاول تاني'));
client.on('disconnected', (r) => {
  console.warn('⚠️   انقطع الاتصال:', r);
  console.log('🔄  بيحاول يتصل تاني...');
});

// ─── Anti-flood ───────────────────────────────────────────────────────────────
const busy      = new Set();
const lastSeen  = new Map();

// ─── Messages ─────────────────────────────────────────────────────────────────
client.on('message', async (msg) => {
  try {
    if (msg.isGroupMsg)                  return;
    if (msg.from === 'status@broadcast') return;
    if (msg.type !== 'chat') {
      await msg.reply('معلش، بفهم النصوص بس دلوقتي 😊');
      return;
    }

    const text   = msg.body?.trim();
    const chatId = msg.from;
    if (!text) return;

    // حماية من الـ double-trigger
    const now = Date.now();
    if (now - (lastSeen.get(chatId) || 0) < 1000) return;
    lastSeen.set(chatId, now);

    if (busy.has(chatId)) {
      await msg.reply('لحظة، بجهزلك الرد... ⏳');
      return;
    }

    busy.add(chatId);
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    try {
      const reply = await processMessage(chatId, text);
      await msg.reply(reply);
    } finally {
      busy.delete(chatId);
      try { await chat.clearState(); } catch (_) {}
    }

  } catch (err) {
    busy.delete(msg?.from);
    console.error('❌  Message error:', err.message);
    try { await msg.reply('معلش، حصل خطأ. جرب تاني 😊'); } catch (_) {}
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
client.initialize().catch((e) => {
  console.error('❌  فشل التشغيل:', e.message);
  process.exit(1);
});

// ─── Shutdown ─────────────────────────────────────────────────────────────────
process.on('SIGINT', async () => {
  console.log('\n⚠️   جاري الإيقاف الآمن...');
  await client.destroy().catch(() => {});
  console.log('✅  تم');
  process.exit(0);
});

process.on('uncaughtException',  (e) => console.error('❌  uncaughtException:', e.message));
process.on('unhandledRejection', (e) => console.error('❌  unhandledRejection:', e));

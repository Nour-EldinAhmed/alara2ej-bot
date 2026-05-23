require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode  = require('qrcode-terminal');
const { processMessage } = require('./agent');
const { getStats } = require('./memory');

// ─── Validation ───────────────────────────────────────────────────────────────
if (!process.env.OPENROUTER_API_KEY) {
  console.error('❌ OPENROUTER_API_KEY مش موجود في ملف .env');
  console.error('   انسخ .env.example لـ .env وضع فيه الـ API key');
  process.exit(1);
}

console.log('🚀 بيشتغل مساعد مركز الارائج...');
console.log(`   Model: ${process.env.AI_MODEL || 'deepseek/deepseek-chat'}`);
console.log(`   Apps Script: ${process.env.APPS_SCRIPT_URL?.slice(0, 60)}...`);

// ─── WhatsApp Client ─────────────────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './data/wwa-session' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote'
    ]
  }
});

// ─── Events ───────────────────────────────────────────────────────────────────
client.on('qr', (qr) => {
  console.log('\n📱 امسح الـ QR Code دا بـ WhatsApp:');
  console.log('   WhatsApp → الإعدادات → الأجهزة المرتبطة → ربط جهاز\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  const { users, total } = await getStats();
  console.log('\n✅ WhatsApp Bot شغال ومتصل!');
  console.log(`   إحصائيات: ${users} مستخدم | ${total} رسالة محفوظة`);
  console.log('   🤖 جاهز لاستقبال الرسائل...\n');
});

client.on('auth_failure', (msg) => {
  console.error('❌ فشل المصادقة:', msg);
});

client.on('disconnected', (reason) => {
  console.warn('⚠️  انقطع الاتصال:', reason);
  console.log('🔄 بيحاول يتصل تاني تلقائياً...');
});

// ─── Anti-duplicate state ─────────────────────────────────────────────────────
const processing  = new Set();
const lastMsgTime = new Map();

// ─── Message handler ─────────────────────────────────────────────────────────
client.on('message', async (msg) => {
  try {
    // تجاهل المجموعات والـ status والـ broadcast
    if (msg.isGroupMsg)                   return;
    if (msg.from === 'status@broadcast')  return;

    // بس الرسائل النصية
    if (msg.type !== 'chat') {
      await msg.reply('معلش، بفهم النصوص بس دلوقتي 😊');
      return;
    }

    const text = msg.body?.trim();
    if (!text) return;

    const chatId = msg.from;

    // حماية من الـ double-trigger (أقل من ثانية)
    const now = Date.now();
    if (now - (lastMsgTime.get(chatId) || 0) < 1000) return;
    lastMsgTime.set(chatId, now);

    // لو لسه بيعالج رسالة سابقة
    if (processing.has(chatId)) {
      await msg.reply('لحظة، بجهزلك الرد... ⏳');
      return;
    }

    processing.add(chatId);

    // أظهر "جاري الكتابة"
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    try {
      const reply = await processMessage(chatId, text);
      await msg.reply(reply);
    } finally {
      processing.delete(chatId);
      try { await chat.clearState(); } catch (_) {}
    }

  } catch (err) {
    processing.delete(msg?.from);
    console.error('❌ Message handler error:', err.message);
    try { await msg.reply('معلش، حصل خطأ. جرب تاني. 😊'); } catch (_) {}
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
client.initialize().catch((err) => {
  console.error('❌ Failed to initialize:', err.message);
  process.exit(1);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGINT', async () => {
  console.log('\n⚠️  جاري الإيقاف الآمن...');
  await client.destroy().catch(() => {});
  console.log('✅ تم الإيقاف');
  process.exit(0);
});

process.on('uncaughtException',  (e) => console.error('❌ uncaughtException:',  e.message));
process.on('unhandledRejection', (e) => console.error('❌ unhandledRejection:', e));

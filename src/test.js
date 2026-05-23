/**
 * test.js — اختبار كامل بدون WhatsApp
 * شغله بـ:  node src/test.js
 */

require('dotenv').config();

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m'
};
const pass  = (t) => console.log(`${c.green}${c.bold}  ✅ PASS${c.reset}  ${t}`);
const fail  = (t) => console.log(`${c.red}${c.bold}  ❌ FAIL${c.reset}  ${t}`);
const info  = (t) => console.log(`${c.cyan}         ${t}${c.reset}`);
const warn  = (t) => console.log(`${c.yellow}  ⚠️  SKIP${c.reset}  ${t}`);
const sep   = ()  => console.log(`${c.blue}${'─'.repeat(55)}${c.reset}`);

// ════════════════════════════════════════════════════
// TEST 1: Memory
// ════════════════════════════════════════════════════
async function testMemory() {
  console.log(`\n${c.bold}TEST 1: Memory (SQLite)${c.reset}`);
  sep();
  try {
    const { saveMessage, getHistory, clearHistory, getStats } = require('./memory');
    const id = 'test_mem_' + Date.now();

    await clearHistory(id);
    await saveMessage(id, 'user',      'أهلاً');
    await saveMessage(id, 'assistant', 'أهلاً بيك!');
    await saveMessage(id, 'user',      'كيف حالك؟');

    const hist = await getHistory(id, 10);
    if (hist.length === 3) {
      pass('حفظ واسترجاع 3 رسائل');
    } else {
      fail(`متوقع 3، لقيت ${hist.length}`);
    }

    const { users, total } = await getStats();
    info(`إحصائيات: ${users} مستخدم | ${total} رسالة`);

    await clearHistory(id);
    pass('clearHistory');
    return true;
  } catch (e) {
    fail(e.message);
    return false;
  }
}

// ════════════════════════════════════════════════════
// TEST 2: Apps Script (HTTP)
// ════════════════════════════════════════════════════
async function testAppsScript() {
  console.log(`\n${c.bold}TEST 2: Apps Script Connectivity${c.reset}`);
  sep();
  const axios = require('axios');
  const url   = process.env.APPS_SCRIPT_URL ||
    'https://script.google.com/macros/s/AKfycbxUH4az5y69ShWAXeAW3FmUDXXGzQJ7njM4cn_m_rW1q8jF4dMlr_ADPmIpkaIyxTVGGQ/exec';

  try {
    const res = await axios.post(url, { action: 'ping' }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
      maxRedirects: 5
    });
    pass(`Apps Script رد بـ HTTP ${res.status}`);
    info(`Response: ${JSON.stringify(res.data).slice(0, 120)}`);
    return true;
  } catch (e) {
    if (e.response) {
      // رد بـ error code = السيرفر شغال بس
      pass(`Apps Script شغال (HTTP ${e.response.status})`);
      info(`Response: ${JSON.stringify(e.response.data).slice(0, 120)}`);
      return true;
    }
    fail(`لا يمكن الوصول: ${e.message}`);
    info('تأكد من الاتصال بالانترنت وإن الـ Apps Script deployed كـ "Execute as Me / Anyone"');
    return false;
  }
}

// ════════════════════════════════════════════════════
// TEST 3: OpenRouter API key
// ════════════════════════════════════════════════════
async function testOpenRouter() {
  console.log(`\n${c.bold}TEST 3: OpenRouter API${c.reset}`);
  sep();

  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key === 'your_openrouter_api_key_here') {
    warn('OPENROUTER_API_KEY مش موجود في .env — ضعه وشغل التيست تاني');
    return false;
  }

  const axios = require('axios');
  const model = process.env.AI_MODEL || 'deepseek/deepseek-chat';

  try {
    const res = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model,
        messages: [{ role: 'user', content: 'قول "تيست ناجح" بالعربي فقط بدون أي كلام تاني' }],
        max_tokens: 30
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );
    const reply = res.data.choices?.[0]?.message?.content;
    pass(`OpenRouter شغال | Model: ${model}`);
    info(`رد النموذج: ${reply}`);
    return true;
  } catch (e) {
    if (e.response?.status === 401) fail('API Key غلط أو منتهي');
    else if (e.response?.status === 402) fail('رصيد OpenRouter خلص');
    else fail(`Error: ${e.message}`);
    return false;
  }
}

// ════════════════════════════════════════════════════
// TEST 4: Full agent conversation
// ════════════════════════════════════════════════════
async function testFullAgent() {
  console.log(`\n${c.bold}TEST 4: Full Agent (محادثة حقيقية)${c.reset}`);
  sep();

  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key === 'your_openrouter_api_key_here') {
    warn('بيحتاج OPENROUTER_API_KEY — بيتخطى');
    return false;
  }

  const { processMessage } = require('./agent');
  const { clearHistory }   = require('./memory');
  const chatId = 'fulltest_' + Date.now();
  await clearHistory(chatId);

  const turns = [
    { msg: 'السلام عليكم', label: 'ترحيب' },
    { msg: 'عايز أعرف مواعيد المدرسين لأولى ثانوي', label: 'مواعيد' },
    { msg: 'شكراً', label: 'شكر' }
  ];

  let allOk = true;
  for (const { msg, label } of turns) {
    process.stdout.write(`  👤 ${label}: "${msg}"\n`);
    try {
      const reply = await processMessage(chatId, msg);
      info(`🤖 ${reply.slice(0, 150)}${reply.length > 150 ? '...' : ''}`);
      pass(`رد ناجح على "${label}"`);
    } catch (e) {
      fail(`فشل في "${label}": ${e.message}`);
      allOk = false;
    }
    // استنى بين الرسائل عشان ماتبانش كـ spam
    await new Promise(r => setTimeout(r, 2500));
  }
  clearHistory('fulltest_' + Date.now()); // نظفها
  return allOk;
}

// ════════════════════════════════════════════════════
// RUN ALL
// ════════════════════════════════════════════════════
async function main() {
  console.log(`\n${c.bold}${'═'.repeat(55)}`);
  console.log('🧪  مساعد الارائج — Test Suite');
  console.log(`${'═'.repeat(55)}${c.reset}`);

  const results = {};
  results.memory     = await testMemory();
  results.appsScript = await testAppsScript();
  results.openRouter = await testOpenRouter();
  results.fullAgent  = await testFullAgent();

  // ── ملخص ──
  console.log(`\n${c.bold}${'═'.repeat(55)}`);
  console.log('📋  النتيجة النهائية');
  console.log(`${'═'.repeat(55)}${c.reset}`);

  const icons = { true: '✅', false: '❌' };
  const labels = {
    memory:     'SQLite Memory',
    appsScript: 'Apps Script',
    openRouter: 'OpenRouter API',
    fullAgent:  'Full Agent Test'
  };

  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${icons[v]}  ${labels[k]}`);
  }

  const readyToRun = results.memory && results.openRouter;
  console.log();
  if (readyToRun) {
    console.log(`${c.green}${c.bold}🎉 كل حاجة تمام! شغل البوت بـ:${c.reset}`);
    console.log(`${c.cyan}   npm start${c.reset}\n`);
  } else {
    console.log(`${c.yellow}${c.bold}⚠️  في حاجة محتاج تصلحها الأول (شيف فوق)${c.reset}\n`);
  }
}

main().catch((e) => {
  console.error('❌ Test runner crashed:', e.message);
  process.exit(1);
});

const axios        = require('axios');
const SYSTEM_PROMPT = require('./prompt');
const { TOOLS, executeTool } = require('./tools');
const { getHistory, saveMessage } = require('./memory');

const MAX_LOOPS = 6;

// ─── اختيار الـ Provider تلقائياً ────────────────────────────────────────────
function getProvider() {
  if (process.env.GROQ_API_KEY)        return 'groq';
  if (process.env.OPENROUTER_API_KEY)  return 'openrouter';
  if (process.env.GEMINI_API_KEY)      return 'gemini';
  throw new Error('مفيش API Key في .env — ضيف GROQ_API_KEY أو OPENROUTER_API_KEY');
}

function getModel(provider) {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  const defaults = {
    groq:       'llama-3.3-70b-versatile',
    openrouter: 'deepseek/deepseek-chat',
    gemini:     'gemini-1.5-flash',
  };
  return defaults[provider];
}

// ─── Entry point ──────────────────────────────────────────────────────────────
async function processMessage(chatId, userText) {
  console.log(`\n💬 [${chatId}] User: ${userText}`);

  const history  = await getHistory(chatId, 20);
  await saveMessage(chatId, 'user', userText);

  const messages = [...history, { role: 'user', content: userText }];

  let reply;
  try {
    reply = await agentLoop(messages);
  } catch (err) {
    console.error('❌ Agent error:', err.message);
    reply = 'معلش، فيه مشكلة مؤقتة. جرب تاني بعد شوية. 😊';
  }

  await saveMessage(chatId, 'assistant', reply);
  console.log(`🤖 [${chatId}] Bot: ${reply.slice(0, 120)}`);
  return reply;
}

// ─── Agentic Loop ─────────────────────────────────────────────────────────────
async function agentLoop(messages, depth = 0) {
  if (depth >= MAX_LOOPS) {
    return 'معلش، الطلب محتاج وقت أكتر. ممكن تعيد السؤال؟ 😊';
  }

  const provider = getProvider();
  const data     = await callAI(provider, messages);
  if (!data) return 'معلش، مش قادر أتصل بالـ AI دلوقتي. 😊';

  const choice = data.choices?.[0];
  if (!choice)  return 'معلش، حصل خطأ غير متوقع. 😊';

  const msg = choice.message;

  // رد نهائي
  if (!msg.tool_calls || msg.tool_calls.length === 0) {
    return msg.content || 'معلش، مش قادر أرد دلوقتي. 😊';
  }

  // نفّذ الـ tools
  messages.push(msg);

  for (const tc of msg.tool_calls) {
    let args = {};
    try { args = JSON.parse(tc.function.arguments || '{}'); } catch (_) {}
    const result = await executeTool(tc.function.name, args);
    messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
  }

  return agentLoop(messages, depth + 1);
}

// ─── AI Call — بيختار الـ Provider تلقائياً ──────────────────────────────────
async function callAI(provider, messages) {
  switch (provider) {
    case 'groq':       return callGroq(messages);
    case 'openrouter': return callOpenRouter(messages);
    case 'gemini':     return callGemini(messages);
    default:           return null;
  }
}

// ─── 1. Groq (مجاني — الأسرع والأذكى) ───────────────────────────────────────
async function callGroq(messages) {
  try {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model:       getModel('groq'),
        messages:    [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        tools:       TOOLS,
        tool_choice: 'auto',
        max_tokens:  1500,
        temperature: 0.7
      },
      {
        headers: {
          Authorization:  `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    console.log(`✅ Groq responded (model: ${getModel('groq')})`);
    return res.data;
  } catch (err) {
    console.error('❌ Groq error:', err.response?.status, JSON.stringify(err.response?.data)?.slice(0, 200) || err.message);
    return null;
  }
}

// ─── 2. OpenRouter (مدفوع — أذكى موديلات) ────────────────────────────────────
async function callOpenRouter(messages) {
  try {
    const res = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model:       getModel('openrouter'),
        messages:    [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        tools:       TOOLS,
        tool_choice: 'auto',
        max_tokens:  1500,
        temperature: 0.7
      },
      {
        headers: {
          Authorization:  `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer':  'https://alara2ej.center',
          'X-Title':       'مساعد مركز الارائج'
        },
        timeout: 30000
      }
    );
    console.log(`✅ OpenRouter responded (model: ${getModel('openrouter')})`);
    return res.data;
  } catch (err) {
    console.error('❌ OpenRouter error:', err.response?.status, JSON.stringify(err.response?.data)?.slice(0, 200) || err.message);
    return null;
  }
}

// ─── 3. Gemini (مجاني — Google) ───────────────────────────────────────────────
async function callGemini(messages) {
  try {
    const model = getModel('gemini');

    // Gemini بيستخدم format مختلف شوية
    const geminiMessages = messages.map(m => ({
      role:    m.role === 'assistant' ? 'model' : 'user',
      parts:   [{ text: m.content || '' }]
    })).filter(m => m.role !== 'tool'); // Gemini مش بيدعم tool results بنفس الطريقة

    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents:         geminiMessages,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { maxOutputTokens: 1500, temperature: 0.7 }
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );

    // حوّل الـ response لـ OpenAI format عشان الكود يشتغل
    const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log(`✅ Gemini responded (model: ${model})`);
    return {
      choices: [{ message: { role: 'assistant', content: text, tool_calls: null } }]
    };
  } catch (err) {
    console.error('❌ Gemini error:', err.response?.status, JSON.stringify(err.response?.data)?.slice(0, 200) || err.message);
    return null;
  }
}

module.exports = { processMessage };

const axios   = require('axios');
const SYSTEM_PROMPT = require('./prompt');
const { TOOLS, executeTool } = require('./tools');
const { getHistory, saveMessage } = require('./memory');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL     = process.env.AI_MODEL || 'deepseek/deepseek-chat';
const MAX_LOOPS = 6; // حد أقصى لعدد tool call rounds

// ─── Entry point ─────────────────────────────────────────────────────────────
async function processMessage(chatId, userText) {
  console.log(`\n💬 [${chatId}] User: ${userText}`);

  // جيب الـ history وحفظ رسالة المستخدم
  const history = await getHistory(chatId, 20);
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

// ─── Agentic loop ─────────────────────────────────────────────────────────────
async function agentLoop(messages, depth = 0) {
  if (depth >= MAX_LOOPS) {
    return 'معلش، الطلب محتاج وقت أكتر. ممكن تعيد السؤال؟ 😊';
  }

  const data = await callOpenRouter(messages);
  if (!data) return 'معلش، مش قادر أتصل بالـ AI دلوقتي. 😊';

  const choice  = data.choices?.[0];
  if (!choice)  return 'معلش، حصل خطأ غير متوقع. 😊';

  const msg = choice.message;

  // لو مفيش tool calls → رد نهائي
  if (!msg.tool_calls || msg.tool_calls.length === 0) {
    return msg.content || 'معلش، مش قادر أرد دلوقتي. 😊';
  }

  // أضف رسالة الـ assistant للـ context
  messages.push(msg);

  // نفذ كل tool call
  for (const tc of msg.tool_calls) {
    let args = {};
    try { args = JSON.parse(tc.function.arguments || '{}'); } catch (_) {}

    const result = await executeTool(tc.function.name, args);

    messages.push({
      role: 'tool',
      tool_call_id: tc.id,
      content: result
    });
  }

  // كمل الـ loop
  return agentLoop(messages, depth + 1);
}

// ─── OpenRouter call ─────────────────────────────────────────────────────────
async function callOpenRouter(messages) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENROUTER_API_KEY missing in .env');
    return null;
  }

  try {
    const res = await axios.post(
      OPENROUTER_URL,
      {
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: 2000,
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://alara2ej.center',
          'X-Title':      'مساعد مركز الارائج'
        },
        timeout: 30000
      }
    );
    return res.data;
  } catch (err) {
    if (err.response) {
      console.error('❌ OpenRouter API error:', err.response.status, JSON.stringify(err.response.data).slice(0, 300));
    } else {
      console.error('❌ OpenRouter network error:', err.message);
    }
    return null;
  }
}

module.exports = { processMessage };

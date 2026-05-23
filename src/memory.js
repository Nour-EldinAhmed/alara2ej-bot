const Datastore = require('nedb-promises');
const path = require('path');
const fs   = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE  = path.join(DATA_DIR, 'memory.db');

// تأكد إن الـ data dir موجود
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = Datastore.create({ filename: DB_FILE, autoload: true });
db.ensureIndex({ fieldName: 'chat_id' });
console.log('✅ NeDB memory ready:', DB_FILE);

// ─── API ──────────────────────────────────────────────────────────────────────

// جيب آخر N رسالة مرتبة قديم → جديد (sync-style via in-memory cache)
// nedb async — بنستخدم in-memory cache للسرعة + نكتب على الديسك بالباراليل

// In-memory store لكل chat_id  {chatId → [{role, content, ts}]}
const cache = new Map();

async function _loadChat(chatId) {
  if (cache.has(chatId)) return;
  const docs = await db.find({ chat_id: chatId }).sort({ ts: 1 });
  cache.set(chatId, docs.map(d => ({ role: d.role, content: d.content, ts: d.ts })));
}

async function getHistory(chatId, limit = 20) {
  await _loadChat(chatId);
  const msgs = cache.get(chatId) || [];
  return msgs.slice(-limit).map(m => ({ role: m.role, content: m.content }));
}

async function saveMessage(chatId, role, content) {
  await _loadChat(chatId);
  const ts  = Date.now();
  const rec = { role, content: String(content), ts };

  // أضف للكاش
  const msgs = cache.get(chatId) || [];
  msgs.push(rec);
  // احتفظ بآخر 60 بس
  if (msgs.length > 60) msgs.splice(0, msgs.length - 60);
  cache.set(chatId, msgs);

  // اكتب على الديسك بدون انتظار
  db.insert({ chat_id: chatId, ...rec }).catch(() => {});

  // نظف الديسك من القديم بعد فترة (كل 20 رسالة)
  if (msgs.length % 20 === 0) {
    const cutoff = msgs[0].ts;
    db.remove({ chat_id: chatId, ts: { $lt: cutoff } }, { multi: true }).catch(() => {});
  }
}

async function clearHistory(chatId) {
  cache.delete(chatId);
  await db.remove({ chat_id: chatId }, { multi: true });
}

async function getStats() {
  const allDocs = await db.find({});
  const users   = new Set(allDocs.map(d => d.chat_id)).size;
  return { users, total: allDocs.length };
}

module.exports = { getHistory, saveMessage, clearHistory, getStats };

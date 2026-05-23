/**
 * whatsapp-meta.js — إرسال رسائل عبر Meta Cloud API
 * ════════════════════════════════════════════════════
 * ده module بيُستخدم من server.js — مش بيتشغل لوحده
 */

const axios = require('axios');

const BASE_URL = 'https://graph.facebook.com/v19.0';

function getConfig() {
  const token   = process.env.META_ACCESS_TOKEN;
  const phoneId = process.env.META_PHONE_NUMBER_ID;

  if (!token || token.includes('ضع_هنا')) {
    throw new Error('META_ACCESS_TOKEN مش موجود في .env');
  }
  if (!phoneId || phoneId.includes('ضع_هنا')) {
    throw new Error('META_PHONE_NUMBER_ID مش موجود في .env');
  }
  return { token, phoneId };
}

/**
 * إرسال رسالة نصية
 * @param {string} to   - رقم المستلم بالصيغة الدولية مثلاً 201017973649
 * @param {string} text - نص الرسالة
 */
async function sendMessage(to, text) {
  const { token, phoneId } = getConfig();

  // Meta بيقبل الرقم بالصيغة الدولية بدون +
  const recipient = to.replace(/^\+/, '').replace(/^0/, '20');

  try {
    const res = await axios.post(
      `${BASE_URL}/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                recipient,
        type:              'text',
        text:              { body: text, preview_url: false }
      },
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log(`✅  Meta sent to ${recipient} | msg_id: ${res.data.messages?.[0]?.id}`);
    return true;

  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    console.error(`❌  Meta send error to ${recipient}:`, detail);
    return false;
  }
}

/**
 * إرسال "جاري الكتابة" (typing indicator)
 * Meta بيدعمه بس في الـ Business API
 */
async function sendTyping(to) {
  // Meta Cloud API مش بيدعم typing indicator بشكل مباشر
  // بنعمل mark as read بدلاً منه
  return true;
}

/**
 * Mark message as read
 */
async function markAsRead(messageId) {
  const { token, phoneId } = getConfig();
  try {
    await axios.post(
      `${BASE_URL}/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        status:            'read',
        message_id:        messageId
      },
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 8000
      }
    );
  } catch (_) {
    // مش critical
  }
}

module.exports = { sendMessage, markAsRead, sendTyping };

# 🤖 مساعد مركز الارائج — WhatsApp AI Bot v2

بوت واتساب ذكي لإدارة بيانات الطلاب ومواعيد المدرسين.
يدعم طريقتين للتشغيل: QR Code و Meta Cloud API.

---

## هيكل المشروع

```
alara2ej-bot/
├── src/
│   ├── agent.js           ← الـ AI Agent + Agentic Loop  (مشترك)
│   ├── memory.js          ← ذاكرة المحادثات NeDB         (مشترك)
│   ├── tools.js           ← HTTP Tool → Apps Script      (مشترك)
│   ├── prompt.js          ← System Prompt                (مشترك)
│   ├── whatsapp-qr.js     ← الطريقة 1: QR Code
│   ├── whatsapp-meta.js   ← مرسل رسائل Meta API
│   └── test.js            ← اختبار شامل
├── server.js              ← Webhook Server للـ Meta API
├── .env                   ← مفاتيحك (لا ترفعه على GitHub)
└── package.json
```

---

## التثبيت

```bash
npm install
```

---

## الطريقة 1: QR Code

للتجربة السريعة — التليفون لازم يكون متصل دايماً.

```bash
npm run start:qr
```

امسح الـ QR بواتساب:
واتساب ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز

---

## الطريقة 2: Meta Cloud API

للـ production — يشتغل بدون تليفون.

### الإعدادات المطلوبة في .env
```
META_ACCESS_TOKEN=EAAxxxxxxxx
META_PHONE_NUMBER_ID=1234567890
META_WEBHOOK_VERIFY_TOKEN=alara2ej_secret_2024
```

### خطوات إعداد Meta (مرة واحدة)

1. روح: https://developers.facebook.com/apps
2. New App ← Business ← اسم التطبيق
3. أضف منتج: WhatsApp
4. WhatsApp ← Getting Started ← Add phone number ← 01017973649
5. احصل على META_PHONE_NUMBER_ID و META_ACCESS_TOKEN
6. شغّل السيرفر:

```bash
npm run start:meta
```

7. شغّل ngrok في terminal تاني:

```bash
ngrok http 3000
```

8. انسخ الـ https URL من ngrok
9. روح Meta ← WhatsApp ← Configuration ← Webhook
10. Callback URL: https://xxxx.ngrok.io/webhook
11. Verify Token: alara2ej_secret_2024
12. Subscribe على: messages

---

## الاختبار

```bash
npm test
```

---

## مقارنة الطريقتين

| الميزة | QR | Meta API |
|--------|----|----|
| يشتغل بدون تليفون | لا | نعم |
| سهولة الإعداد | سهل | متوسط |
| رسمي من Meta | لا | نعم |
| مجاني | نعم | نعم (1000 محادثة/شهر) |
| للـ Production | للتيست | الأفضل |

---

## على سيرفر دائم

```bash
npm install -g pm2
pm2 start server.js --name alara2ej-meta
# أو
pm2 start src/whatsapp-qr.js --name alara2ej-qr
pm2 save && pm2 startup
```
"# alara2ej-bot" 
"# alara2ej-bot" 

const axios = require('axios');

const APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbxUH4az5y69ShWAXeAW3FmUDXXGzQJ7njM4cn_m_rW1q8jF4dMlr_ADPmIpkaIyxTVGGQ/exec';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'http_request',
      description:
        'Use this tool for ALL operations — student grades AND teacher schedules.\n' +
        'For grades: action=read/write/readByPhone/readByCode/adminauth\n' +
        'For schedules: action=getSchedules with teacher name (without ا/), gradeLevel (1ث/2ث/3ث), or day\n' +
        'ALWAYS use this tool before responding. Never guess data.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['read', 'write', 'readByPhone', 'readByCode', 'adminauth', 'getSchedules'],
            description: 'Action to perform'
          },
          studentCode:   { type: 'string', description: 'Student code/ID' },
          subject:       { type: 'string', description: 'Subject: عربي / إنجليزي / احياء / كيمياء / فيزياء / رياضيات / تاريخ' },
          sessionNumber: { type: 'string', description: 'Session number 1-8' },
          grade:         { type: 'string', description: 'Grade value to write' },
          parentPhone:   { type: 'string', description: 'Parent phone number' },
          username:      { type: 'string', description: 'Admin username' },
          password:      { type: 'string', description: 'Admin password' },
          teacher:       { type: 'string', description: 'Teacher name WITHOUT ا/ prefix, e.g. احمد عبد القادر' },
          gradeLevel:    { type: 'string', description: 'Grade level: 1ث or 2ث or 3ث' },
          day:           { type: 'string', description: 'Day in Arabic: السبت/الاحد/الاثنين/الثلاثاء/الاربعاء/الخميس/الجمعة' }
        },
        required: ['action']
      }
    }
  }
];

async function executeTool(toolName, args) {
  if (toolName !== 'http_request') {
    return JSON.stringify({ error: true, message: `Unknown tool: ${toolName}` });
  }

  const payload = {
    action:        args.action        || '',
    studentCode:   args.studentCode   || '',
    subject:       args.subject       || '',
    sessionNumber: args.sessionNumber || '',
    grade:         args.grade         || '',
    parentPhone:   args.parentPhone   || '',
    username:      args.username      || '',
    password:      args.password      || '',
    teacher:       args.teacher       || '',
    gradeLevel:    args.gradeLevel    || '',
    day:           args.day           || ''
  };

  console.log(`📡 HTTP Tool → action=${payload.action} teacher=${payload.teacher} grade=${payload.gradeLevel} day=${payload.day}`);

  try {
    const res = await axios.post(APPS_SCRIPT_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
      maxRedirects: 5
    });
    console.log('✅ Apps Script:', JSON.stringify(res.data).slice(0, 300));
    return JSON.stringify(res.data);
  } catch (err) {
    const msg = err.response
      ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
      : err.message;
    console.error('❌ Apps Script error:', msg);
    return JSON.stringify({ error: true, message: 'فيه مشكلة في الاتصال بالسيرفر' });
  }
}

module.exports = { TOOLS, executeTool };

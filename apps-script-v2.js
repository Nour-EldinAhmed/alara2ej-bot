// ════════════════════════════════════════════════════════════════
//  مساعد مركز الارائج — Apps Script
//  النسخة 2: مع دعم جلب المواعيد
// ════════════════════════════════════════════════════════════════

const SHEET_NAME       = "الورقة1";
const SCHEDULES_SHEET  = "المواعيد";   // Sheet المواعيد في نفس الـ Spreadsheet
const SPREADSHEET_URL  = "https://docs.google.com/spreadsheets/d/1tSlSoRoBtxzUvQVAxHLh_eV0-fEvlZhbl4XlMmpVFhw/edit?usp=sharing";

// ─── Spreadsheet المواعيد (نفس الـ file أو ادخل رابط تاني لو عندك) ───────────
// لو المواعيد في Spreadsheet تاني غيّر الرابط ده
const SCHEDULES_SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1tSlSoRoBtxzUvQVAxHLh_eV0-fEvlZhbl4XlMmpVFhw/edit?usp=sharing";
const SCHEDULES_SHEET_NAME      = "المواعيد";

const ADMIN_USERNAME = "01002169889";
const ADMIN_PASSWORD = "0127523";

const SUBJECTS = {
  "عربي":    { sessions: [6,7,8,9,10,11,12,13] },
  "إنجليزي": { sessions: [15,16,17,18,19,20,21,22] },
  "احياء":   { sessions: [24,25,26,27,28,29,30,31] },
  "كيمياء":  { sessions: [33,34,35,36,37,38,39,40] },
  "فيزياء":  { sessions: [42,43,44,45,46,47,48,49] },
  "رياضيات": { sessions: [51,52,53,54,55,56,57,58] },
  "تاريخ":   { sessions: [60,61,62,63,64,65,66,67] }
};

// ════════════════════════════════════════════════════════════════
function doGet(e) {
  return respond({ success: false, error: "استخدم POST مش GET" });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respond({ success: false, error: "مفيش بيانات في الطلب" });
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch(parseErr) {
      return respond({ success: false, error: "البيانات مش JSON صحيح: " + parseErr.message });
    }

    if (!data.action) {
      return respond({ success: false, error: "مفيش action في الطلب" });
    }

    // تنظيف البيانات
    if (data.studentCode)   data.studentCode   = String(data.studentCode).replace(/^=+/, "").trim();
    if (data.subject)       data.subject       = String(data.subject).replace(/^=+/, "").trim();
    if (data.action)        data.action        = String(data.action).replace(/^=+/, "").trim();
    if (data.sessionNumber) data.sessionNumber = String(data.sessionNumber).replace(/^=+/, "").trim();
    if (data.parentPhone)   data.parentPhone   = String(data.parentPhone).replace(/^=+/, "").trim();
    if (data.username)      data.username      = String(data.username).replace(/^=+/, "").trim();
    if (data.password)      data.password      = String(data.password).replace(/^=+/, "").trim();
    if (data.grade !== undefined && data.grade !== null) {
      data.grade = String(data.grade).replace(/^=+/, "").trim();
    }

    // نظف الـ action من أي رموز غير أحرف
    var action = String(data.action).replace(/[^a-zA-Z]/g, '').toLowerCase().trim();

    if (action === "write")        return writeGrade(data);
    if (action === "read")         return readGrades(data);
    if (action === "readbyphone")  return readByPhone(data);
    if (action === "readbycode")   return readByCode(data);
    if (action === "adminauth")    return checkAdmin(data);
    if (action === "getschedules") return getSchedules(data);   // ← جديد

    return respond({ success: false, error: "action غلط: '" + data.action + "'" });

  } catch(err) {
    return respond({ success: false, error: "خطأ عام: " + err.message });
  }
}

// ════════════════════════════════════════════════════════════════
//  getSchedules — جلب مواعيد المدرسين من Sheet "المواعيد"
// ════════════════════════════════════════════════════════════════
function getSchedules(data) {
  try {
    var ss    = SpreadsheetApp.openByUrl(SCHEDULES_SPREADSHEET_URL);
    var sheet = ss.getSheetByName(SCHEDULES_SHEET_NAME);

    if (!sheet) {
      return respond({
        success: false,
        error:   "Sheet 'المواعيد' مش موجودة — ارجع لشيت الدرجات وأضف Sheet جديدة اسمها 'المواعيد'"
      });
    }

    var allData = sheet.getDataRange().getValues();
    if (allData.length < 2) {
      return respond({ success: false, error: "الجدول فاضي" });
    }

    // ─── Parse: fill-down الـ day column (العمود الأول) ───────────────────────
    var records = [];
    var currentDay = "";
    for (var i = 1; i < allData.length; i++) {   // ابدأ من 1 عشان تتخطى الهيدر
      var row     = allData[i];
      var day     = String(row[0] || "").trim();
      var teacher = String(row[1] || "").trim();
      var time    = String(row[2] || "").trim();
      var grade   = String(row[3] || "").trim();
      var room    = String(row[4] || "").trim();

      if (day)     currentDay = day;
      if (!teacher || !time || !grade) continue;   // سطر فاضي

      records.push({
        day:     currentDay,
        teacher: normalizeTeacherName(teacher),
        time:    time,
        grade:   grade,
        room:    room
      });
    }

    if (records.length === 0) {
      return respond({ success: false, error: "مفيش بيانات في الجدول" });
    }

    // ─── فلترة ───────────────────────────────────────────────────────────────
    var teacherQuery = data.teacher     ? normalizeTeacherName(String(data.teacher).trim())     : "";
    var gradeQuery   = data.gradeLevel  ? String(data.gradeLevel).trim()   : "";
    var dayQuery     = data.day         ? String(data.day).trim()           : "";

    var filtered = records.filter(function(r) {
      var matchTeacher = !teacherQuery || r.teacher.indexOf(teacherQuery) !== -1 || teacherQuery.indexOf(r.teacher) !== -1;
      var matchGrade   = !gradeQuery   || r.grade === gradeQuery;
      var matchDay     = !dayQuery     || r.day   === dayQuery;
      return matchTeacher && matchGrade && matchDay;
    });

    if (filtered.length === 0) {
      return respond({
        success: false,
        error:   "مفيش نتائج للبحث ده",
        hint:    "المدرسين المتاحين: " + getUniqueTeachers(records).join(", ")
      });
    }

    return respond({ success: true, schedules: filtered, total: filtered.length });

  } catch(err) {
    return respond({ success: false, error: "خطأ في جلب المواعيد: " + err.message });
  }
}

// ─── توحيد أسماء المدرسين (يحل مشكلة المسافات والتهجئة) ──────────────────────
function normalizeTeacherName(name) {
  return name
    .replace(/^ا\/\s*/,  "")   // شيل "ا/" من الأول
    .replace(/\s+/g, " ")       // توحيد المسافات
    .trim()
    .toLowerCase();
}

function getUniqueTeachers(records) {
  var seen = {};
  var result = [];
  records.forEach(function(r) {
    if (!seen[r.teacher]) {
      seen[r.teacher] = true;
      result.push(r.teacher);
    }
  });
  return result;
}

// ════════════════════════════════════════════════════════════════
//  باقي الدوال (زي ما هي من قبل)
// ════════════════════════════════════════════════════════════════

function checkAdmin(data) {
  if (!data) return respond({ success: false, error: "مفيش بيانات" });
  var username  = String(data.username || "").trim().replace(/\s+/g, " ");
  var password  = String(data.password || "").trim();
  var adminUser = String(ADMIN_USERNAME).trim().replace(/\s+/g, " ");
  var adminPass = String(ADMIN_PASSWORD).trim();
  if (username === adminUser && password === adminPass) {
    return respond({ success: true, message: "تم التحقق بنجاح" });
  }
  return respond({ success: false, error: "البيانات مش صح" });
}

function normalizePhone(phone) {
  var p = String(phone || "").trim().replace(/[^0-9]/g, "");
  if (p.startsWith("20") && p.length === 12) p = "0" + p.substring(2);
  if (!p.startsWith("0") && p.length === 10) p = "0" + p;
  return p;
}

function writeGrade(data) {
  var studentCode   = String(data.studentCode || "").trim();
  var subject       = String(data.subject     || "").trim();
  var sessionNumber = parseInt(String(data.sessionNumber).replace(/[^0-9]/g, ''));
  var gradeRaw      = String(data.grade || "").trim();
  var grade         = gradeRaw === "" ? null : gradeRaw;

  if (!studentCode)         return respond({ success: false, error: "studentCode مطلوب" });
  if (!subject)             return respond({ success: false, error: "subject مطلوب" });
  if (!SUBJECTS[subject])   return respond({ success: false, error: "المادة مش موجودة: " + subject });
  if (isNaN(sessionNumber)) return respond({ success: false, error: "sessionNumber مش رقم صحيح" });
  if (sessionNumber < 1 || sessionNumber > 8) return respond({ success: false, error: "رقم الحصة من 1 لـ 8" });
  if (grade === null)       return respond({ success: false, error: "grade مطلوب" });

  var sheet   = SpreadsheetApp.openByUrl(SPREADSHEET_URL).getSheetByName(SHEET_NAME);
  var allData = sheet.getDataRange().getValues();
  var studentRow = -1;
  for (var i = 0; i < allData.length; i++) {
    if (String(allData[i][1]).trim() === studentCode) { studentRow = i + 1; break; }
  }
  if (studentRow === -1) return respond({ success: false, error: "الطالب مش موجود: " + studentCode });

  var colIndex = SUBJECTS[subject].sessions[sessionNumber - 1];
  sheet.getRange(studentRow, colIndex).setValue(grade);
  return respond({ success: true, message: "تم تسجيل الدرجة بنجاح", studentRow: studentRow, column: colIndex, grade: grade });
}

function readGrades(data) {
  var studentCode = String(data.studentCode || "").trim();
  var subject     = data.subject ? String(data.subject).trim() : null;
  if (!studentCode) return respond({ success: false, error: "studentCode مطلوب" });

  var sheet   = SpreadsheetApp.openByUrl(SPREADSHEET_URL).getSheetByName(SHEET_NAME);
  var allData = sheet.getDataRange().getValues();
  var studentRow = -1;
  for (var i = 0; i < allData.length; i++) {
    if (String(allData[i][1]).trim() === studentCode) { studentRow = i; break; }
  }
  if (studentRow === -1) return respond({ success: false, error: "الطالب مش موجود: " + studentCode });

  var grades = {};
  if (subject && SUBJECTS[subject]) {
    var teacherColIdx = SUBJECTS[subject].sessions[0] - 2;
    grades[subject] = {
      teacher: String(allData[studentRow][teacherColIdx] || "").trim(),
      sessions: SUBJECTS[subject].sessions.map(function(col, idx) {
        var val = allData[studentRow][col - 1];
        return { session: idx + 1, grade: (val === "" || val === null || val === undefined) ? "غياب" : String(val) };
      })
    };
  } else {
    Object.keys(SUBJECTS).forEach(function(subj) {
      var teacherColIdx = SUBJECTS[subj].sessions[0] - 2;
      grades[subj] = {
        teacher: String(allData[studentRow][teacherColIdx] || "").trim(),
        sessions: SUBJECTS[subj].sessions.map(function(col, idx) {
          var val = allData[studentRow][col - 1];
          return { session: idx + 1, grade: (val === "" || val === null || val === undefined) ? "غياب" : String(val) };
        })
      };
    });
  }

  return respond({
    success:      true,
    studentName:  allData[studentRow][0],
    studentPhone: allData[studentRow][2],
    parentPhone:  allData[studentRow][3],
    studentCode:  studentCode,
    grades:       grades
  });
}

function readByPhone(data) {
  var inputPhone = normalizePhone(data.parentPhone);
  if (!inputPhone) return respond({ success: false, error: "parentPhone مطلوب" });

  var sheet   = SpreadsheetApp.openByUrl(SPREADSHEET_URL).getSheetByName(SHEET_NAME);
  var allData = sheet.getDataRange().getValues();
  var students = [];
  for (var i = 3; i < allData.length; i++) {
    var storedPhone = normalizePhone(allData[i][3]);
    if (storedPhone === inputPhone) {
      students.push({ studentName: String(allData[i][0]), studentCode: String(allData[i][1]), studentPhone: String(allData[i][2]) });
    }
  }
  if (students.length === 0) return respond({ success: false, error: "مفيش طالب مرتبط بالرقم: " + inputPhone });
  return respond({ success: true, students: students });
}

function readByCode(data) {
  var studentCode = String(data.studentCode || "").replace(/^=+/, "").trim();
  var inputPhone  = normalizePhone(data.parentPhone);
  if (!studentCode) return respond({ success: false, error: "studentCode مطلوب" });
  if (!inputPhone)  return respond({ success: false, error: "parentPhone مطلوب" });

  var sheet   = SpreadsheetApp.openByUrl(SPREADSHEET_URL).getSheetByName(SHEET_NAME);
  var allData = sheet.getDataRange().getValues();
  var studentRow = -1;
  for (var i = 3; i < allData.length; i++) {
    if (String(allData[i][1]).trim() === studentCode) { studentRow = i; break; }
  }
  if (studentRow === -1) return respond({ success: false, error: "الكود ده مش موجود" });
  var storedPhone = normalizePhone(allData[studentRow][3]);
  if (storedPhone !== inputPhone) return respond({ success: false, error: "الكود ده مش مرتبط برقمك" });
  return respond({ success: true, studentName: String(allData[studentRow][0]), studentCode: studentCode });
}

// ════════════════════════════════════════════════════════════════
//  Test Functions
// ════════════════════════════════════════════════════════════════
function testGetSchedules() {
  var fakeEvent = {
    postData: { contents: JSON.stringify({ action: "getSchedules", teacher: "احمد عبد القادر", gradeLevel: "1ث" }) }
  };
  Logger.log(doPost(fakeEvent).getContent());
}

function testGetSchedulesByDay() {
  var fakeEvent = {
    postData: { contents: JSON.stringify({ action: "getSchedules", day: "السبت" }) }
  };
  Logger.log(doPost(fakeEvent).getContent());
}

function testCheckAdmin() {
  var fakeEvent = { postData: { contents: JSON.stringify({ action: "adminauth", username: "01002169889", password: "0127523" }) } };
  Logger.log(doPost(fakeEvent).getContent());
}

function testRead() {
  var fakeEvent = { postData: { contents: JSON.stringify({ action: "read", studentCode: "3001" }) } };
  Logger.log(doPost(fakeEvent).getContent());
}

// ════════════════════════════════════════════════════════════════
function respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

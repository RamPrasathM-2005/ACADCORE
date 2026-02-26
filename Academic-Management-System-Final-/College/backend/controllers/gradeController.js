import db from '../models/index.js';
import catchAsync from '../utils/catchAsync.js';
import XLSX from 'xlsx';
import csv from 'csv-parser';
import fs from 'fs';
import { Op } from 'sequelize';

const {
  sequelize,
  StudentGrade,
  Course,
  GradePoint,
  Semester,
  StudentDetails,
  User,
  Department,
  NptelCourse,
  StudentNptelEnrollment,
  StudentSemesterGPA
} = db;

const VALID_GRADES = new Set(['O', 'A+', 'A', 'B+', 'B', 'C', 'U']);
const GRADE_POINTS = { O: 10, 'A+': 9, A: 8, 'B+': 7, B: 6, C: 5 };
const REG_KEYS = new Set([
  'regno',
  'register_number',
  'register_no',
  'registernumber',
  'register_num',
  'registernum',
  'register_nur',
  'registernur',
  'register'
]);
const SNO_KEYS = new Set(['sno', 's.no', 'serialno', 'serial_number', 'slno', 'sl_no']);
const COURSE_KEYS = new Set(['coursecode', 'course_code', 'subjectcode', 'subject_code']);
const GRADE_KEYS = new Set(['grade', 'result', 'lettergrade', 'letter_grade']);

const normalizeHeader = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const normalizeCode = (value) => String(value ?? '').trim().toUpperCase();
const normalizeGrade = (value) => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return null;

  const compact = raw.replace(/\s+/g, '');
  const gradeAliases = {
    O: 'O',
    APLUS: 'A+',
    'A+': 'A+',
    A: 'A',
    BPLUS: 'B+',
    'B+': 'B+',
    B: 'B',
    C: 'C',
    U: 'U',
    F: 'U',
    FAIL: 'U',
    RA: 'U'
  };

  return gradeAliases[compact] || null;
};
const roundToTwo = (value) => Number.parseFloat(Number(value).toFixed(2));

const isRegHeader = (header) => REG_KEYS.has(normalizeHeader(header));
const isSnoHeader = (header) => SNO_KEYS.has(normalizeHeader(header));
const isCourseHeader = (header) => COURSE_KEYS.has(normalizeHeader(header));
const isGradeHeader = (header) => GRADE_KEYS.has(normalizeHeader(header));
const isPlaceholderCourseHeader = (header) => {
  const h = normalizeHeader(header);
  return /^course\d+$/.test(h) || /^subject\d+$/.test(h) || /^c\d+$/.test(h);
};

let gradeSchemaReady = false;
let semesterAnalyticsSchemaReady = false;
const ensureGradeSchemaReady = async (transaction) => {
  if (gradeSchemaReady) return;

  await sequelize.query('ALTER TABLE StudentGrade MODIFY grade VARCHAR(3) NOT NULL', { transaction });
  await sequelize.query('ALTER TABLE GradePoint MODIFY grade VARCHAR(3) NOT NULL', { transaction });
  await sequelize.query('ALTER TABLE NptelCreditTransfer MODIFY grade VARCHAR(3) NOT NULL', { transaction });
  await sequelize.query(
    "INSERT INTO GradePoint (grade, point) VALUES ('O',10),('A+',9),('A',8),('B+',7),('B',6),('C',5),('U',0) ON DUPLICATE KEY UPDATE point = VALUES(point)",
    { transaction }
  );

  gradeSchemaReady = true;
};

const ensureSemesterAnalyticsSchemaReady = async (transaction) => {
  if (semesterAnalyticsSchemaReady) return;

  const [columns] = await sequelize.query('SHOW COLUMNS FROM StudentSemesterGPA', { transaction });
  const existing = new Set((columns || []).map((c) => c.Field));

  const additions = [
    { name: 'earnedCredits', sql: 'ALTER TABLE StudentSemesterGPA ADD COLUMN earnedCredits DECIMAL(6,2) NOT NULL DEFAULT 0 AFTER cgpa' },
    { name: 'totalCredits', sql: 'ALTER TABLE StudentSemesterGPA ADD COLUMN totalCredits DECIMAL(6,2) NOT NULL DEFAULT 0 AFTER earnedCredits' },
    { name: 'qualityPoints', sql: 'ALTER TABLE StudentSemesterGPA ADD COLUMN qualityPoints DECIMAL(8,2) NOT NULL DEFAULT 0 AFTER totalCredits' },
    { name: 'cumulativeEarnedCredits', sql: 'ALTER TABLE StudentSemesterGPA ADD COLUMN cumulativeEarnedCredits DECIMAL(7,2) NOT NULL DEFAULT 0 AFTER qualityPoints' },
    { name: 'cumulativeTotalCredits', sql: 'ALTER TABLE StudentSemesterGPA ADD COLUMN cumulativeTotalCredits DECIMAL(7,2) NOT NULL DEFAULT 0 AFTER cumulativeEarnedCredits' },
    { name: 'cumulativeQualityPoints', sql: 'ALTER TABLE StudentSemesterGPA ADD COLUMN cumulativeQualityPoints DECIMAL(9,2) NOT NULL DEFAULT 0 AFTER cumulativeTotalCredits' },
    { name: 'hasOutstandingArrear', sql: 'ALTER TABLE StudentSemesterGPA ADD COLUMN hasOutstandingArrear TINYINT(1) NOT NULL DEFAULT 0 AFTER cumulativeQualityPoints' },
    { name: 'cgpaFrozen', sql: 'ALTER TABLE StudentSemesterGPA ADD COLUMN cgpaFrozen TINYINT(1) NOT NULL DEFAULT 0 AFTER hasOutstandingArrear' }
  ];

  for (const col of additions) {
    if (!existing.has(col.name)) {
      await sequelize.query(col.sql, { transaction });
    }
  }

  semesterAnalyticsSchemaReady = true;
};

const findKeyByMatcher = (row, matcher) =>
  Object.keys(row).find((key) => matcher(key));

const extractRecordsFromRows = (rows) => {
  if (!rows?.length) return [];

  const regKey = findKeyByMatcher(rows[0], isRegHeader);
  const courseKey = findKeyByMatcher(rows[0], isCourseHeader);
  const gradeKey = findKeyByMatcher(rows[0], isGradeHeader);
  const isNarrow = Boolean(regKey && courseKey && gradeKey);

  const records = [];

  if (isNarrow) {
    for (const row of rows) {
      const regno = normalizeCode(row[regKey]);
      const courseCode = normalizeCode(row[courseKey]);
      const grade = normalizeGrade(row[gradeKey]);
      if (regno && courseCode && grade && VALID_GRADES.has(grade)) {
        records.push({ regno, courseCode, grade });
      }
    }
    return records;
  }

  const allKeys = Object.keys(rows[0] || {});
  const gradeColumns = allKeys.filter((k) => !isRegHeader(k) && !isSnoHeader(k));
  const hasOnlyPlaceholders = gradeColumns.length > 0 && gradeColumns.every((k) => isPlaceholderCourseHeader(k));

  let effectiveRows = rows;
  let codeMapByPlaceholder = null;

  if (hasOnlyPlaceholders && rows.length > 1) {
    const mappingRow = rows[0];
    codeMapByPlaceholder = new Map();
    for (const col of gradeColumns) {
      const code = normalizeCode(mappingRow[col]);
      if (code) codeMapByPlaceholder.set(col, code);
    }
    effectiveRows = rows.slice(1);
  }

  for (const row of effectiveRows) {
    const dynamicRegKey = findKeyByMatcher(row, isRegHeader);
    if (!dynamicRegKey) continue;

    const regno = normalizeCode(row[dynamicRegKey]);
    if (!regno) continue;

    for (const [key, value] of Object.entries(row)) {
      if (key === dynamicRegKey || isSnoHeader(key)) continue;
      const grade = normalizeGrade(value);
      if (!grade || !VALID_GRADES.has(grade)) continue;
      const courseCode = codeMapByPlaceholder
        ? normalizeCode(codeMapByPlaceholder.get(key))
        : normalizeCode(key);
      if (!courseCode) continue;
      records.push({ regno, courseCode, grade });
    }
  }

  return records;
};

const extractRecordsFromMatrix = (matrix) => {
  if (!Array.isArray(matrix) || matrix.length < 2) return [];

  const headers = matrix[0].map((header) => String(header ?? '').trim());
  const regIdx = headers.findIndex(isRegHeader);
  const snoIdx = headers.findIndex(isSnoHeader);
  if (regIdx === -1) return [];

  const courseIdx = headers.findIndex(isCourseHeader);
  const gradeIdx = headers.findIndex(isGradeHeader);
  const isNarrow = courseIdx !== -1 && gradeIdx !== -1;

  const records = [];
  const placeholderCols = headers
    .map((h, idx) => ({ h, idx }))
    .filter(({ idx }) => idx !== regIdx && idx !== snoIdx)
    .every(({ h }) => isPlaceholderCourseHeader(h));

  let courseCodeByCol = null;
  let startRow = 1;

  if (!isNarrow && placeholderCols && matrix.length > 2) {
    courseCodeByCol = new Map();
    for (let col = 0; col < headers.length; col += 1) {
      if (col === regIdx || col === snoIdx) continue;
      const maybeCode = normalizeCode(matrix[1]?.[col]);
      if (maybeCode) courseCodeByCol.set(col, maybeCode);
    }
    startRow = 2;
  }

  for (let i = startRow; i < matrix.length; i += 1) {
    const row = matrix[i] || [];
    const regno = normalizeCode(row[regIdx]);
    if (!regno) continue;

    if (isNarrow) {
      const courseCode = normalizeCode(row[courseIdx]);
      const grade = normalizeGrade(row[gradeIdx]);
      if (courseCode && grade && VALID_GRADES.has(grade)) {
        records.push({ regno, courseCode, grade });
      }
      continue;
    }

    for (let col = 0; col < headers.length; col += 1) {
      if (col === regIdx || col === snoIdx) continue;
      const courseCode = courseCodeByCol
        ? normalizeCode(courseCodeByCol.get(col))
        : normalizeCode(headers[col]);
      const grade = normalizeGrade(row[col]);
      if (!courseCode || !grade || !VALID_GRADES.has(grade)) continue;
      records.push({ regno, courseCode, grade });
    }
  }

  return records;
};

const parseGradeFile = async (filePath, originalName) => {
  const isXlsx = /\.(xlsx|xls)$/i.test(originalName);
  if (isXlsx) {
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const fromRows = extractRecordsFromRows(rows);
    const fromMatrix = extractRecordsFromMatrix(matrix);
    return fromRows.length >= fromMatrix.length ? fromRows : fromMatrix;
  }

  const csvRows = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => csvRows.push(row))
      .on('end', resolve)
      .on('error', reject);
  });
  return extractRecordsFromRows(csvRows);
};

const buildSemesterPerformance = async (regno, transaction) => {
  const gradeRows = await StudentGrade.findAll({
    where: { regno },
    include: [
      {
        model: Course,
        attributes: ['courseCode', 'credits', 'semesterId'],
        required: false,
        include: [{ model: Semester, attributes: ['semesterId', 'semesterNumber'], required: false }]
      },
      {
        model: GradePoint,
        attributes: ['point'],
        required: false
      }
    ],
    transaction
  });

  // Safety: use only latest attempt per course code even if legacy duplicates exist in DB.
  const latestByCourse = new Map();
  const sortedRows = [...gradeRows].sort((a, b) => (b.gradeId || 0) - (a.gradeId || 0));
  for (const row of sortedRows) {
    const code = normalizeCode(row.courseCode);
    if (!code || latestByCourse.has(code)) continue;
    latestByCourse.set(code, row);
  }

  const bySemester = new Map();

  for (const row of latestByCourse.values()) {
    const course = row.Course;
    const semester = course?.Semester;
    if (!course || !semester || !course.credits || course.credits <= 0) continue;

    const semId = semester.semesterId;
    if (!bySemester.has(semId)) {
      bySemester.set(semId, {
        semesterId: semId,
        semesterNumber: semester.semesterNumber,
        semPoints: 0,
        semEarnedCredits: 0,
        semTotalCredits: 0,
        hasOutstandingFail: false
      });
    }

    const semData = bySemester.get(semId);
    semData.semTotalCredits += course.credits;

    if (row.grade === 'U') {
      semData.hasOutstandingFail = true;
      continue;
    }

    const point = row.GradePoint?.point ?? GRADE_POINTS[row.grade];
    if (point === null || point === undefined) continue;

    semData.semPoints += point * course.credits;
    semData.semEarnedCredits += course.credits;
  }

  const semesters = [...bySemester.values()].sort((a, b) => a.semesterNumber - b.semesterNumber);
  let cumulativePoints = 0;
  let cumulativeEarnedCredits = 0;
  let cumulativeTotalCredits = 0;
  let hasAnyOutstandingFail = false;
  let lastValidCgpa = null;

  for (const sem of semesters) {
    // Compute GPA against total semester credits so failures (U) are reflected as 0-point courses.
    const gpa = sem.semTotalCredits > 0 ? roundToTwo(sem.semPoints / sem.semTotalCredits) : null;

    cumulativePoints += sem.semPoints;
    cumulativeEarnedCredits += sem.semEarnedCredits;
    cumulativeTotalCredits += sem.semTotalCredits;
    hasAnyOutstandingFail = hasAnyOutstandingFail || sem.hasOutstandingFail;

    // CGPA freeze policy:
    // - If any arrear is outstanding, keep CGPA stuck at the last valid value.
    // - Once arrears are cleared (via arrear upload), recompute from earned credits.
    let cgpa = null;
    let cgpaFrozen = false;
    if (sem.semesterNumber > 1) {
      if (hasAnyOutstandingFail) {
        cgpa = lastValidCgpa;
        cgpaFrozen = true;
      } else if (cumulativeEarnedCredits > 0) {
        cgpa = roundToTwo(cumulativePoints / cumulativeEarnedCredits);
        lastValidCgpa = cgpa;
      }
    }

    sem.gpa = gpa;
    sem.cgpa = cgpa;
    sem.cumulativeQualityPoints = roundToTwo(cumulativePoints);
    sem.cumulativeEarnedCredits = roundToTwo(cumulativeEarnedCredits);
    sem.cumulativeTotalCredits = roundToTwo(cumulativeTotalCredits);
    sem.cgpaFrozen = cgpaFrozen;
    sem.hasOutstandingArrear = hasAnyOutstandingFail;
  }

  return semesters;
};

const validateSemesterProgressionForRegularUpload = async (records, requestedSemesterNumber, transaction) => {
  if (!requestedSemesterNumber || requestedSemesterNumber <= 1) return null;

  const regnos = [...new Set(records.map((r) => r.regno))];
  if (!regnos.length) return null;

  const rows = await StudentGrade.findAll({
    where: { regno: { [Op.in]: regnos } },
    include: [
      {
        model: Course,
        attributes: ['courseCode'],
        required: false,
        include: [{ model: Semester, attributes: ['semesterNumber'], required: false }]
      }
    ],
    attributes: ['regno'],
    transaction
  });

  const completedSemsByRegno = new Map();
  for (const row of rows) {
    const reg = row.regno;
    const semNo = row.Course?.Semester?.semesterNumber;
    if (!reg || !semNo) continue;
    if (!completedSemsByRegno.has(reg)) completedSemsByRegno.set(reg, new Set());
    completedSemsByRegno.get(reg).add(Number(semNo));
  }

  const invalid = [];
  for (const reg of regnos) {
    const completed = completedSemsByRegno.get(reg) || new Set();
    const missing = [];
    for (let semNo = 1; semNo < requestedSemesterNumber; semNo += 1) {
      if (!completed.has(semNo)) missing.push(semNo);
    }
    if (missing.length) invalid.push({ regno: reg, missing });
  }

  if (!invalid.length) return null;

  const sample = invalid.slice(0, 5)
    .map((x) => `${x.regno} (missing sem ${x.missing.join(',')})`)
    .join('; ');

  return {
    invalidCount: invalid.length,
    sample
  };
};

const recalculateStudentAcademicRows = async (regno, transaction) => {
  const semesterRows = await buildSemesterPerformance(regno, transaction);
  if (semesterRows.length === 0) return;

  for (const sem of semesterRows) {
    await StudentSemesterGPA.upsert({
      regno,
      semesterId: sem.semesterId,
      gpa: sem.gpa,
      cgpa: sem.cgpa,
      earnedCredits: roundToTwo(sem.semEarnedCredits),
      totalCredits: roundToTwo(sem.semTotalCredits),
      qualityPoints: roundToTwo(sem.semPoints),
      cumulativeEarnedCredits: sem.cumulativeEarnedCredits,
      cumulativeTotalCredits: sem.cumulativeTotalCredits,
      cumulativeQualityPoints: sem.cumulativeQualityPoints,
      hasOutstandingArrear: sem.hasOutstandingArrear,
      cgpaFrozen: sem.cgpaFrozen
    }, { transaction });
  }
};

const getCurrentGpa = async (regno, semesterId) => {
  const row = await StudentSemesterGPA.findOne({ where: { regno, semesterId } });
  return row?.gpa === null || row?.gpa === undefined ? null : roundToTwo(row.gpa);
};

const getCurrentCgpa = async (regno, semesterId) => {
  const row = await StudentSemesterGPA.findOne({ where: { regno, semesterId } });
  return row?.cgpa === null || row?.cgpa === undefined ? null : roundToTwo(row.cgpa);
};

export const uploadGrades = catchAsync(async (req, res) => {
  const { file } = req;
  const { semesterId, isNptel: isNptelRaw, uploadType: uploadTypeRaw } = req.body;
  const isNptel = String(isNptelRaw) === 'true';
  const uploadType = String(uploadTypeRaw || 'regular').toLowerCase();

  if (!file) {
    return res.status(400).json({ status: 'error', message: 'No file uploaded' });
  }
  if (!semesterId) {
    return res.status(400).json({ status: 'error', message: 'Semester ID is required' });
  }
  if (!['regular', 'arrear'].includes(uploadType)) {
    return res.status(400).json({ status: 'error', message: 'uploadType must be regular or arrear' });
  }

  let records = [];
  try {
    records = await parseGradeFile(file.path, file.originalname);
  } finally {
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  }

  const dedupMap = new Map();
  for (const record of records) {
    dedupMap.set(`${record.regno}|${record.courseCode}`, record);
  }
  records = [...dedupMap.values()];

  if (!records.length) {
    return res.json({
      status: 'success',
      message: 'No valid grades found in file',
      processed: 0
    });
  }

  const transaction = await sequelize.transaction();
  try {
    await ensureGradeSchemaReady(transaction);
    await ensureSemesterAnalyticsSchemaReady(transaction);

    const uniqueRegnos = [...new Set(records.map((r) => r.regno))];
    const students = await StudentDetails.findAll({
      where: { registerNumber: { [Op.in]: uniqueRegnos } },
      attributes: ['registerNumber'],
      transaction
    });
    const validRegnos = new Set(students.map((s) => s.registerNumber));
    const existingSemester = await Semester.findByPk(semesterId, { transaction });
    if (!existingSemester) {
      await transaction.rollback();
      return res.status(400).json({ status: 'error', message: 'Invalid semesterId' });
    }

    let filteredRecords = records.filter((r) => validRegnos.has(r.regno));
    if (!filteredRecords.length) {
      await transaction.rollback();
      return res.status(400).json({ status: 'error', message: 'No valid students found for uploaded grades' });
    }

    if (isNptel) {
      const activeNptelCourses = await NptelCourse.findAll({
        where: { isActive: 'YES' },
        attributes: ['courseCode'],
        transaction
      });
      const activeCodes = new Set(activeNptelCourses.map((c) => normalizeCode(c.courseCode)));
      const nptelEnrollments = await StudentNptelEnrollment.findAll({
        where: { regno: { [Op.in]: [...new Set(filteredRecords.map((r) => r.regno))] }, isActive: 'YES' },
        include: [{ model: NptelCourse, attributes: ['courseCode'], where: { isActive: 'YES' } }],
        transaction
      });
      const enrolledPairs = new Set(
        nptelEnrollments.map((e) => `${e.regno}|${normalizeCode(e.NptelCourse?.courseCode)}`)
      );

      filteredRecords = filteredRecords.filter((r) =>
        activeCodes.has(r.courseCode) &&
        enrolledPairs.has(`${r.regno}|${r.courseCode}`)
      );
    } else {
      const allCourseCodes = [...new Set(filteredRecords.map((r) => r.courseCode))];
      const courses = await Course.findAll({
        where: { courseCode: { [Op.in]: allCourseCodes } },
        attributes: ['courseCode', 'semesterId'],
        transaction
      });
      const courseByCode = new Map(courses.map((c) => [normalizeCode(c.courseCode), c]));

      filteredRecords = filteredRecords.filter((r) => {
        const course = courseByCode.get(r.courseCode);
        if (!course) return false;
        if (uploadType === 'regular') {
          return Number(course.semesterId) === Number(semesterId);
        }
        return true;
      });
    }

    if (!filteredRecords.length) {
      await transaction.rollback();
      return res.status(400).json({
        status: 'error',
        message: isNptel
          ? 'No valid enrolled NPTEL course grades found'
          : 'No valid course grades found for selected upload type'
      });
    }

    // Constraint: block direct higher-semester upload if prior semesters are missing.
    if (!isNptel && uploadType === 'regular') {
      const progressionIssue = await validateSemesterProgressionForRegularUpload(
        filteredRecords,
        Number(existingSemester.semesterNumber),
        transaction
      );
      if (progressionIssue) {
        await transaction.rollback();
        return res.status(400).json({
          status: 'error',
          message: `Cannot upload semester ${existingSemester.semesterNumber} directly. Complete grades for all previous semesters first.`,
          details: `${progressionIssue.invalidCount} student(s) missing prior semester grades. Sample: ${progressionIssue.sample}`
        });
      }
    }

    const affectedRegnos = new Set();

    for (const record of filteredRecords) {
      await StudentGrade.upsert({
        regno: record.regno,
        courseCode: record.courseCode,
        grade: record.grade
      }, { transaction });
      affectedRegnos.add(record.regno);
    }

    for (const regno of affectedRegnos) {
      await recalculateStudentAcademicRows(regno, transaction);
    }

    await transaction.commit();
    return res.json({
      status: 'success',
      message: isNptel
        ? 'NPTEL grades imported and academic metrics recalculated'
        : uploadType === 'arrear'
          ? 'Arrear grades updated and academic metrics recalculated'
          : 'Semester grades imported and academic metrics recalculated',
      processed: filteredRecords.length,
      affectedStudents: affectedRegnos.size
    });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

export const viewGPA = catchAsync(async (req, res) => {
  const { regno, semesterId } = req.query;
  if (!regno || !semesterId) {
    return res.status(400).json({ status: 'error', message: 'regno and semesterId are required' });
  }

  await recalculateStudentAcademicRows(regno, null);
  const gpa = await getCurrentGpa(regno, semesterId);
  return res.json({ gpa: gpa === null ? '-' : gpa.toFixed(2) });
});

export const viewCGPA = catchAsync(async (req, res) => {
  const { regno, upToSemesterId } = req.query;
  if (!regno || !upToSemesterId) {
    return res.status(400).json({ status: 'error', message: 'regno and upToSemesterId are required' });
  }

  const requestedSemester = await Semester.findByPk(upToSemesterId, { attributes: ['semesterNumber'] });
  if (requestedSemester?.semesterNumber === 1) {
    return res.json({ cgpa: '-' });
  }

  await recalculateStudentAcademicRows(regno, null);
  const cgpa = await getCurrentCgpa(regno, upToSemesterId);
  return res.json({ cgpa: cgpa === null ? '-' : cgpa.toFixed(2) });
});

export const getStudentsForGrade = catchAsync(async (req, res) => {
  const { branch, batch } = req.query;

  const rows = await StudentDetails.findAll({
    where: { batch },
    include: [
      {
        model: User,
        as: 'user',
        where: { roleId: { [Op.in]: [3, 4] }, status: 'Active' },
        attributes: ['userName']
      },
      {
        model: Department,
        as: 'department',
        where: { Deptacronym: branch },
        attributes: []
      }
    ],
    attributes: ['registerNumber', 'studentName'],
    order: [['registerNumber', 'ASC']]
  });

  const data = rows.map((row) => ({
    regno: row.registerNumber,
    name: row.user?.userName || row.studentName
  }));

  res.json({ status: 'success', data });
});

export const getStudentGpaHistory = catchAsync(async (req, res) => {
  const userId = req.user?.id || req.user?.userId;
  if (!userId) {
    return res.status(401).json({ status: 'fail', message: 'User not authenticated' });
  }

  const currentUser = await User.findByPk(userId, { attributes: ['userNumber'] });
  const regno = currentUser?.userNumber;
  if (!regno) {
    return res.status(404).json({ status: 'fail', message: 'Student profile not found' });
  }

  await recalculateStudentAcademicRows(regno, null);

  const history = await StudentSemesterGPA.findAll({
    where: { regno },
    include: [{ model: Semester, attributes: ['semesterNumber'] }],
    order: [[Semester, 'semesterNumber', 'ASC']]
  });

  const data = history.map((h) => ({
    semesterNumber: h.Semester?.semesterNumber,
    gpa: h.gpa === null || h.gpa === undefined ? null : roundToTwo(h.gpa),
    cgpa: h.cgpa === null || h.cgpa === undefined ? null : roundToTwo(h.cgpa),
    earnedCredits: roundToTwo(h.earnedCredits || 0),
    totalCredits: roundToTwo(h.totalCredits || 0),
    qualityPoints: roundToTwo(h.qualityPoints || 0),
    cumulativeEarnedCredits: roundToTwo(h.cumulativeEarnedCredits || 0),
    cumulativeTotalCredits: roundToTwo(h.cumulativeTotalCredits || 0),
    cumulativeQualityPoints: roundToTwo(h.cumulativeQualityPoints || 0),
    hasOutstandingArrear: Boolean(h.hasOutstandingArrear),
    cgpaFrozen: Boolean(h.cgpaFrozen)
  }));

  return res.status(200).json({ status: 'success', data });
});

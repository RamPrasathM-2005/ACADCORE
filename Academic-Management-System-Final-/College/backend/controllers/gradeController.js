// controllers/gradeController.js
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
  DepartmentAcademic, 
  NptelCourse, 
  StudentNptelEnrollment, 
  StudentSemesterGPA, 
  Batch 
} = db;

// GPA Utility — Current Semester Only
const getStudentGPA = async (regno, semesterId) => {
  const rows = await StudentGrade.findAll({
    where: { regno, grade: { [Op.ne]: 'U' } },
    include: [{
      model: Course,
      where: { semesterId, credits: { [Op.gt]: 0 } },
      attributes: ['credits']
    }, {
      model: GradePoint, // Assuming GradePoint primary key is 'grade'
      attributes: ['point']
    }]
  });

  if (!rows || rows.length === 0) return null;

  let totalPoints = 0;
  let totalCredits = 0;

  rows.forEach(row => {
    // Accessing through association aliases
    const credits = row.Course?.credits || 0;
    const point = row.GradePoint?.point || 0;
    totalPoints += credits * point;
    totalCredits += credits;
  });

  return totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : null;
};

// CGPA Utility — Up to current semesterNumber
const getStudentCGPA = async (regno, upToSemesterId) => {
  const targetSem = await Semester.findByPk(upToSemesterId);
  if (!targetSem) return null;

  const rows = await StudentGrade.findAll({
    where: { regno, grade: { [Op.ne]: 'U' } },
    include: [{
      model: Course,
      where: { credits: { [Op.gt]: 0 } },
      attributes: ['credits'],
      include: [{
        model: Semester,
        where: { semesterNumber: { [Op.lte]: targetSem.semesterNumber } },
        attributes: ['semesterNumber']
      }]
    }, {
      model: GradePoint,
      attributes: ['point']
    }]
  });

  if (!rows || rows.length === 0) return null;

  let totalPoints = 0;
  let totalCredits = 0;

  rows.forEach(row => {
    const credits = row.Course?.credits || 0;
    const point = row.GradePoint?.point || 0;
    totalPoints += credits * point;
    totalCredits += credits;
  });

  return totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : null;
};

export const uploadGrades = catchAsync(async (req, res) => {
  const { file } = req;
  const { semesterId, isNptel: isNptelRaw } = req.body;
  const isNptel = isNptelRaw === 'true';

  if (!file) return res.status(400).json({ status: 'error', message: 'No file uploaded' });
  if (!semesterId) return res.status(400).json({ status: 'error', message: 'Semester ID is required' });

  const records = [];
  const isXLSX = file.originalname.match(/\.(xlsx|xls)$/i);

  // --- Parsing Logic ---
  if (isXLSX) {
    const wb = XLSX.readFile(file.path);
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    if (data.length > 1) {
      const headers = data[0].map(h => h?.toString().trim());
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const regno = row[0]?.toString().trim();
        if (!regno) continue;
        for (let j = 1; j < headers.length; j++) {
          const courseCode = headers[j];
          const rawGrade = row[j]?.toString().trim().toUpperCase();
          if (courseCode && rawGrade && ['O', 'A+', 'A', 'B+', 'B', 'U'].includes(rawGrade)) {
            records.push({ regno, courseCode, grade: rawGrade });
          }
        }
      }
    }
  } else {
    await new Promise((resolve) => {
      fs.createReadStream(file.path).pipe(csv())
        .on('data', (row) => {
          const regno = row.regno?.trim();
          if (!regno) return;
          Object.keys(row).forEach(key => {
            if (key.toLowerCase() === 'regno') return;
            const grade = row[key]?.trim().toUpperCase();
            if (['O', 'A+', 'A', 'B+', 'B', 'U'].includes(grade)) {
              records.push({ regno, courseCode: key.trim(), grade });
            }
          });
        })
        .on('end', resolve);
    });
  }
  fs.unlinkSync(file.path);

  if (records.length === 0) return res.json({ status: 'success', message: 'No valid grades found', processed: 0 });

  // --- Database Logic ---
  const transaction = await sequelize.transaction();
  try {
    const successfullyProcessedRegnos = new Set();
    
    // NPTEL Pre-validation
    let finalRecords = records;
    if (isNptel) {
      const activeNptel = await NptelCourse.findAll({ where: { isActive: 'YES' }, attributes: ['courseCode'], transaction });
      const validCodes = new Set(activeNptel.map(c => c.courseCode));
      
      finalRecords = [];
      for (const r of records) {
        if (!validCodes.has(r.courseCode)) continue;
        const enrollment = await StudentNptelEnrollment.findOne({
          where: { regno: r.regno, isActive: 'YES' },
          include: [{ model: NptelCourse, where: { courseCode: r.courseCode } }],
          transaction
        });
        if (enrollment) finalRecords.push(r);
      }
    }

    // Processing Upserts
    for (const r of finalRecords) {
      const student = await StudentDetails.findOne({ where: { registerNumber: r.regno }, transaction });
      if (!student) continue;

      if (!isNptel) {
        const course = await Course.findOne({ where: { courseCode: r.courseCode }, transaction });
        if (!course) continue;
      }

      // Sequelize Upsert (Insert or Update on duplicate key)
      await StudentGrade.upsert({
        regno: r.regno,
        courseCode: r.courseCode,
        grade: r.grade
      }, { transaction });

      successfullyProcessedRegnos.add(r.regno);
    }

    // Recalculate GPA/CGPA for affected students
    for (const regno of successfullyProcessedRegnos) {
      const gpaValue = await getStudentGPA(regno, semesterId);
      const cgpaValue = await getStudentCGPA(regno, semesterId);

      await StudentSemesterGPA.upsert({
        regno,
        semesterId,
        gpa: gpaValue ? parseFloat(gpaValue) : null,
        cgpa: cgpaValue ? parseFloat(cgpaValue) : null
      }, { transaction });
    }

    await transaction.commit();
    res.json({ 
      status: 'success', 
      message: isNptel ? 'NPTEL Grades Processed' : 'Grades & GPA Updated',
      processed: finalRecords.length 
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export const viewGPA = catchAsync(async (req, res) => {
  const { regno, semesterId } = req.query;
  const gpa = await getStudentGPA(regno, semesterId);
  res.json({ gpa: gpa || '-' });
});

export const viewCGPA = catchAsync(async (req, res) => {
  const { regno, upToSemesterId } = req.query;
  const cgpa = await getStudentCGPA(regno, upToSemesterId);
  res.json({ cgpa: cgpa || '-' });
});

export const getStudentsForGrade = catchAsync(async (req, res) => {
  const { branch, batch } = req.query;

  const rows = await StudentDetails.findAll({
    where: { batch },
    include: [
      {
        model: User,
        as: 'userAccount',
        where: { roleId: 3, status: 'Active' }, // Assuming 3 is Student
        attributes: [['userName', 'name']]
      },
      {
        model: DepartmentAcademic,
        as: 'department',
        where: { Deptacronym: branch },
        attributes: []
      }
    ],
    attributes: [['registerNumber', 'regno']],
    order: [['registerNumber', 'ASC']]
  });

  res.json({ status: 'success', data: rows });
});

export const getStudentGpaHistory = catchAsync(async (req, res) => {
  const userId = req.user.id; 

  const student = await StudentDetails.findOne({
    where: { [Op.or]: [{ registerNumber: req.user.userNumber }, { studentId: userId }] }
  });

  if (!student) return res.status(404).json({ status: 'fail', message: 'Profile not found' });

  const history = await StudentSemesterGPA.findAll({
    where: { regno: student.registerNumber },
    include: [{
      model: Semester,
      attributes: ['semesterNumber']
    }],
    order: [[Semester, 'semesterNumber', 'ASC']]
  });

  const data = history.map(h => ({
    semesterNumber: h.Semester?.semesterNumber,
    gpa: h.gpa ? parseFloat(h.gpa) : null,
    cgpa: h.cgpa ? parseFloat(h.cgpa) : null
  }));

  res.status(200).json({ status: 'success', data });
});
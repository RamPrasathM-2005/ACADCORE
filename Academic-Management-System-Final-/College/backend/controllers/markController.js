import models from '../models/index.js';
const { 
  Course, 
  StaffCourse, 
  CoursePartitions, 
  CourseOutcome, 
  COType, 
  COTool, 
  ToolDetails, 
  StudentCOTool, 
  StudentDetails, 
  User, 
  StudentCOMarks, 
  Section, 
  Department, 
  Semester, 
  Batch,
  sequelize 
} = models;

import { Op } from 'sequelize';
import csv from 'csv-parser';
import { createObjectCsvWriter as createCsvWriter } from 'csv-writer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';
import catchAsync from '../utils/catchAsync.js';

// Helper to get Userid from req.user
const getStaffId = (req) => {
  if (!req.user || !req.user.userId) {
    throw new Error('Authentication required: No user or userId provided');
  }
  return String(req.user.userId);
};

// 1. GET COURSE PARTITIONS
export const getCoursePartitions = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const userId = getStaffId(req);

  const course = await Course.findOne({
    where: sequelize.where(sequelize.fn('LOWER', sequelize.col('courseCode')), courseCode.toLowerCase()),
    include: [{ model: StaffCourse, where: { Userid: userId }, required: true }]
  });

  if (!course) return res.status(404).json({ status: 'error', message: 'Course not found or assigned' });

  const partition = await CoursePartitions.findOne({ where: { courseId: course.courseId } });
  res.json({ status: 'success', data: partition || { theoryCount: 0, practicalCount: 0, experientialCount: 0, courseId: course.courseId } });
});

// 2. SAVE COURSE PARTITIONS
export const saveCoursePartitions = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const { theoryCount, practicalCount, experientialCount } = req.body;
  const staffId = getStaffId(req);

  const course = await Course.findOne({
    where: sequelize.where(sequelize.fn('LOWER', sequelize.col('courseCode')), courseCode.toLowerCase()),
    include: [{ model: StaffCourse, where: { Userid: staffId }, required: true }]
  });

  const t = await sequelize.transaction();
  try {
    const result = await CoursePartitions.create({ courseId: course.courseId, theoryCount, practicalCount, experientialCount, createdBy: staffId, updatedBy: staffId }, { transaction: t });
    let coNumber = 1;
    const types = [{ label: 'THEORY', count: theoryCount }, { label: 'PRACTICAL', count: practicalCount }, { label: 'EXPERIENTIAL', count: experientialCount }];
    for (const item of types) {
      for (let i = 0; i < item.count; i++) {
        const co = await CourseOutcome.create({ courseId: course.courseId, coNumber: `CO${coNumber}` }, { transaction: t });
        await COType.create({ coId: co.coId, coType: item.label, createdBy: staffId, updatedBy: staffId }, { transaction: t });
        coNumber++;
      }
    }
    await t.commit();
    res.json({ status: 'success', message: 'Saved successfully' });
  } catch (err) { await t.rollback(); throw err; }
});

// 3. UPDATE COURSE PARTITIONS
export const updateCoursePartitions = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const { theoryCount, practicalCount, experientialCount } = req.body;
  const staffId = getStaffId(req);

  const course = await Course.findOne({
    where: sequelize.where(sequelize.fn('LOWER', sequelize.col('courseCode')), courseCode.toLowerCase()),
    include: [{ model: StaffCourse, where: { Userid: staffId }, required: true }]
  });

  const t = await sequelize.transaction();
  try {
    await CoursePartitions.update({ theoryCount, practicalCount, experientialCount, updatedBy: staffId }, { where: { courseId: course.courseId }, transaction: t });
    const existing = await CourseOutcome.findAll({ where: { courseId: course.courseId }, include: [COType], transaction: t });

    const sync = async (label, count, list) => {
      while (list.length > count) {
        const d = list.pop();
        await COType.destroy({ where: { coId: d.coId }, transaction: t });
        await CourseOutcome.destroy({ where: { coId: d.coId }, transaction: t });
      }
      while (list.length < count) {
        const co = await CourseOutcome.create({ courseId: course.courseId, coNumber: 'TMP' }, { transaction: t });
        await COType.create({ coId: co.coId, coType: label, createdBy: staffId }, { transaction: t });
        list.push(co);
      }
    };

    let th = existing.filter(c => c.COType?.coType === 'THEORY');
    let pr = existing.filter(c => c.COType?.coType === 'PRACTICAL');
    let ex = existing.filter(c => c.COType?.coType === 'EXPERIENTIAL');

    await sync('THEORY', theoryCount, th);
    await sync('PRACTICAL', practicalCount, pr);
    await sync('EXPERIENTIAL', experientialCount, ex);

    const all = [...th, ...pr, ...ex];
    for (let i = 0; i < all.length; i++) {
      await CourseOutcome.update({ coNumber: `CO${i + 1}` }, { where: { coId: all[i].coId }, transaction: t });
    }
    await t.commit();
    res.json({ status: 'success', message: 'Updated' });
  } catch (err) { await t.rollback(); throw err; }
});

// 4. GET COS FOR COURSE
export const getCOsForCourse = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const userId = getStaffId(req);
  const course = await Course.findOne({
    where: sequelize.where(sequelize.fn('UPPER', sequelize.col('courseCode')), courseCode.toUpperCase()),
    include: [{ model: StaffCourse, where: { Userid: userId }, required: true }]
  });
  const cos = await CourseOutcome.findAll({ where: { courseId: course.courseId }, include: [COType], order: [['coNumber', 'ASC']] });
  res.json({ status: 'success', data: cos });
});

// 5. TOOLS
export const getToolsForCO = catchAsync(async (req, res) => {
  const { coId } = req.params;
  const tools = await COTool.findAll({ where: { coId }, include: [ToolDetails] });
  res.json({ status: 'success', data: tools });
});

export const saveToolsForCO = catchAsync(async (req, res) => {
  const { coId } = req.params;
  const { tools } = req.body;
  const staffId = getStaffId(req);
  const t = await sequelize.transaction();
  try {
    const existing = await COTool.findAll({ where: { coId } });
    const existingIds = existing.map(e => e.toolId);
    const inputIds = tools.filter(i => i.toolId).map(i => i.toolId);
    const toDelete = existingIds.filter(id => !inputIds.includes(id));
    
    if (toDelete.length) {
      await ToolDetails.destroy({ where: { toolId: toDelete }, transaction: t });
      await COTool.destroy({ where: { toolId: toDelete }, transaction: t });
    }

    for (const tool of tools) {
      if (tool.toolId && existingIds.includes(tool.toolId)) {
        await COTool.update({ toolName: tool.toolName, weightage: tool.weightage }, { where: { toolId: tool.toolId }, transaction: t });
        await ToolDetails.update({ maxMarks: tool.maxMarks, updatedBy: staffId }, { where: { toolId: tool.toolId }, transaction: t });
      } else {
        const nt = await COTool.create({ coId, toolName: tool.toolName, weightage: tool.weightage }, { transaction: t });
        await ToolDetails.create({ toolId: nt.toolId, maxMarks: tool.maxMarks, createdBy: staffId }, { transaction: t });
      }
    }
    await t.commit();
    res.json({ status: 'success', message: 'Tools saved' });
  } catch (err) { await t.rollback(); throw err; }
});

// 6. SINGLE TOOL CRUD
export const createTool = catchAsync(async (req, res) => {
  const { coId } = req.params;
  const { toolName, weightage, maxMarks } = req.body;
  const t = await sequelize.transaction();
  try {
    const tool = await COTool.create({ coId, toolName, weightage }, { transaction: t });
    await ToolDetails.create({ toolId: tool.toolId, maxMarks, createdBy: req.user.userMail }, { transaction: t });
    await t.commit();
    res.status(201).json(tool);
  } catch (err) { await t.rollback(); throw err; }
});

export const updateTool = catchAsync(async (req, res) => {
  const { toolId } = req.params;
  const { toolName, weightage, maxMarks } = req.body;
  const t = await sequelize.transaction();
  try {
    await COTool.update({ toolName, weightage }, { where: { toolId }, transaction: t });
    await ToolDetails.update({ maxMarks, updatedBy: getStaffId(req) }, { where: { toolId }, transaction: t });
    await t.commit();
    res.json({ status: 'success' });
  } catch (err) { await t.rollback(); throw err; }
});

export const deleteTool = catchAsync(async (req, res) => {
  const { toolId } = req.params;
  const t = await sequelize.transaction();
  try {
    await ToolDetails.destroy({ where: { toolId }, transaction: t });
    await COTool.destroy({ where: { toolId }, transaction: t });
    await t.commit();
    res.json({ status: 'success' });
  } catch (err) { await t.rollback(); throw err; }
});

// 7. MARKS
export const getStudentMarksForTool = catchAsync(async (req, res) => {
  const { toolId } = req.params;
  const marks = await StudentCOTool.findAll({ where: { toolId }, include: [{ model: StudentDetails }] });
  res.json({ status: 'success', data: marks });
});

export const saveStudentMarksForTool = catchAsync(async (req, res) => {
  const { toolId } = req.params;
  const { marks } = req.body;
  const staffId = getStaffId(req);
  const tool = await COTool.findByPk(toolId, { include: [ToolDetails, CourseOutcome] });
  const t = await sequelize.transaction();
  try {
    for (const m of marks) {
      await StudentCOTool.upsert({ regno: m.regno, toolId, marksObtained: m.marksObtained }, { transaction: t });
      const coTools = await COTool.findAll({ where: { coId: tool.coId }, include: [ToolDetails], transaction: t });
      let consolidated = 0;
      for (const ct of coTools) {
        const sm = await StudentCOTool.findOne({ where: { regno: m.regno, toolId: ct.toolId }, transaction: t });
        consolidated += ((sm?.marksObtained || 0) / ct.ToolDetail.maxMarks) * (ct.weightage / 100);
      }
      await StudentCOMarks.upsert({ regno: m.regno, coId: tool.coId, consolidatedMark: (consolidated * 100).toFixed(2), updatedBy: staffId }, { transaction: t });
    }
    await t.commit();
    res.json({ status: 'success' });
  } catch (err) { await t.rollback(); throw err; }
});

// 8. IMPORT/EXPORT
export const importMarksForTool = catchAsync(async (req, res) => {
  const { toolId } = req.params;
  const results = [];
  const stream = Readable.from(req.file.buffer);
  await new Promise((resolve, reject) => { stream.pipe(csv()).on('data', d => results.push(d)).on('end', resolve).on('error', reject); });
  const tool = await COTool.findByPk(toolId, { include: [ToolDetails, CourseOutcome] });
  const t = await sequelize.transaction();
  try {
    for (const row of results) {
      const regno = row.regNo || row.regno;
      const marks = parseFloat(row.marks);
      if (!regno || isNaN(marks)) continue;
      await StudentCOTool.upsert({ regno, toolId, marksObtained: marks }, { transaction: t });
      const coTools = await COTool.findAll({ where: { coId: tool.coId }, include: [ToolDetails], transaction: t });
      let con = 0;
      for (const ct of coTools) {
        const sm = await StudentCOTool.findOne({ where: { regno, toolId: ct.toolId }, transaction: t });
        con += ((sm?.marksObtained || 0) / ct.ToolDetail.maxMarks) * (ct.weightage / 100);
      }
      await StudentCOMarks.upsert({ regno, coId: tool.coId, consolidatedMark: (con * 100).toFixed(2), updatedBy: getStaffId(req) }, { transaction: t });
    }
    await t.commit();
    res.json({ status: 'success' });
  } catch (err) { await t.rollback(); throw err; }
});

export const exportCoWiseCsv = catchAsync(async (req, res) => {
  const { coId } = req.params;
  const co = await CourseOutcome.findByPk(coId, { include: [Course] });
  const tools = await COTool.findAll({ where: { coId }, include: [ToolDetails] });
  const students = await StudentDetails.findAll({ include: [{ model: StudentCourse, where: { courseId: co.courseId } }] });
  const header = [{ id: 'regno', title: 'Reg No' }, { id: 'name', title: 'Name' }, ...tools.map(t => ({ id: t.toolName, title: t.toolName })), { id: 'con', title: 'Consolidated' }];
  const data = await Promise.all(students.map(async s => {
    const row = { regno: s.registerNumber, name: s.studentName };
    for (const t of tools) { row[t.toolName] = (await StudentCOTool.findOne({ where: { regno: s.registerNumber, toolId: t.toolId } }))?.marksObtained || 0; }
    row.con = (await StudentCOMarks.findOne({ where: { regno: s.registerNumber, coId } }))?.consolidatedMark || '0.00';
    return row;
  }));
  const filePath = path.join(os.tmpdir(), `CO_${coId}.csv`);
  await createCsvWriter({ path: filePath, header }).writeRecords(data);
  res.download(filePath, () => fs.unlinkSync(filePath));
});

// 9. STAFF LOGIC
export const getMyCourses = catchAsync(async (req, res) => {
  const userId = getStaffId(req);
  const rows = await StaffCourse.findAll({ where: { Userid: userId }, include: [{ model: Course, include: [{ model: Semester, include: [Batch] }] }, { model: Section }, { model: Department }] });
  const groupedMap = new Map();
  rows.forEach(row => {
    const key = `${row.Course.courseTitle}-${row.Course.Semester.Batch.batchYears}`;
    if (!groupedMap.has(key)) {
      groupedMap.set(key, { title: row.Course.courseTitle, semester: row.Course.Semester.semesterNumber, batch: row.Course.Semester.Batch.batch, courseCodes: [row.Course.courseCode], id: row.Course.courseCode, displayCode: row.Course.courseCode });
    } else {
      const e = groupedMap.get(key);
      if (!e.courseCodes.includes(row.Course.courseCode)) e.courseCodes.push(row.Course.courseCode);
      e.id = e.courseCodes.join('_'); e.displayCode = e.courseCodes.join(' / ');
    }
  });
  res.json({ status: 'success', data: Array.from(groupedMap.values()) });
});

// 10. CONSOLIDATED
export const getConsolidatedMarks = catchAsync(async (req, res) => {
  const { batch, dept, sem } = req.query;
  const d = await Department.findOne({ where: { Deptacronym: dept } });
  const b = await Batch.findOne({ where: { batch, branch: dept } });
  const s = await Semester.findOne({ where: { batchId: b.batchId, semesterNumber: sem } });
  const students = await StudentDetails.findAll({ where: { departmentId: d.Deptid, batch, semester: sem } });
  const courses = await Course.findAll({ where: { semesterId: s.semesterId }, include: [CoursePartitions] });
  const cos = await CourseOutcome.findAll({ where: { courseId: courses.map(c => c.courseId) }, include: [COType] });
  const marks = await StudentCOMarks.findAll({ where: { regno: students.map(st => st.registerNumber), coId: cos.map(c => c.coId) } });
  const map = {};
  students.forEach(st => {
    map[st.registerNumber] = {};
    courses.forEach(c => {
      map[st.registerNumber][c.courseCode] = { theory: '0.00', practical: '0.00', experiential: '0.00' };
      ['THEORY', 'PRACTICAL', 'EXPERIENTIAL'].forEach(t => {
        const tc = cos.filter(co => co.courseId === c.courseId && co.COType?.coType === t);
        if (tc.length) {
          const sum = tc.reduce((acc, co) => acc + parseFloat(marks.find(m => m.regno === st.registerNumber && m.coId === co.coId)?.consolidatedMark || 0), 0);
          map[st.registerNumber][c.courseCode][t.toLowerCase()] = (sum / tc.length).toFixed(2);
        }
      });
    });
  });
  res.json({ status: 'success', data: { students, courses, marks: map } });
});

// 11. ADMIN FUNCTIONS (The ones you were missing)
export const getCOsForCourseAdmin = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const course = await Course.findOne({ where: { courseCode: courseCode.toUpperCase() } });
  if (!course) return res.status(404).json({ status: 'error', message: 'Course not found' });
  const cos = await CourseOutcome.findAll({ where: { courseId: course.courseId }, include: [COType], order: [['coNumber', 'ASC']] });
  res.json({ status: 'success', data: cos });
});

export const getStudentCOMarksAdmin = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const course = await Course.findOne({ where: { courseCode } });
  const cos = await CourseOutcome.findAll({ where: { courseId: course.courseId }, include: [COType] });
  const students = await StudentDetails.findAll({ include: [{ model: StudentCourse, where: { courseId: course.courseId } }] });
  const marks = await StudentCOMarks.findAll({ where: { coId: cos.map(c => c.coId), regno: students.map(s => s.registerNumber) } });
  const resData = students.map(s => {
    const mks = {};
    cos.forEach(co => { mks[co.coNumber] = marks.find(m => m.regno === s.registerNumber && m.coId === co.coId)?.consolidatedMark || '0.00'; });
    return { regno: s.registerNumber, name: s.studentName, marks: mks };
  });
  res.json({ status: 'success', data: { students: resData, partitions: { theoryCount: cos.filter(c => c.COType?.coType === 'THEORY').length, practicalCount: cos.filter(c => c.COType?.coType === 'PRACTICAL').length, experientialCount: cos.filter(c => c.COType?.coType === 'EXPERIENTIAL').length } } });
});

export const updateStudentCOMarkAdmin = catchAsync(async (req, res) => {
  const { regno, coId } = req.params;
  const { consolidatedMark } = req.body;
  await StudentCOMarks.upsert({ regno, coId, consolidatedMark, updatedBy: 'admin' });
  res.json({ status: 'success' });
});

export const exportCourseWiseCsvAdmin = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const course = await Course.findOne({ where: { courseCode } });
  const cos = await CourseOutcome.findAll({ where: { courseId: course.courseId }, include: [COType] });
  const students = await StudentDetails.findAll({ include: [{ model: StudentCourse, where: { courseId: course.courseId } }] });
  const header = [{ id: 'regno', title: 'Reg No' }, { id: 'name', title: 'Name' }, ...cos.map(c => ({ id: c.coNumber, title: c.coNumber })), { id: 'avg', title: 'Average' }];
  const data = await Promise.all(students.map(async s => {
    const row = { regno: s.registerNumber, name: s.studentName }; let sum = 0;
    for (const co of cos) { const val = parseFloat((await StudentCOMarks.findOne({ where: { regno: s.registerNumber, coId: co.coId } }))?.consolidatedMark || 0); row[co.coNumber] = val.toFixed(2); sum += val; }
    row.avg = (sum / cos.length).toFixed(2); return row;
  }));
  const fp = path.join(os.tmpdir(), `Admin_${courseCode}.csv`);
  await createCsvWriter({ path: fp, header }).writeRecords(data);
  res.download(fp, () => fs.unlinkSync(fp));
});

export const getStudentsForCourseAdmin = catchAsync(async (req, res) => {
    const { courseCode } = req.params;
    const students = await StudentDetails.findAll({ include: [{ model: StudentCourse, required: true, include: [{ model: Course, where: { courseCode: courseCode.toUpperCase() } }] }] });
    res.json({ status: 'success', data: students });
});

export const getStudentCOMarksBySection = catchAsync(async (req, res) => {
  const { courseCode, sectionId } = req.params;
  const staffId = getStaffId(req);
  const course = await Course.findOne({ where: { courseCode } });
  const cos = await CourseOutcome.findAll({ where: { courseId: course.courseId }, include: [COType] });
  const students = await StudentDetails.findAll({ include: [{ model: StudentCourse, where: { courseId: course.courseId, sectionId } }] });
  const marks = await StudentCOMarks.findAll({ where: { coId: cos.map(c => c.coId), regno: students.map(s => s.registerNumber) } });
  const resData = students.map(s => {
    const mks = {};
    cos.forEach(co => { mks[co.coNumber] = marks.find(m => m.regno === s.registerNumber && m.coId === co.coId)?.consolidatedMark || '0.00'; });
    return { regno: s.registerNumber, name: s.studentName, marks: mks };
  });
  res.json({ status: 'success', data: { students: resData } });
});

export const updateStudentCOMarkByCoId = catchAsync(async (req, res) => {
  const { regno, coId } = req.params;
  const { consolidatedMark } = req.body;
  await StudentCOMarks.upsert({ regno, coId, consolidatedMark, updatedBy: getStaffId(req) });
  res.json({ status: 'success' });
});

export const getStudentsForSection = catchAsync(async (req, res) => {
  const { courseCode, sectionId } = req.params;
  const students = await StudentDetails.findAll({ include: [{ model: StudentCourse, where: { sectionId }, include: [{ model: Course, where: { courseCode } }] }] });
  res.json({ status: 'success', data: students });
});


export const exportCourseWiseCsv = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const staffId = getStaffId(req);

  // 1. Fetch course details
  const course = await Course.findOne({ 
    where: { courseCode: courseCode.toUpperCase() } 
  });
  
  if (!course) {
    return res.status(404).json({ status: 'error', message: `Course ${courseCode} not found` });
  }

  // 2. Verify if staff is assigned to the course
  const staffAssignment = await StaffCourse.findOne({
    where: { courseId: course.courseId, Userid: staffId }
  });

  if (!staffAssignment) {
    return res.status(403).json({
      status: 'error',
      message: `User ${staffId} is not assigned to course ${courseCode}`,
    });
  }

  // 3. Fetch course outcomes with their types
  const cos = await CourseOutcome.findAll({
    where: { courseId: course.courseId },
    include: [{ model: COType }],
    order: [['coNumber', 'ASC']]
  });

  // 4. Fetch students enrolled in the staff's section for this course
  const students = await StudentDetails.findAll({
    include: [{
      model: StudentCourse,
      required: true,
      where: { 
        courseId: course.courseId,
        sectionId: {
          [Op.in]: sequelize.literal(`(SELECT sectionId FROM StaffCourse WHERE Userid = ${staffId} AND courseId = ${course.courseId})`)
        }
      }
    }]
  });

  if (!students.length) {
    return res.status(404).json({ status: 'error', message: 'No students found in your section' });
  }

  // 5. Fetch all marks for these students and these COs
  const coMarks = await StudentCOMarks.findAll({
    where: {
      coId: cos.map(c => c.coId),
      regno: students.map(s => s.registerNumber)
    }
  });

  // 6. Map marks by student for easy lookup
  const coMarksMap = coMarks.reduce((acc, cm) => {
    if (!acc[cm.regno]) acc[cm.regno] = {};
    acc[cm.regno][cm.coId] = parseFloat(cm.consolidatedMark) || 0;
    return acc;
  }, {});

  // 7. Define CSV header
  const header = [
    { id: 'regNo', title: 'Reg No' },
    { id: 'name', title: 'Name' },
    ...cos.map(co => ({ id: co.coNumber, title: co.coNumber })),
    { id: 'avgTheory', title: 'Theory Avg' },
    { id: 'avgPractical', title: 'Practical Avg' },
    { id: 'avgExperiential', title: 'Experiential Avg' },
    { id: 'finalAvg', title: 'Final Avg' },
  ];

  // 8. Prepare CSV data with average calculations
  const data = students.map(student => {
    const regno = student.registerNumber;
    let theorySum = 0, theoryCount = 0;
    let pracSum = 0, pracCount = 0;
    let expSum = 0, expCount = 0;
    const marksRow = { regNo: regno, name: student.studentName };

    cos.forEach(co => {
      const mark = coMarksMap[regno]?.[co.coId] || 0;
      marksRow[co.coNumber] = mark.toFixed(2);

      const type = co.COType?.coType;
      if (type === 'THEORY') { theorySum += mark; theoryCount++; }
      else if (type === 'PRACTICAL') { pracSum += mark; pracCount++; }
      else if (type === 'EXPERIENTIAL') { expSum += mark; expCount++; }
    });

    marksRow.avgTheory = theoryCount ? (theorySum / theoryCount).toFixed(2) : '0.00';
    marksRow.avgPractical = pracCount ? (pracSum / pracCount).toFixed(2) : '0.00';
    marksRow.avgExperiential = expCount ? (expSum / expCount).toFixed(2) : '0.00';

    const categories = [
      { count: theoryCount, avg: parseFloat(marksRow.avgTheory) },
      { count: pracCount, avg: parseFloat(marksRow.avgPractical) },
      { count: expCount, avg: parseFloat(marksRow.avgExperiential) }
    ].filter(c => c.count > 0);

    marksRow.finalAvg = categories.length 
      ? (categories.reduce((s, c) => s + c.avg, 0) / categories.length).toFixed(2)
      : '0.00';

    return marksRow;
  });

  // 9. Generate and send file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${courseCode}_marks_${timestamp}.csv`;
  const filePath = path.join(os.tmpdir(), filename);

  const csvWriter = createCsvWriter({ path: filePath, header });
  await csvWriter.writeRecords(data);

  res.download(filePath, filename, (err) => {
    if (err) console.error('Error sending file:', err);
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) console.error('Error deleting file:', unlinkErr);
    });
  });
});




export const getStudentCOMarks = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const staffId = getStaffId(req);

  // 1. Fetch course details
  const course = await Course.findOne({ 
    where: { courseCode: courseCode.toUpperCase() } 
  });

  if (!course) {
    return res.status(404).json({ status: 'error', message: `Course ${courseCode} not found` });
  }

  // 2. Verify staff assignment
  const staffAssignment = await StaffCourse.findOne({
    where: { courseId: course.courseId, Userid: staffId }
  });

  if (!staffAssignment) {
    return res.status(403).json({
      status: 'error',
      message: `User ${staffId} is not assigned to course ${courseCode}`,
    });
  }

  // 3. Fetch consolidated marks with CO and Student details
  // Filtered by staff's sections using a literal subquery
  const coMarks = await StudentCOMarks.findAll({
    include: [
      {
        model: CourseOutcome,
        where: { courseId: course.courseId },
        include: [{ model: COType }]
      },
      {
        model: StudentDetails,
        required: true,
        include: [{
          model: StudentCourse,
          where: { 
            courseId: course.courseId,
            sectionId: {
              [Op.in]: sequelize.literal(`(SELECT sectionId FROM StaffCourse WHERE Userid = ${staffId} AND courseId = ${course.courseId})`)
            }
          }
        }]
      }
    ],
    order: [
      [StudentDetails, 'registerNumber', 'ASC'],
      [CourseOutcome, 'coNumber', 'ASC']
    ]
  });

  // 4. Fetch course partitions for meta data
  const partitions = await CoursePartitions.findOne({ 
    where: { courseId: course.courseId } 
  });
  const partitionData = partitions || { theoryCount: 0, practicalCount: 0, experientialCount: 0 };

  // 5. Structure response and calculate averages
  const marksByStudent = {};

  coMarks.forEach(record => {
    const regno = record.regno;
    const co = record.CourseOutcome;
    
    if (!marksByStudent[regno]) {
      marksByStudent[regno] = {
        regno: regno,
        name: record.StudentDetail.studentName,
        marks: {},
        averages: { theory: null, practical: null, experiential: null, finalAvg: null }
      };
    }

    const markValue = record.consolidatedMark != null ? parseFloat(record.consolidatedMark).toFixed(2) : '0.00';
    
    marksByStudent[regno].marks[co.coNumber] = {
      coId: co.coId,
      coType: co.COType?.coType || null,
      consolidatedMark: markValue
    };
  });

  // 6. Calculate averages for each student
  const processedStudents = Object.values(marksByStudent).map(student => {
    let theorySum = 0, theoryCount = 0;
    let practicalSum = 0, practicalCount = 0;
    let experientialSum = 0, experientialCount = 0;

    Object.values(student.marks).forEach(m => {
      const val = parseFloat(m.consolidatedMark) || 0;
      if (m.coType === 'THEORY') { theorySum += val; theoryCount++; }
      else if (m.coType === 'PRACTICAL') { practicalSum += val; practicalCount++; }
      else if (m.coType === 'EXPERIENTIAL') { experientialSum += val; experientialCount++; }
    });

    student.averages.theory = theoryCount > 0 ? (theorySum / theoryCount).toFixed(2) : null;
    student.averages.practical = practicalCount > 0 ? (practicalSum / practicalCount).toFixed(2) : null;
    student.averages.experiential = experientialCount > 0 ? (experientialSum / experientialCount).toFixed(2) : null;

    const activeAvgs = [
      student.averages.theory, 
      student.averages.practical, 
      student.averages.experiential
    ].filter(a => a !== null).map(a => parseFloat(a));

    student.averages.finalAvg = activeAvgs.length > 0 
      ? (activeAvgs.reduce((s, a) => s + a, 0) / activeAvgs.length).toFixed(2) 
      : '0.00';

    return student;
  });

  res.json({
    status: 'success',
    data: {
      students: processedStudents,
      partitions: partitionData
    }
  });
});

export const getStudentsForCourse = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const userId = getStaffId(req);

  // 1. First, find all courseIds and sectionIds assigned to this staff for the given courseCode
  const staffAssignments = await StaffCourse.findAll({
    where: { Userid: userId },
    include: [
      {
        model: Course,
        where: { 
          courseCode: courseCode.toUpperCase(),
          isActive: 'YES' 
        },
        attributes: ['courseId', 'courseCode']
      },
      {
        model: Section,
        where: { isActive: 'YES' },
        attributes: ['sectionId', 'sectionName']
      }
    ]
  });

  if (!staffAssignments.length) {
    return res.status(404).json({
      status: 'error',
      message: `Course '${courseCode}' not found or not assigned to you.`,
    });
  }

  // Extract the specific courseIds and sectionIds assigned to this staff
  const assignedCourseIds = staffAssignments.map(a => a.courseId);
  const assignedSectionIds = staffAssignments.map(a => a.sectionId);

  // 2. Fetch the students enrolled in these specific course-section combinations
  const students = await StudentDetails.findAll({
    attributes: ['registerNumber', 'studentName'],
    include: [
      {
        model: User,
        as: 'studentProfile', // Uses the alias from your User model
        attributes: ['userName'],
        where: { status: 'Active' }
      },
      {
        model: StudentCourse,
        required: true,
        where: {
          courseId: { [Op.in]: assignedCourseIds },
          sectionId: { [Op.in]: assignedSectionIds }
        }
      }
    ],
    // Ensure we only get unique students if they are enrolled in multiple partitions
    group: ['StudentDetails.registerNumber'], 
    order: [['registerNumber', 'ASC']]
  });

  // 3. Format result to match your previous frontend requirements
  const formattedData = students.map(s => ({
    regno: s.registerNumber,
    name: s.studentName || s.studentProfile?.userName
  }));

  res.json({
    status: 'success',
    results: formattedData.length,
    data: formattedData
  });
});
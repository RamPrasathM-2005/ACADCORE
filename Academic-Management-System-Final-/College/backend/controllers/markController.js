import models from '../models/index.js';
const { 
  Course, StaffCourse, CoursePartitions, CourseOutcome, 
  COType, COTool, ToolDetails, StudentCOTool, 
  StudentDetails, User, StudentCoMarks, Section, 
  Department, Semester, Batch, StudentCourse, sequelize 
} = models;

import { Op } from 'sequelize';
import csv from 'csv-parser';
import { createObjectCsvWriter as createCsvWriter } from 'csv-writer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';
import catchAsync from '../utils/catchAsync.js';

// --- HELPERS ---
const getStaffId = (req) => {
  const id = req.user?.userId || req.user?.id;
  if (!id) throw new Error('Authentication required: No user or userId provided');
  return id; 
};

const getStaffNumber = (req) => req.user?.userNumber || 'Unknown';

// 1. GET COURSE PARTITIONS
export const getCoursePartitions = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const staffId = getStaffId(req);

  const course = await Course.findOne({
    where: sequelize.where(sequelize.fn('LOWER', sequelize.col('Course.courseCode')), courseCode.toLowerCase()),
    include: [{ model: StaffCourse, where: { Userid: staffId }, required: true }]
  });

  if (!course) return res.status(404).json({ status: 'error', message: 'Course not found or assigned' });

  const partition = await CoursePartitions.findOne({ where: { courseId: course.courseId } });
  
  res.json({ 
    status: 'success', 
    data: partition || { theoryCount: 0, practicalCount: 0, experientialCount: 0, courseId: course.courseId } 
  });
});

// 2. SAVE COURSE PARTITIONS
export const saveCoursePartitions = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const { theoryCount, practicalCount, experientialCount } = req.body;
  const staffId = getStaffId(req);
  const staffNumber = getStaffNumber(req);

  const course = await Course.findOne({
    where: sequelize.where(sequelize.fn('LOWER', sequelize.col('Course.courseCode')), courseCode.toLowerCase()),
    include: [{ model: StaffCourse, where: { Userid: staffId }, required: true }]
  });

  const t = await sequelize.transaction();
  try {
    const existing = await CoursePartitions.findOne({ where: { courseId: course.courseId }, transaction: t });
    if (existing) {
      await existing.update({ theoryCount, practicalCount, experientialCount, updatedBy: staffNumber }, { transaction: t });
    } else {
      await CoursePartitions.create({ 
        courseId: course.courseId, theoryCount, practicalCount, experientialCount, 
        createdBy: staffNumber, updatedBy: staffNumber 
      }, { transaction: t });
    }

    const currentCOCount = await CourseOutcome.count({ where: { courseId: course.courseId }, transaction: t });
    if (currentCOCount === 0) {
      let coNumber = 1;
      const types = [
        { label: 'THEORY', count: theoryCount }, 
        { label: 'PRACTICAL', count: practicalCount }, 
        { label: 'EXPERIENTIAL', count: experientialCount }
      ];
      
      for (const item of types) {
        for (let i = 0; i < item.count; i++) {
          const co = await CourseOutcome.create({ 
            courseId: course.courseId, 
            coNumber: `CO${coNumber}` 
          }, { transaction: t });
          
          // FIXED: Changed co.id to co.coId to match the model definition
          await COType.create({ 
            coId: co.coId, 
            coType: item.label, 
            createdBy: staffNumber, 
            updatedBy: staffNumber 
          }, { transaction: t });
          
          coNumber++;
        }
      }
    }
    await t.commit();
    res.json({ status: 'success', message: 'Saved successfully' });
  } catch (err) { 
    await t.rollback(); 
    throw err; 
  }
});

// 3. UPDATE COURSE PARTITIONS
export const updateCoursePartitions = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const { theoryCount, practicalCount, experientialCount } = req.body;
  const staffId = getStaffId(req);
  const staffNumber = getStaffNumber(req);

  const course = await Course.findOne({
    where: sequelize.where(sequelize.fn('LOWER', sequelize.col('Course.courseCode')), courseCode.toLowerCase()),
    include: [{ model: StaffCourse, where: { Userid: staffId }, required: true }]
  });

  const t = await sequelize.transaction();
  try {
    await CoursePartitions.update({ theoryCount, practicalCount, experientialCount, updatedBy: staffNumber }, { where: { courseId: course.courseId }, transaction: t });
    const existing = await CourseOutcome.findAll({ where: { courseId: course.courseId }, include: [COType], transaction: t });

    const sync = async (label, count, list) => {
      while (list.length > count) {
        const d = list.pop();
        await COType.destroy({ where: { coId: d.coId }, transaction: t });
        await CourseOutcome.destroy({ where: { coId: d.coId }, transaction: t });
      }
      while (list.length < count) {
        const co = await CourseOutcome.create({ courseId: course.courseId, coNumber: 'TMP' }, { transaction: t });
        await COType.create({ coId: co.coId, coType: label, createdBy: staffNumber }, { transaction: t });
        list.push(co);
      }
    };

    let th = existing.filter(c => c.COType?.coType === 'THEORY');
    let pr = existing.filter(c => c.COType?.coType === 'PRACTICAL');
    let ex = existing.filter(c => c.COType?.coType === 'EXPERIENTIAL');
    await sync('THEORY', theoryCount, th);
    await sync('PRACTICAL', practicalCount, pr);
    await sync('EXPERIENTIAL', experientialCount, ex);

    const all = await CourseOutcome.findAll({ where: { courseId: course.courseId }, include: [COType], transaction: t });
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
    where: sequelize.where(sequelize.fn('UPPER', sequelize.col('Course.courseCode')), courseCode.toUpperCase()),
    include: [{ model: StaffCourse, where: { Userid: userId }, required: true }]
  });
  const cos = await CourseOutcome.findAll({ where: { courseId: course.courseId }, include: [COType], order: [['coNumber', 'ASC']] });
  res.json({ status: 'success', data: cos });
});

// 5. TOOLS (Get & Bulk Save)
export const getToolsForCO = catchAsync(async (req, res) => {
  const { coId } = req.params;
  const tools = await COTool.findAll({ where: { coId }, include: [ToolDetails] });
  res.json({ status: 'success', data: tools });
});

export const saveToolsForCO = catchAsync(async (req, res) => {
  const { coId } = req.params;
  const { tools } = req.body;
  const staffNumber = getStaffNumber(req);
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
        await ToolDetails.update({ maxMarks: tool.maxMarks, updatedBy: staffNumber }, { where: { toolId: tool.toolId }, transaction: t });
      } else {
        const nt = await COTool.create({ coId, toolName: tool.toolName, weightage: tool.weightage }, { transaction: t });
        await ToolDetails.create({ toolId: nt.toolId, maxMarks: tool.maxMarks, createdBy: staffNumber }, { transaction: t });
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
  const staffNumber = getStaffNumber(req);
  const t = await sequelize.transaction();
  try {
    const tool = await COTool.create({ coId, toolName, weightage }, { transaction: t });
    await ToolDetails.create({ toolId: tool.toolId, maxMarks, createdBy: staffNumber }, { transaction: t });
    await t.commit();
    res.status(201).json(tool);
  } catch (err) { await t.rollback(); throw err; }
});

export const updateTool = catchAsync(async (req, res) => {
  const { toolId } = req.params;
  const { toolName, weightage, maxMarks } = req.body;
  const staffNumber = getStaffNumber(req);
  const t = await sequelize.transaction();
  try {
    await COTool.update({ toolName, weightage }, { where: { toolId }, transaction: t });
    await ToolDetails.update({ maxMarks, updatedBy: staffNumber }, { where: { toolId }, transaction: t });
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
  const staffNumber = getStaffNumber(req);
  const tool = await COTool.findByPk(toolId, { include: [ToolDetails, CourseOutcome] });
  const t = await sequelize.transaction();
  try {
    for (const m of marks) {
      await StudentCOTool.upsert({ regno: m.regno, toolId, marksObtained: m.marksObtained }, { transaction: t });
      const coTools = await COTool.findAll({ where: { coId: tool.coId }, include: [ToolDetails], transaction: t });
      let consolidated = 0;
      for (const ct of coTools) {
        const sm = await StudentCOTool.findOne({ where: { regno: m.regno, toolId: ct.toolId }, transaction: t });
        consolidated += ((sm?.marksObtained || 0) / (ct.ToolDetail?.maxMarks || 100)) * (ct.weightage / 100);
      }
      await StudentCoMarks.upsert({ regno: m.regno, coId: tool.coId, consolidatedMark: (consolidated * 100).toFixed(2), updatedBy: staffNumber }, { transaction: t });
    }
    await t.commit();
    res.json({ status: 'success' });
  } catch (err) { await t.rollback(); throw err; }
});

// 8. IMPORT/EXPORT (Staff/CO Wise)
export const importMarksForTool = catchAsync(async (req, res) => {
  const { toolId } = req.params;
  const staffNumber = getStaffNumber(req);
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
        con += ((sm?.marksObtained || 0) / (ct.ToolDetail?.maxMarks || 100)) * (ct.weightage / 100);
      }
      await StudentCoMarks.upsert({ regno, coId: tool.coId, consolidatedMark: (con * 100).toFixed(2), updatedBy: staffNumber }, { transaction: t });
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
    for (const t of tools) { 
      const sm = await StudentCOTool.findOne({ where: { regno: s.registerNumber, toolId: t.toolId } });
      row[t.toolName] = sm?.marksObtained || 0; 
    }
    const cm = await StudentCoMarks.findOne({ where: { regno: s.registerNumber, coId } });
    row.con = cm?.consolidatedMark || '0.00';
    return row;
  }));
  const filePath = path.join(os.tmpdir(), `CO_${coId}.csv`);
  await createCsvWriter({ path: filePath, header }).writeRecords(data);
  res.download(filePath, () => fs.unlinkSync(filePath));
});

// 9. STAFF DASHBOARD (My Courses - Grouped Logic)
export const getMyCourses = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  if (!userId) return res.status(401).json({ status: 'error', message: 'Authentication failed' });

  const rows = await StaffCourse.findAll({
    where: { Userid: userId },
    include: [
      {
        model: Course,
        include: [{ model: Semester, include: [{ model: Batch }] }],
      },
      { model: Section },
      { model: Department, as: 'department' },
    ],
    order: [[Course, 'courseTitle', 'ASC']], // nicer ordering
  });

  const groupedMap = new Map(); // key = courseTitle (or courseId if you prefer uniqueness by ID)

  for (const row of rows) {
    const data = row.get({ plain: true });
    if (!data.Course) continue;

    const course = data.Course;
    const sem = course.Semester;
    const batch = sem?.Batch;

    // Use courseTitle as main grouping key (most user-friendly)
    const key = course.courseTitle;

    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        title: course.courseTitle,
        // Use the most common / first course code as representative
        mainCourseCode: course.courseCode,
        courseCodes: new Set([course.courseCode]),
        semester: sem ? `Sem ${sem.semesterNumber}` : 'N/A',
        sections: [],
        branches: new Set(),
        compositeSectionIds: [],
      });
    }

    const entry = groupedMap.get(key);

    // Collect unique course codes
    entry.courseCodes.add(course.courseCode);

    // Collect branches taught for this course
    if (batch?.branch) entry.branches.add(batch.branch);

    // Collect sections with useful info
    entry.sections.push({
      sectionId: data.sectionId,
      sectionName: data.Section?.sectionName || 'Unnamed',
      batch: batch?.batch || 'N/A',
      branch: batch?.branch || 'General',
      degree: batch?.degree || 'BE',
      // You can add more if needed: classroom, timing, etc.
    });

    // For composite ID if frontend still needs it (e.g. for some bulk action)
    if (!entry.compositeSectionIds.includes(String(data.sectionId))) {
      entry.compositeSectionIds.push(String(data.sectionId));
    }
  }

  // Final formatting
  const result = Array.from(groupedMap.values()).map(entry => ({
    ...entry,
    courseCodes: Array.from(entry.courseCodes),
    branches: Array.from(entry.branches),
    compositeSectionIds: entry.compositeSectionIds.join('_'),
    sectionCount: entry.sections.length,
    // Optional: sort sections by branch/batch/sectionName
    sections: entry.sections.sort((a, b) => 
      a.branch.localeCompare(b.branch) || a.sectionName.localeCompare(b.sectionName)
    ),
  }));

  res.status(200).json({ status: 'success', data: result });
});
// 10. ADMIN FUNCTIONS
export const getConsolidatedMarks = catchAsync(async (req, res) => {
  const { batch, dept, sem } = req.query;
  const d = await Department.findOne({ where: { Deptacronym: dept } });
  const b = await Batch.findOne({ where: { batch, branch: dept } });
  const s = await Semester.findOne({ where: { batchId: b.batchId, semesterNumber: sem } });
  const students = await StudentDetails.findAll({ where: { departmentId: d.Deptid, batch, semester: sem } });
  const courses = await Course.findAll({ where: { semesterId: s.semesterId }, include: [CoursePartitions] });
  const cos = await CourseOutcome.findAll({ where: { courseId: courses.map(c => c.courseId) }, include: [COType] });
  const marks = await StudentCoMarks.findAll({ where: { regno: students.map(st => st.registerNumber), coId: cos.map(c => c.coId) } });
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
  const marks = await StudentCoMarks.findAll({ where: { coId: cos.map(c => c.coId), regno: students.map(s => s.registerNumber) } });
  const resData = students.map(s => {
    const mks = {};
    cos.forEach(co => { mks[co.coNumber] = marks.find(m => m.regno === s.registerNumber && m.coId === co.coId)?.consolidatedMark || '0.00'; });
    return { regno: s.registerNumber, name: s.studentName, marks: mks };
  });
  res.json({ status: 'success', data: { students: resData, partitions: { theoryCount: cos.filter(c => c.COType?.coType === 'THEORY').length } } });
});

export const updateStudentCOMarkAdmin = catchAsync(async (req, res) => {
  const { regno, coId } = req.params;
  const { consolidatedMark } = req.body;
  await StudentCoMarks.upsert({ regno, coId, consolidatedMark, updatedBy: 'admin' });
  res.json({ status: 'success' });
});

export const exportCourseWiseCsvAdmin = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const course = await Course.findOne({ where: { courseCode } });
  const cos = await CourseOutcome.findAll({ where: { courseId: course.courseId }, include: [COType] });
  const students = await StudentDetails.findAll({ include: [{ model: StudentCourse, where: { courseId: course.courseId } }] });
  const header = [{ id: 'regno', title: 'Reg No' }, { id: 'name', title: 'Name' }, ...cos.map(c => ({ id: c.coNumber, title: c.coNumber })), { id: 'avg', title: 'Average' }];
  const data = await Promise.all(students.map(async s => {
    const row = { regno: s.registerNumber, name: s.studentName }; 
    let sum = 0;
    for (const co of cos) { 
      const val = parseFloat((await StudentCoMarks.findOne({ where: { regno: s.registerNumber, coId: co.coId } }))?.consolidatedMark || 0); 
      row[co.coNumber] = val.toFixed(2); sum += val; 
    }
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
  const course = await Course.findOne({ where: { courseCode } });
  const cos = await CourseOutcome.findAll({ where: { courseId: course.courseId }, include: [COType] });
  const students = await StudentDetails.findAll({ include: [{ model: StudentCourse, where: { courseId: course.courseId, sectionId } }] });
  const marks = await StudentCoMarks.findAll({ where: { coId: cos.map(c => c.coId), regno: students.map(s => s.registerNumber) } });
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
  await StudentCoMarks.upsert({ regno, coId, consolidatedMark, updatedBy: getStaffNumber(req) });
  res.json({ status: 'success' });
});

export const getStudentsForSection = catchAsync(async (req, res) => {
  const { courseCode, sectionId } = req.params;

  // Guard against "unknown" sectionId
  if (!sectionId || sectionId === 'unknown') {
    return res.status(400).json({ status: 'error', message: 'Valid Section ID is required' });
  }

  const enrollments = await StudentCourse.findAll({
    where: { sectionId: sectionId },
    include: [
      {
        model: Course,
        where: { courseCode: courseCode },
        attributes: [] // We only need this for filtering
      },
      {
        model: StudentDetails,
        attributes: ['registerNumber', 'studentName']
      }
    ]
  });

  // Flatten the response to match frontend expectations (regno, name)
  const data = enrollments.map(e => ({
    regno: e.StudentDetail?.registerNumber,
    name: e.StudentDetail?.studentName,
    studentId: e.StudentDetail?.studentId
  }));

  res.status(200).json({ status: 'success', data });
});

// 11. STAFF VIEW MARKS LOGIC
export const exportCourseWiseCsv = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const staffId = getStaffId(req);
  const course = await Course.findOne({ where: { courseCode: courseCode.toUpperCase() } });
  const cos = await CourseOutcome.findAll({ where: { courseId: course.courseId }, include: [COType], order: [['coNumber', 'ASC']] });
  const students = await StudentDetails.findAll({ include: [{ model: StudentCourse, required: true, where: { courseId: course.courseId, sectionId: { [Op.in]: sequelize.literal(`(SELECT sectionId FROM StaffCourse WHERE Userid = ${staffId} AND courseId = ${course.courseId})`) } } }] });
  const header = [{ id: 'regNo', title: 'Reg No' }, { id: 'name', title: 'Name' }, ...cos.map(co => ({ id: co.coNumber, title: co.coNumber })), { id: 'finalAvg', title: 'Final Avg' }];
  const data = await Promise.all(students.map(async s => {
    const row = { regNo: s.registerNumber, name: s.studentName };
    let sum = 0;
    for (const co of cos) {
      const m = await StudentCoMarks.findOne({ where: { regno: s.registerNumber, coId: co.coId } });
      const val = parseFloat(m?.consolidatedMark || 0);
      row[co.coNumber] = val.toFixed(2); sum += val;
    }
    row.finalAvg = (sum / cos.length).toFixed(2); return row;
  }));
  const fp = path.join(os.tmpdir(), `${courseCode}_marks.csv`);
  await createCsvWriter({ path: fp, header }).writeRecords(data);
  res.download(fp, () => fs.unlinkSync(fp));
});

export const getStudentCOMarks = catchAsync(async (req, res) => {
  const { courseCode: rawCourseCode } = req.params;
  const normalizedCode = rawCourseCode.toUpperCase().trim();

  try {
    // Find ALL courses with this courseCode (across departments)
    const courses = await Course.findAll({
      where: { courseCode: normalizedCode },
    });

    if (courses.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No course found with this code' });
    }

    // Use first course as reference for CO numbers & types
    const primaryCourse = courses[0];
    const primaryCOs = await CourseOutcome.findAll({
      where: { courseId: primaryCourse.courseId },
      include: [{ model: COType, required: false, attributes: ['coType'] }],
      order: [['coNumber', 'ASC']],
    });

    if (primaryCOs.length === 0) {
      return res.json({
        status: 'success',
        data: { students: [], partitions: { theoryCount: 0 } },
      });
    }

    // ────────────────────────────────────────────────
    // Collect unique students from all versions of this course
    // ────────────────────────────────────────────────
    const studentsMap = new Map(); // regno → student

    for (const course of courses) {
      const sections = await Section.findAll({
        where: { courseId: course.courseId, isActive: 'YES' },
      });

      const sectionIds = sections.map(s => s.sectionId);

      const enrollments = await StudentCourse.findAll({
        where: {
          courseId: course.courseId,
          sectionId: { [Op.in]: sectionIds },
        },
        include: [{
          model: StudentDetails,
          as: 'StudentDetail',
          attributes: ['registerNumber', 'studentName'],
          required: true,
        }],
      });

      enrollments.forEach(en => {
        const regno = en.StudentDetail.registerNumber;
        if (regno && !studentsMap.has(regno)) {
          studentsMap.set(regno, {
            regno,
            name: en.StudentDetail.studentName || 'Unknown',
          });
        }
      });
    }

    const allStudents = Array.from(studentsMap.values());

    // ────────────────────────────────────────────────
    // Collect marks keyed by coNumber from ALL courses
    // ────────────────────────────────────────────────
    const marksByRegNoAndCoNum = new Map(); // regno → coNumber → value

    for (const course of courses) {
      const cos = await CourseOutcome.findAll({
        where: { courseId: course.courseId },
        include: [{ model: COType }],
      });

      if (cos.length === 0) continue;

      const marks = await StudentCoMarks.findAll({
        where: {
          coId: cos.map(c => c.coId),
          regno: { [Op.in]: allStudents.map(s => s.regno) },
        },
      });

      marks.forEach(m => {
        const co = cos.find(c => c.coId === m.coId);
        if (!co) return;

        const coNum = co.coNumber;
        if (!marksByRegNoAndCoNum.has(m.regno)) {
          marksByRegNoAndCoNum.set(m.regno, {});
        }

        const current = parseFloat(m.consolidatedMark || 0);
        const existing = parseFloat(marksByRegNoAndCoNum.get(m.regno)[coNum] || 0);

        // Prefer non-zero / higher value
        if (current > existing) {
          marksByRegNoAndCoNum.get(m.regno)[coNum] = current;
        }
      });
    }

    // ────────────────────────────────────────────────
    // Build response using primary CO structure
    // ────────────────────────────────────────────────
    const resData = allStudents.map(student => {
      const regno = student.regno;
      const marks = {};
      let sum = 0;

      primaryCOs.forEach(co => {
        const coNum = co.coNumber;
        const val = marksByRegNoAndCoNum.get(regno)?.[coNum] || 0;

        marks[coNum] = {
          coId: co.coId,                // primary coId (for reference/update)
          coType: co.COType?.coType || 'N/A',
          consolidatedMark: val.toFixed(2),
        };

        sum += val;
      });

      const finalAvg = primaryCOs.length ? (sum / primaryCOs.length).toFixed(2) : '0.00';

      return {
        regno,
        name: student.name,
        marks,
        averages: { finalAvg },
      };
    });

    resData.sort((a, b) => a.regno.localeCompare(b.regno));

    res.json({
      status: 'success',
      data: {
        students: resData,
        partitions: {
          theoryCount: primaryCOs.filter(c => c.COType?.coType === 'THEORY').length || 0,
        },
      },
    });

  } catch (err) {
    console.error('getStudentCOMarks error:', err);
    res.status(500).json({ status: 'error', message: err.message || 'Internal server error' });
  }
});


export const getStudentsForCourse = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const staffId = getStaffId(req);
  const staffAssig = await StaffCourse.findAll({ where: { Userid: staffId }, include: [{ model: Course, where: { courseCode: courseCode.toUpperCase() } }] });
  if (!staffAssig.length) return res.json({ status: 'success', results: 0, data: [] });
  const students = await StudentDetails.findAll({ include: [{ model: StudentCourse, required: true, where: { courseId: staffAssig[0].courseId, sectionId: { [Op.in]: staffAssig.map(a => a.sectionId) } } }] });
  res.json({ status: 'success', results: students.length, data: students.map(s => ({ regno: s.registerNumber, name: s.studentName })) });
});
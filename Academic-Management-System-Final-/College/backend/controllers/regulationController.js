import { Op } from 'sequelize';
import db from '../models/index.js'; // Assuming your index.js exports the db object
const { 
  sequelize, 
  Regulation, 
  Department, 
  Vertical, 
  RegulationCourse, 
  VerticalCourse, 
  Batch, 
  Semester, 
  Course 
} = db;

// Included branchMap as requested
export const branchMap = {
  CSE: { Deptid: 1, Deptname: "Computer Science Engineering" },
  IT: { Deptid: 4, Deptname: "Information Technology" },
  ECE: { Deptid: 2, Deptname: "Electronics & Communication" },
  MECH: { Deptid: 3, Deptname: "Mechanical Engineering" },
  CIVIL: { Deptid: 7, Deptname: "Civil Engineering" },
  EEE: { Deptid: 5, Deptname: "Electrical Engineering" },
};

const determineCourseType = (lectureHours, tutorialHours, practicalHours, experientialHours) => {
  if (experientialHours > 0) return 'EXPERIENTIAL LEARNING';
  if (practicalHours > 0) {
    if (lectureHours > 0 || tutorialHours > 0) return 'INTEGRATED';
    return 'PRACTICAL';
  }
  return 'THEORY';
};

export const getAllRegulations = async (req, res) => {
  try {
    const rows = await Regulation.findAll({
      where: { isActive: 'YES' },
      include: [{
        model: Department,
        attributes: ['Deptacronym']
      }]
    });
    res.json({ status: 'success', data: rows });
  } catch (err) {
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};

export const getVerticalsByRegulation = async (req, res) => {
  const { regulationId } = req.params;
  try {
    const rows = await Vertical.findAll({
      where: { regulationId, isActive: 'YES' },
      attributes: ['verticalId', 'verticalName']
    });
    res.json({ status: 'success', data: rows });
  } catch (err) {
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};

export const createVertical = async (req, res) => {
  const { regulationId, verticalName } = req.body;
  const createdBy = req.user?.userName || 'admin';

  if (!regulationId || !verticalName) {
    return res.status(400).json({ status: 'failure', message: 'Regulation ID and vertical name are required' });
  }

  try {
    const vertical = await Vertical.create({
      regulationId,
      verticalName,
      createdBy,
      updatedBy: createdBy
    });
    res.json({ status: 'success', message: 'Vertical added successfully', data: vertical });
  } catch (err) {
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};

export const importRegulationCourses = async (req, res) => {
  const { regulationId, courses } = req.body;
  const createdBy = req.user?.userName || 'admin';

  if (!regulationId || !Array.isArray(courses) || courses.length === 0) {
    return res.status(400).json({ status: 'failure', message: 'Regulation ID and courses array are required' });
  }

  const skippedRows = [];
  const validRows = [];
  const allowedCategories =
    RegulationCourse?.getAttributes?.()?.category?.values ||
    ['HSMC', 'BSC', 'ESC', 'PEC', 'OEC', 'EEC', 'PCC'];

  for (const [index, rawCourse] of courses.entries()) {
    const row = index + 2;
    const course = rawCourse || {};

    const courseCode = String(course.courseCode || '').trim();
    const courseTitle = String(course.courseTitle || '').trim();
    const category = String(course.category || '').trim().toUpperCase();
    const isElective = ['PEC', 'OEC'].includes(category);

    if (!courseCode || !courseTitle || !category) {
      skippedRows.push({ row, reason: 'Missing courseCode, courseTitle, or category' });
      continue;
    }
    if (!allowedCategories.includes(category)) {
      skippedRows.push({ row, reason: `Invalid category "${category}". Allowed: ${allowedCategories.join(', ')}` });
      continue;
    }

    let semesterNumber = null;
    if (course.semesterNumber !== undefined && course.semesterNumber !== null && String(course.semesterNumber).trim() !== '') {
      const sem = Number(course.semesterNumber);
      if (!Number.isInteger(sem) || sem < 1 || sem > 8) {
        skippedRows.push({ row, reason: 'Invalid semesterNumber (must be 1-8)' });
        continue;
      }
      semesterNumber = sem;
    }

    if (!isElective && semesterNumber === null) {
      skippedRows.push({ row, reason: 'semesterNumber is required for non-PEC/OEC courses' });
      continue;
    }

    validRows.push({
      row,
      regulationId,
      semesterNumber,
      courseCode,
      courseTitle,
      category,
      type: determineCourseType(
        Number(course.lectureHours || 0),
        Number(course.tutorialHours || 0),
        Number(course.practicalHours || 0),
        Number(course.experientialHours || 0)
      ),
      lectureHours: Number(course.lectureHours || 0),
      tutorialHours: Number(course.tutorialHours || 0),
      practicalHours: Number(course.practicalHours || 0),
      experientialHours: Number(course.experientialHours || 0),
      totalContactPeriods: Number(course.totalContactPeriods || 0),
      credits: Number(course.credits || 0),
      minMark: Number(course.minMark || 0),
      maxMark: Number(course.maxMark || 0),
      createdBy,
      updatedBy: createdBy
    });
  }

  if (validRows.length === 0) {
    return res.status(400).json({
      status: 'failure',
      message: 'No valid courses to import',
      skipped: skippedRows
    });
  }

  const transaction = await sequelize.transaction();
  let insertedCount = 0;
  try {
    for (const rowData of validRows) {
      try {
        const { row, ...payload } = rowData;
        await RegulationCourse.create(payload, { transaction });
        insertedCount++;
      } catch (insertErr) {
        skippedRows.push({
          row: rowData.row,
          reason: insertErr?.parent?.sqlMessage || insertErr?.errors?.[0]?.message || insertErr.message
        });
      }
    }
    await transaction.commit();
    if (insertedCount === 0) {
      return res.status(400).json({
        status: 'failure',
        message: 'No courses were imported',
        skipped: skippedRows
      });
    }

    return res.json({
      status: 'success',
      message: `Imported ${insertedCount} courses successfully`,
      skipped: skippedRows.length ? skippedRows : undefined
    });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ status: 'failure', message: `Server error: ${err.message}` });
  }
};

export const allocateCoursesToVertical = async (req, res) => {
  const { verticalId, regCourseIds } = req.body;
  const createdBy = req.user?.userName || 'admin';

  const transaction = await sequelize.transaction();
  try {
    const mappingData = regCourseIds.map(regCourseId => ({
      verticalId,
      regCourseId,
      createdBy,
      updatedBy: createdBy
    }));

    await VerticalCourse.bulkCreate(mappingData, { transaction, ignoreDuplicates: true });
    await transaction.commit();
    res.json({ status: 'success', message: 'Courses allocated to vertical successfully' });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};

export const getAvailableCoursesForVertical = async (req, res) => {
  const { regulationId } = req.params;
  try {
    // Get IDs of courses already in verticals
    const allocatedCourses = await VerticalCourse.findAll({
      attributes: ['regCourseId']
    });
    const allocatedIds = allocatedCourses.map(c => c.regCourseId);

    const rows = await RegulationCourse.findAll({
      where: {
        regulationId,
        category: { [Op.in]: ['PEC', 'OEC'] },
        regCourseId: { [Op.notIn]: allocatedIds.length ? allocatedIds : [0] },
        isActive: 'YES'
      },
      attributes: [['regCourseId', 'courseId'], 'courseCode', 'courseTitle', 'category', 'semesterNumber']
    });
    res.json({ status: 'success', data: rows });
  } catch (err) {
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};

export const allocateRegulationToBatch = async (req, res) => {
  const { batchId, regulationId } = req.body;
  const createdBy = req.user?.userName || 'admin';

  const transaction = await sequelize.transaction();
  try {
    const batch = await Batch.findOne({ where: { batchId, isActive: 'YES' }, transaction });
    if (!batch) throw new Error('Batch not found or inactive');

    const branchCode = String(batch.branch || '').trim().toUpperCase();
    const deptInfo = await Department.findOne({
      where: sequelize.where(
        sequelize.fn('UPPER', sequelize.col('Deptacronym')),
        branchCode
      ),
      attributes: ['Deptid', 'Deptacronym'],
      transaction
    });
    if (!deptInfo) throw new Error(`Invalid branch: ${batch.branch}`);

    const regulation = await Regulation.findOne({ where: { regulationId, isActive: 'YES' }, transaction });
    if (!regulation) throw new Error('Regulation not found');
    if (Number(regulation.Deptid) !== Number(deptInfo.Deptid)) {
      throw new Error(`Regulation department mismatch for branch ${batch.branch}`);
    }

    // 1. Update Batch
    await batch.update({ regulationId, updatedBy: createdBy }, { transaction });

    // 2. Ensure 8 Semesters exist
    for (let i = 1; i <= 8; i++) {
      await Semester.findOrCreate({
        where: { batchId, semesterNumber: i },
        defaults: {
          startDate: new Date(),
          endDate: new Date(new Date().setMonth(new Date().getMonth() + 6)),
          createdBy,
          updatedBy: createdBy
        },
        transaction
      });
    }

    const semesters = await Semester.findAll({ where: { batchId }, transaction });
    const semesterMap = semesters.reduce((acc, sem) => {
      acc[sem.semesterNumber] = sem.semesterId;
      return acc;
    }, {});

    // 3. Copy Courses
    const regCourses = await RegulationCourse.findAll({ where: { regulationId, isActive: 'YES' }, transaction });
    
    for (const rc of regCourses) {
      const semId = semesterMap[rc.semesterNumber];
      if (semId) {
        await Course.findOrCreate({
          where: { courseCode: rc.courseCode, semesterId: semId },
          defaults: {
            courseTitle: rc.courseTitle,
            category: rc.category,
            type: rc.type,
            lectureHours: rc.lectureHours,
            tutorialHours: rc.tutorialHours,
            practicalHours: rc.practicalHours,
            experientialHours: rc.experientialHours,
            totalContactPeriods: rc.totalContactPeriods,
            credits: rc.credits,
            minMark: rc.minMark,
            maxMark: rc.maxMark,
            createdBy,
            updatedBy: createdBy
          },
          transaction
        });
      }
    }

    await transaction.commit();
    res.json({ status: 'success', message: 'Regulation allocated and courses synchronized' });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ status: 'failure', message: err.message });
  }
};

export const getElectivesForSemester = async (req, res) => {
  const { regulationId, semesterNumber } = req.params;
  try {
    const rows = await RegulationCourse.findAll({
      where: {
        regulationId,
        category: { [Op.in]: ['PEC', 'OEC'] },
        isActive: 'YES',
        [Op.or]: [
          { semesterNumber: Number(semesterNumber) }, // semester-specific electives
          { semesterNumber: null } // global electives
        ]
      },
      include: [{
        model: VerticalCourse,
        include: [{ model: Vertical, attributes: ['verticalName'] }]
      }],
      order: [['courseCode', 'ASC']]
    });

    const formatted = rows.map((row) => {
      const json = row.toJSON();
      const mapping = Array.isArray(json.VerticalCourses) && json.VerticalCourses.length > 0
        ? json.VerticalCourses[0]
        : null;

      return {
        courseId: json.regCourseId,
        courseCode: json.courseCode,
        courseTitle: json.courseTitle,
        category: json.category,
        semesterNumber: json.semesterNumber,
        verticalId: mapping?.verticalId ?? null,
        verticalName: mapping?.Vertical?.verticalName ?? null,
      };
    });

    res.json({ status: 'success', data: formatted });
  } catch (err) {
    res.status(500).json({ status: 'failure', message: err.message });
  }
};

// Add this to your regulationController.js
export const getCoursesByVertical = async (req, res) => {
  const { verticalId } = req.params;
  const { semesterNumber } = req.query;

  try {
    const whereCondition = {
      isActive: 'YES',
      category: { [Op.in]: ['PEC', 'OEC'] }
    };

    // If semesterNumber is provided, include both semester-specific and global (NULL) electives
    if (semesterNumber) {
      whereCondition[Op.or] = [
        { semesterNumber: Number(semesterNumber) },
        { semesterNumber: null }
      ];
    }

    const rows = await RegulationCourse.findAll({
      where: whereCondition,
      include: [{
        model: VerticalCourse,
        where: { verticalId },
        attributes: [], // We don't need fields from the mapping table
        required: true  // This makes it an INNER JOIN
      }],
      attributes: [
        ['regCourseId', 'courseId'], 
        'courseCode', 
        'courseTitle', 
        'category', 
        'semesterNumber'
      ]
    });

    res.json({ status: 'success', data: rows });
  } catch (err) {
    console.error('Error fetching courses by vertical:', err);
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};

export const createRegulation = async (req, res) => {
  const { Deptid, regulationYear } = req.body;
  const createdBy = req.user?.userName || 'admin';

  const deptIdNum = Number(Deptid);
  const yearNum = Number(regulationYear);

  if (!deptIdNum || !yearNum) {
    return res.status(400).json({
      status: 'failure',
      message: 'Deptid and regulationYear are required',
    });
  }

  if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
    return res.status(400).json({
      status: 'failure',
      message: 'Invalid regulation year',
    });
  }

  try {
    const dept = await Department.findByPk(deptIdNum, { attributes: ['Deptid'] });
    if (!dept) {
      return res.status(404).json({ status: 'failure', message: 'Department not found' });
    }

    const existing = await Regulation.findOne({
      where: {
        Deptid: deptIdNum,
        regulationYear: yearNum,
        isActive: 'YES',
      },
    });

    if (existing) {
      return res.status(409).json({
        status: 'failure',
        message: 'Regulation year already exists for this department',
      });
    }

    const created = await Regulation.create({
      Deptid: deptIdNum,
      regulationYear: yearNum,
      isActive: 'YES',
      createdBy,
      updatedBy: createdBy,
    });

    return res.status(201).json({
      status: 'success',
      message: 'Regulation year added successfully',
      data: created,
    });
  } catch (err) {
    return res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};

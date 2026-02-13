// controllers/timetableController.js
import db from '../models/index.js';
import catchAsync from '../utils/catchAsync.js';
import { Op } from 'sequelize';

const { 
  sequelize, Timetable, Course, Section, Semester, 
  Batch, DepartmentAcademic, ElectiveBucket, ElectiveBucketCourse, User 
} = db;

export const getAllTimetableDepartments = catchAsync(async (req, res) => {
  const departments = await DepartmentAcademic.findAll({
    attributes: [['Deptid', 'Deptid'], ['Deptacronym', 'deptCode'], 'Deptname']
  });

  res.status(200).json({
    status: 'success',
    data: departments || [],
  });
});

export const getAllTimetableBatches = catchAsync(async (req, res) => {
  const batches = await Batch.findAll({
    where: { isActive: 'YES' },
    attributes: ['batchId', 'degree', 'branch', 'batch', 'batchYears']
  });

  res.status(200).json({
    status: 'success',
    data: batches || [],
  });
});

export const getTimetable = catchAsync(async (req, res) => {
  const { semesterId } = req.params;

  const timetableEntries = await Timetable.findAll({
    where: { 
      semesterId, 
      isActive: 'YES' 
    },
    include: [
      { 
        model: Course, 
        attributes: ['courseId', 'courseTitle'],
        required: false // LEFT JOIN
      },
      { 
        model: Section, 
        attributes: ['sectionId', 'sectionName'],
        required: false // LEFT JOIN
      }
    ]
  });

  // Flatten the data structure to match frontend expectations
  const formattedData = timetableEntries.map(t => ({
    timetableId: t.timetableId,
    courseId: t.courseId,
    sectionId: t.sectionId || 0,
    dayOfWeek: t.dayOfWeek?.toUpperCase(),
    periodNumber: t.periodNumber,
    courseTitle: t.Course?.courseTitle || t.courseId,
    sectionName: t.Section?.sectionName || 'No Section'
  }));

  res.status(200).json({
    status: 'success',
    data: formattedData,
  });
});

export const getTimetableByFilters = catchAsync(async (req, res) => {
  const { degree, Deptid, semesterNumber } = req.query;

  if (!degree || !Deptid || !semesterNumber) {
    return res.status(400).json({ status: 'failure', message: 'Missing required filters' });
  }

  const entries = await Timetable.findAll({
    where: { 
      Deptid, 
      isActive: 'YES' 
    },
    include: [
      {
        model: Semester,
        where: { semesterNumber },
        required: true, // INNER JOIN
        include: [{ 
            model: Batch, 
            where: { degree, isActive: 'YES' },
            required: true 
        }]
      },
      { model: Course, attributes: ['courseTitle'], required: false },
      { model: Section, attributes: ['sectionName'], required: false }
    ]
  });

  const formattedData = entries.map(t => ({
    timetableId: t.timetableId,
    courseId: t.courseId,
    sectionId: t.sectionId || 0,
    dayOfWeek: t.dayOfWeek?.toUpperCase(),
    periodNumber: t.periodNumber,
    courseTitle: t.Course?.courseTitle || t.courseId,
    sectionName: t.Section?.sectionName || 'No Section'
  }));

  res.status(200).json({ status: 'success', data: formattedData });
});

export const createTimetableEntry = catchAsync(async (req, res) => {
  const { courseId, sectionId, dayOfWeek, periodNumber, Deptid, semesterId } = req.body;
  const userName = req.user?.userName || 'admin';

  const transaction = await sequelize.transaction();
  try {
    // 1. Validations
    const semester = await Semester.findOne({ where: { semesterId, isActive: 'YES' }, transaction });
    if (!semester) throw new Error('Active semester not found');

    const course = await Course.findOne({ where: { courseId, isActive: 'YES' }, transaction });
    if (!course) throw new Error('Active course not found');

    if (sectionId) {
      const section = await Section.findOne({ where: { sectionId, courseId, isActive: 'YES' }, transaction });
      if (!section) throw new Error('Active section not found for this course');
    }

    // 2. Conflict Check
    const conflict = await Timetable.findOne({
      where: { semesterId, dayOfWeek, periodNumber, isActive: 'YES' },
      transaction
    });
    if (conflict) throw new Error('Time slot already assigned for this semester/section');

    // 3. Create
    const entry = await Timetable.create({
      courseId,
      sectionId: sectionId || null,
      dayOfWeek,
      periodNumber,
      Deptid,
      semesterId,
      isActive: 'YES',
      createdBy: userName,
      updatedBy: userName
    }, { transaction });

    await transaction.commit();
    res.status(201).json({ status: 'success', message: 'Timetable entry created', data: entry });
  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ status: 'failure', message: error.message });
  }
});

export const updateTimetableEntry = catchAsync(async (req, res) => {
  const { timetableId } = req.params;
  const { courseId, sectionId, dayOfWeek, periodNumber, Deptid, semesterId } = req.body;
  const userName = req.user?.userName || 'admin';

  const transaction = await sequelize.transaction();
  try {
    const entry = await Timetable.findByPk(timetableId, { transaction });
    if (!entry) throw new Error('Timetable entry not found');

    // Conflict Check (exclude current ID)
    const conflict = await Timetable.findOne({
      where: { 
        semesterId, 
        dayOfWeek, 
        periodNumber, 
        timetableId: { [Op.ne]: timetableId },
        isActive: 'YES' 
      },
      transaction
    });
    if (conflict) throw new Error('Time slot already assigned');

    await entry.update({
      courseId,
      sectionId: sectionId || null,
      dayOfWeek,
      periodNumber,
      Deptid,
      semesterId,
      updatedBy: userName
    }, { transaction });

    await transaction.commit();
    res.status(200).json({ status: 'success', message: 'Timetable entry updated' });
  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ status: 'failure', message: error.message });
  }
});

export const deleteTimetableEntry = catchAsync(async (req, res) => {
  const { timetableId } = req.params;
  const userName = req.user?.userName || 'admin';

  const entry = await Timetable.findByPk(timetableId);
  if (!entry) return res.status(404).json({ status: 'failure', message: 'Not found' });

  // Soft Delete
  await entry.update({ isActive: 'NO', updatedBy: userName });

  res.status(200).json({ status: 'success', message: 'Entry deleted successfully' });
});

/* =========================
   📌 Elective Buckets
   ========================= */

export const getElectiveBucketsBySemester = catchAsync(async (req, res) => {
  const { semesterId } = req.params;

  const buckets = await ElectiveBucket.findAll({
    where: { semesterId },
    order: [['bucketNumber', 'ASC']]
  });

  res.json({ status: "success", data: buckets });
});

export const getCoursesInBucket = catchAsync(async (req, res) => {
  const { bucketId } = req.params;

  const courses = await Course.findAll({
    include: [{
      model: ElectiveBucketCourse,
      where: { bucketId },
      required: true,
      attributes: [] // Don't need bucket fields
    }],
    attributes: ['courseId', 'courseCode', 'courseTitle', 'credits'],
    order: [['courseCode', 'ASC']]
  });

  res.json({ status: "success", data: courses });
});
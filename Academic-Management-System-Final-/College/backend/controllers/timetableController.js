// controllers/timetableController.js
import db from '../models/index.js';
import catchAsync from '../utils/catchAsync.js';
import { Op } from 'sequelize';

// Destructure models from db object
const { 
  sequelize, 
  Timetable, 
  Course, 
  Section, 
  Semester, 
  Batch, 
  Department, 
  ElectiveBucket, 
  ElectiveBucketCourse, 
  StaffCourse, 
  User 
} = db;

async function findStaffConflictForSlot({
  courseIds,
  sectionId,
  dayOfWeek,
  periodNumber,
  excludeTimetableId = null,
  transaction
}) {
  // Staff assigned to the new allocation candidate(s)
  const newStaffAllocations = await StaffCourse.findAll({
    where: {
      courseId: { [Op.in]: courseIds },
      ...(sectionId ? { sectionId } : {})
    },
    attributes: ['Userid'],
    transaction
  });

  const staffIds = [...new Set(newStaffAllocations.map((s) => s.Userid))];
  if (staffIds.length === 0) return null;

  const excludeClause = excludeTimetableId ? 'AND t.timetableId <> :excludeTimetableId' : '';
  const [conflicts] = await sequelize.query(
    `
      SELECT t.timetableId, t.courseId, t.sectionId, scExisting.Userid AS staffId
      FROM Timetable t
      INNER JOIN StaffCourse scExisting
        ON scExisting.courseId = t.courseId
       AND (t.sectionId IS NULL OR scExisting.sectionId = t.sectionId)
      WHERE t.isActive = 'YES'
        AND t.dayOfWeek = :dayOfWeek
        AND t.periodNumber = :periodNumber
        AND scExisting.Userid IN (:staffIds)
        ${excludeClause}
      LIMIT 1
    `,
    {
      replacements: { dayOfWeek, periodNumber, staffIds, excludeTimetableId },
      transaction
    }
  );

  if (!conflicts?.length) return null;

  const conflict = conflicts[0];
  const [staff, conflictCourse, conflictSem] = await Promise.all([
    User.findByPk(conflict.staffId, { attributes: ['userName'], transaction }),
    Course.findByPk(conflict.courseId, { attributes: ['courseTitle', 'courseCode'], transaction }),
    Timetable.findByPk(conflict.timetableId, {
      attributes: ['semesterId'],
      include: [{ model: Semester, include: [{ model: Batch, attributes: ['batch', 'branch'] }] }],
      transaction
    })
  ]);

  return {
    staffName: staff?.userName || `Staff ${conflict.staffId}`,
    courseTitle: conflictCourse?.courseTitle || conflictCourse?.courseCode || `Course ${conflict.courseId}`,
    batch: conflictSem?.Semester?.Batch?.batch || 'Unknown',
    branch: conflictSem?.Semester?.Batch?.branch || 'Unknown'
  };
}

export const getAllTimetableDepartments = catchAsync(async (req, res) => {
  const departments = await Department.findAll({
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

  // Validate semesterId
  if (!semesterId || isNaN(semesterId)) {
    return res.status(400).json({ status: 'failure', message: 'Invalid semesterId' });
  }

  const entries = await Timetable.findAll({
    where: { 
      semesterId, 
      isActive: 'YES' 
    },
    include: [
      { 
        model: Course, 
        attributes: ['courseId', 'courseTitle', 'courseCode'],
        required: false 
      },
      { 
        model: Section, 
        attributes: ['sectionId', 'sectionName'],
        required: false 
      }
    ]
  });

  // Flatten/Format data to match frontend requirements
  const formattedData = entries.map(t => ({
    timetableId: t.timetableId,
    courseId: t.courseId,
    sectionId: t.sectionId || 0,
    dayOfWeek: t.dayOfWeek?.toUpperCase(),
    periodNumber: t.periodNumber,
    courseTitle: t.Course?.courseTitle || t.courseId, // Fallback if course join fails
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
    return res.status(400).json({ status: 'failure', message: 'Missing degree, Deptid, or semesterNumber' });
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
        required: true,
        include: [{ 
          model: Batch, 
          where: { degree, isActive: 'YES' },
          required: true 
        }]
      },
      { 
        model: Course, 
        attributes: ['courseId', 'courseTitle'], 
        required: false 
      },
      { 
        model: Section, 
        attributes: ['sectionId', 'sectionName'], 
        required: false 
      }
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
  const { courseId, bucketId, sectionId, dayOfWeek, periodNumber, Deptid, semesterId } = req.body;
  const userEmail = req.user?.email || 'admin'; // Using email as per your new controller logic

  const transaction = await sequelize.transaction();
  try {
    // 1. COLLECT ALL COURSE IDs TO ALLOCATE
    let coursesToAllocate = [];
    
    if (bucketId) {
      const bucketCourses = await ElectiveBucketCourse.findAll({
        where: { bucketId },
        attributes: ['courseId'],
        transaction
      });
      coursesToAllocate = bucketCourses.map(bc => bc.courseId);
    } else if (courseId) {
      coursesToAllocate = [courseId];
    }

    if (coursesToAllocate.length === 0) {
      throw new Error('No courses found to allocate.');
    }

    // 2. STAFF CONFLICT CHECK: prevent same staff from being allocated
    // to multiple courses in the same day+period.
    const staffConflict = await findStaffConflictForSlot({
      courseIds: coursesToAllocate,
      sectionId: sectionId || null,
      dayOfWeek,
      periodNumber,
      transaction
    });
    if (staffConflict) {
      throw new Error(
        `STAFF CONFLICT: ${staffConflict.staffName} is already teaching "${staffConflict.courseTitle}" for ${staffConflict.branch} (${staffConflict.batch}) in this slot.`
      );
    }

    // 4. BATCH SLOT CHECK (Prevent two subjects in the SAME batch's slot)
    const batchConflict = await Timetable.findOne({
      where: {
        semesterId,
        dayOfWeek,
        periodNumber,
        isActive: 'YES'
      },
      transaction
    });

    if (batchConflict) {
      throw new Error('This Batch already has a course assigned to this slot.');
    }

    // 5. PERFORM ALLOCATION (Loop through courses)
    const createdEntries = [];
    for (const id of coursesToAllocate) {
      const entry = await Timetable.create({
        courseId: id,
        sectionId: sectionId || null, // sectionId might be null for electives
        dayOfWeek,
        periodNumber,
        Deptid,
        semesterId,
        isActive: 'YES',
        createdBy: userEmail,
        updatedBy: userEmail
      }, { transaction });
      createdEntries.push(entry);
    }

    await transaction.commit();
    res.status(201).json({ status: 'success', message: 'Allocation successful', data: createdEntries });

  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ status: 'failure', message: error.message });
  }
});

export const updateTimetableEntry = catchAsync(async (req, res) => {
  const { timetableId } = req.params;
  const { courseId, sectionId, dayOfWeek, periodNumber, Deptid, semesterId } = req.body;
  const userEmail = req.user?.email || 'admin';

  const transaction = await sequelize.transaction();
  try {
    const entry = await Timetable.findByPk(timetableId, { transaction });
    if (!entry) throw new Error('Timetable entry not found');

    // 1. Staff Conflict Check (excluding current timetableId)
    if (courseId) {
      const conflict = await findStaffConflictForSlot({
        courseIds: [courseId],
        sectionId: sectionId || null,
        dayOfWeek,
        periodNumber,
        excludeTimetableId: timetableId,
        transaction
      });
      if (conflict) {
        throw new Error(
          `STAFF CONFLICT: ${conflict.staffName} is already teaching "${conflict.courseTitle}" for ${conflict.branch} (${conflict.batch}) in this slot.`
        );
      }
    }

    // 2. Perform Update
    await entry.update({
      courseId,
      sectionId: sectionId || null,
      dayOfWeek,
      periodNumber,
      Deptid, // Optional: Usually Dept doesn't change on edit, but included if needed
      semesterId,
      updatedBy: userEmail
    }, { transaction });

    await transaction.commit();
    res.status(200).json({ status: 'success', message: 'Updated successfully' });

  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ status: 'failure', message: error.message });
  }
});

export const deleteTimetableEntry = catchAsync(async (req, res) => {
  const { timetableId } = req.params;
  const userEmail = req.user?.email || 'admin';

  const entry = await Timetable.findByPk(timetableId);
  
  if (!entry || entry.isActive === 'NO') {
    return res.status(404).json({ status: 'failure', message: 'Timetable entry not found' });
  }

  // Soft Delete
  await entry.update({ 
    isActive: 'NO', 
    updatedBy: userEmail 
  });

  res.status(200).json({ status: 'success', message: 'Timetable entry deleted' });
});

/* =========================
   📌 Elective Buckets
   ========================= */

export const getElectiveBucketsBySemester = catchAsync(async (req, res) => {
  const { semesterId } = req.params;

  const buckets = await ElectiveBucket.findAll({
    where: { semesterId },
    attributes: ['bucketId', 'bucketNumber', 'bucketName', 'semesterId'],
    order: [['bucketNumber', 'ASC']]
  });

  res.status(200).json({ status: "success", data: buckets });
});

export const getCoursesInBucket = catchAsync(async (req, res) => {
  const { bucketId } = req.params;

  // Find courses linked to this bucket
  const courses = await Course.findAll({
    include: [{
      model: ElectiveBucketCourse,
      where: { bucketId },
      required: true,
      attributes: [] // Don't return the join table data in top level
    }],
    attributes: ['courseId', 'courseCode', 'courseTitle', 'credits'],
    order: [['courseCode', 'ASC']]
  });

  res.status(200).json({ status: "success", data: courses });
});

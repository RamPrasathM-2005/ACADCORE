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

    // 2. IDENTIFY STAFF INVOLVED (to check conflicts)
    // Find all users teaching the courses we want to allocate
    const staffCourses = await StaffCourse.findAll({
      where: { 
        courseId: { [Op.in]: coursesToAllocate } 
        // Note: You might want to add isActive check here if StaffCourse has it
      },
      attributes: ['Userid'],
      transaction
    });

    const staffIds = [...new Set(staffCourses.map(sc => sc.Userid))]; // Unique staff IDs

    // 3. GLOBAL STAFF CONFLICT CHECK
    if (staffIds.length > 0) {
      // Logic: Find if any Timetable entry exists at this time...
      // ...where the course in that timetable entry is taught by one of our staffIds.
      
      // First, find all courses that these staff members teach (anywhere)
      const allCoursesTaughtByStaff = await StaffCourse.findAll({
        where: { Userid: { [Op.in]: staffIds } },
        attributes: ['courseId'],
        transaction
      });
      
      const potentialConflictCourseIds = allCoursesTaughtByStaff.map(x => x.courseId);

      // Now query Timetable for collision
      const staffConflict = await Timetable.findOne({
        where: {
          dayOfWeek,
          periodNumber,
          isActive: 'YES',
          courseId: { [Op.in]: potentialConflictCourseIds }
        },
        include: [
          { 
            model: Course, 
            attributes: ['courseTitle'],
            include: [{
              model: StaffCourse,
              where: { Userid: { [Op.in]: staffIds } }, // Filter to find specifically who caused it
              include: [{ model: User, attributes: ['username'] }]
            }]
          },
          {
            model: Semester,
            include: [{ model: Batch, attributes: ['batch', 'branch'] }]
          }
        ],
        transaction
      });

      if (staffConflict) {
        const conflictStaffName = staffConflict.Course?.StaffCourses?.[0]?.User?.username || 'Unknown Staff';
        const conflictCourse = staffConflict.Course?.courseTitle;
        const conflictBatch = staffConflict.Semester?.Batch?.batch;
        const conflictBranch = staffConflict.Semester?.Batch?.branch;

        throw new Error(`STAFF CONFLICT: ${conflictStaffName} is already teaching "${conflictCourse}" for ${conflictBranch} (${conflictBatch}) in this slot.`);
      }
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

    // 1. Staff Conflict Check (Excluding current timetableId)
    if (courseId) {
      // Get staff for the NEW course
      const staffForNewCourse = await StaffCourse.findAll({
        where: { 
          courseId: courseId,
          // Handle Section specific staff check if sectionId provided, else check all for course
          ...(sectionId ? { [Op.or]: [{ sectionId: sectionId }, { sectionId: null }] } : {})
        },
        attributes: ['Userid'],
        transaction
      });
      
      const staffIds = staffForNewCourse.map(s => s.Userid);

      if (staffIds.length > 0) {
        // Find courses taught by these staff
        const allCoursesTaughtByStaff = await StaffCourse.findAll({
          where: { Userid: { [Op.in]: staffIds } },
          attributes: ['courseId'],
          transaction
        });
        const potentialConflictCourseIds = allCoursesTaughtByStaff.map(x => x.courseId);

        const conflict = await Timetable.findOne({
          where: {
            dayOfWeek,
            periodNumber,
            isActive: 'YES',
            timetableId: { [Op.ne]: timetableId }, // Exclude current record
            courseId: { [Op.in]: potentialConflictCourseIds }
          },
          include: [
            { 
              model: Course,
              include: [{
                model: StaffCourse,
                where: { Userid: { [Op.in]: staffIds } },
                include: [{ model: User, attributes: ['username'] }]
              }]
            },
            {
              model: Semester,
              include: [{ model: Batch, attributes: ['batch'] }]
            }
          ],
          transaction
        });

        if (conflict) {
          const conflictStaffName = conflict.Course?.StaffCourses?.[0]?.User?.username || 'Staff';
          const conflictBatch = conflict.Semester?.Batch?.batch;
          throw new Error(`Staff Conflict: ${conflictStaffName} is already busy with Batch ${conflictBatch}.`);
        }
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
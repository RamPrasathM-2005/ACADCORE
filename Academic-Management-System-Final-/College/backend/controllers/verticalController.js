// controllers/timetableAllocationController.js
import db from "../models/index.js";
import catchAsync from "../utils/catchAsync.js";
import { Op } from "sequelize";

const { 
  sequelize, Batch, Regulation, Vertical, VerticalCourse, 
  RegulationCourse, Timetable, ElectiveBucketCourse, Course 
} = db;

// GET regulation for a batch + department
export const getRegulationByBatchAndDept = catchAsync(async (req, res) => {
  const { batchId, Deptid } = req.query;

  if (!batchId || !Deptid) {
    return res.status(400).json({ status: "error", message: "batchId and Deptid are required" });
  }

  const batch = await Batch.findOne({
    where: { batchId },
    include: [{
      model: Regulation,
      where: { Deptid, isActive: 'YES' },
      required: true,
      attributes: ['regulationId', 'regulationYear', 'Deptid']
    }]
  });

  if (!batch || !batch.Regulation) {
    return res.status(404).json({
      status: "error",
      message: "No active regulation found for this batch and department",
    });
  }

  res.json({
    status: "success",
    data: batch.Regulation,
  });
});

// GET all verticals for a regulation
export const getVerticalsByRegulation = catchAsync(async (req, res) => {
  const { regulationId } = req.params;

  const verticals = await Vertical.findAll({
    where: { regulationId, isActive: 'YES' },
    order: [['verticalName', 'ASC']]
  });

  res.json({
    status: "success",
    data: verticals,
  });
});

// GET vertical courses for a vertical + semester number
export const getVerticalCourses = catchAsync(async (req, res) => {
  const { verticalId, semesterNumber } = req.params;

  const courses = await RegulationCourse.findAll({
    where: { semesterNumber, isActive: 'YES' },
    include: [{
      model: VerticalCourse,
      where: { verticalId },
      required: true,
      attributes: []
    }],
    order: [['courseCode', 'ASC']]
  });

  res.json({
    status: "success",
    data: courses,
  });
});

// Allocate Slot (Complex Logic)
export const allocateTimetableSlot = catchAsync(async (req, res) => {
  const { dayOfWeek, periodNumber, course, bucketId, semesterId, Deptid } = req.body;
  const userName = req.user?.userName || 'admin';

  // 1. Basic Validation
  if (!dayOfWeek || !periodNumber || !semesterId || !Deptid) {
    return res.status(400).json({ status: "error", message: "Required fields missing" });
  }

  const validDays = ["MON", "TUE", "WED", "THU", "FRI"];
  if (!validDays.includes(dayOfWeek.toUpperCase())) {
    return res.status(400).json({ status: "error", message: "Invalid dayOfWeek" });
  }

  if (periodNumber < 1 || periodNumber > 8) {
    return res.status(400).json({ status: "error", message: "Period must be 1-8" });
  }

  const transaction = await sequelize.transaction();

  try {
    // 2. Clear existing entries for this slot
    await Timetable.destroy({
      where: {
        semesterId,
        Deptid,
        dayOfWeek: dayOfWeek.toUpperCase(),
        periodNumber
      },
      transaction
    });

    const entriesToCreate = [];

    // CASE 1: Bucket allocation (Electives)
    if (bucketId) {
      const bucketCourses = await ElectiveBucketCourse.findAll({
        where: { bucketId },
        include: [{ model: Course, attributes: ['courseId', 'courseCode'] }],
        transaction
      });

      if (bucketCourses.length === 0) {
        throw new Error("This bucket has no courses");
      }

      bucketCourses.forEach((ebc) => {
        if (ebc.Course) {
          entriesToCreate.push({
            semesterId,
            courseId: ebc.Course.courseId,
            dayOfWeek: dayOfWeek.toUpperCase(),
            periodNumber,
            Deptid,
            createdBy: userName
          });
        }
      });
    }
    // CASE 2: Single regular course
    else if (course) {
      // Check standard Course table first, then RegulationCourse (fallback)
      let targetCourse = await Course.findByPk(course, { transaction });
      if (!targetCourse) {
        targetCourse = await RegulationCourse.findByPk(course, { transaction });
      }

      if (!targetCourse) throw new Error("Course not found");

      entriesToCreate.push({
        semesterId,
        courseId: targetCourse.courseId || targetCourse.regCourseId,
        dayOfWeek: dayOfWeek.toUpperCase(),
        periodNumber,
        Deptid,
        createdBy: userName
      });
    }
    // CASE 3: Free period
    else {
      entriesToCreate.push({
        semesterId,
        courseId: null,
        dayOfWeek: dayOfWeek.toUpperCase(),
        periodNumber,
        Deptid,
        createdBy: userName
      });
    }

    // 3. Bulk Create
    if (entriesToCreate.length > 0) {
      await Timetable.bulkCreate(entriesToCreate, { transaction });
    }

    await transaction.commit();
    res.json({
      status: "success",
      message: `Allocated ${entriesToCreate.length} course(s) to slot`,
      count: entriesToCreate.length
    });

  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ status: "error", message: error.message });
  }
});
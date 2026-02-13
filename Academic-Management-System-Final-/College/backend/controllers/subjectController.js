// controllers/subjectController.js
import db from "../models/index.js";
import catchAsync from "../utils/catchAsync.js";
import Joi from 'joi';
import { Op } from "sequelize";

const { sequelize, Course, Semester, Batch } = db;

// Valid enum values
const validTypes = ['THEORY', 'INTEGRATED', 'PRACTICAL', 'EXPERIENTIAL LEARNING'];
const validCategories = ['HSMC', 'BSC', 'ESC', 'PEC', 'OEC', 'EEC', 'PCC'];
const validIsActive = ['YES', 'NO'];

const addCourseSchema = Joi.object({
  courseCode: Joi.string().trim().max(20).required(),
  semesterId: Joi.number().integer().positive().required(),
  courseTitle: Joi.string().trim().max(255).required(),
  type: Joi.string().valid(...validTypes).required(),
  category: Joi.string().valid(...validCategories).required(),
  minMark: Joi.number().integer().min(0).required(),
  maxMark: Joi.number().integer().min(0).required(),
  isActive: Joi.string().valid(...validIsActive).optional(),
  lectureHours: Joi.number().integer().min(0).required(),
  tutorialHours: Joi.number().integer().min(0).required(),
  practicalHours: Joi.number().integer().min(0).required(),
  experientialHours: Joi.number().integer().min(0).required(),
  totalContactPeriods: Joi.number().integer().min(0).required(),
  credits: Joi.number().integer().min(0).required(),
}).custom((value, helpers) => {
  if (value.minMark > value.maxMark) {
    return helpers.error('any.custom', { message: 'minMark must be less than or equal to maxMark' });
  }
  return value;
});

export const addCourse = catchAsync(async (req, res) => {
  const userName = req.user?.userName || 'admin';
  
  const { error, value } = addCourseSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    return res.status(400).json({
      status: 'failure',
      message: 'Validation error: ' + error.details.map(d => d.message).join('; '),
    });
  }

  const transaction = await sequelize.transaction();

  try {
    // 1. Validate semester exists
    const semester = await Semester.findOne({ 
      where: { semesterId: value.semesterId, isActive: 'YES' },
      transaction 
    });
    if (!semester) throw new Error(`No active semester found with ID ${value.semesterId}`);

    // 2. Check for existing courseCode in the same semester
    const existingCourse = await Course.findOne({ 
      where: { courseCode: value.courseCode, semesterId: value.semesterId },
      transaction 
    });

    let courseResult;

    if (existingCourse) {
      if (existingCourse.isActive === 'YES') {
        throw new Error(`Course code ${value.courseCode} already exists in this semester`);
      } else {
        // Update/Reactivate existing inactive course
        courseResult = await existingCourse.update({
          ...value,
          category: value.category.toUpperCase(),
          isActive: 'YES',
          updatedBy: userName
        }, { transaction });
      }
    } else {
      // Insert new course
      courseResult = await Course.create({
        ...value,
        category: value.category.toUpperCase(),
        createdBy: userName,
        updatedBy: userName
      }, { transaction });
    }

    await transaction.commit();
    res.status(201).json({
      status: 'success',
      message: 'Course added successfully',
      courseId: courseResult.courseId,
    });
  } catch (err) {
    await transaction.rollback();
    res.status(400).json({ status: 'failure', message: err.message });
  }
});

export const importCourses = catchAsync(async (req, res) => {
  const { courses } = req.body;
  const userName = req.user?.userName || 'admin';

  if (!Array.isArray(courses) || courses.length === 0) {
    return res.status(400).json({ status: 'failure', message: 'No courses provided' });
  }

  const transaction = await sequelize.transaction();
  try {
    let importedCount = 0;
    const errors = [];

    for (const courseData of courses) {
      const { error, value } = addCourseSchema.validate(courseData, { convert: true });
      if (error) {
        errors.push(`Course ${courseData.courseCode || 'unknown'}: ${error.message}`);
        continue;
      }

      // Check semester
      const sem = await Semester.findOne({ where: { semesterId: value.semesterId, isActive: 'YES' }, transaction });
      if (!sem) {
        errors.push(`Course ${value.courseCode}: Semester ${value.semesterId} not found`);
        continue;
      }

      // Logic: Update if exists (even if inactive), Create if new
      const [course, created] = await Course.findOrCreate({
        where: { courseCode: value.courseCode, semesterId: value.semesterId },
        defaults: { ...value, createdBy: userName, updatedBy: userName },
        transaction
      });

      if (!created) {
        if (course.isActive === 'YES') {
          errors.push(`Course ${value.courseCode} already exists in this semester`);
        } else {
          await course.update({ ...value, isActive: 'YES', updatedBy: userName }, { transaction });
          importedCount++;
        }
      } else {
        importedCount++;
      }
    }

    await transaction.commit();
    res.status(200).json({
      status: 'success',
      message: `Imported ${importedCount} courses successfully`,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ status: 'failure', message: err.message });
  }
});

export const getAllCourse = catchAsync(async (req, res) => {
  const courses = await Course.findAll({
    where: { isActive: 'YES' },
    include: [{
      model: Semester,
      include: [{ model: Batch, attributes: ['branch'] }]
    }]
  });

  // Flatten the branch name into the top level for frontend compatibility
  const data = courses.map(c => ({
    ...c.toJSON(),
    branch: c.Semester?.Batch?.branch
  }));

  res.status(200).json({
    status: 'success',
    results: data.length,
    data
  });
});

export const getCourseBySemester = catchAsync(async (req, res) => {
  const { semesterId } = req.params;

  const courses = await Course.findAll({
    where: { semesterId, isActive: 'YES' },
    include: [{
      model: Semester,
      include: [{ model: Batch, attributes: ['branch'] }]
    }]
  });

  if (courses.length === 0) {
    return res.status(404).json({ status: "failure", message: "No active courses found for this semester" });
  }

  const data = courses.map(c => ({
    ...c.toJSON(),
    branch: c.Semester?.Batch?.branch
  }));

  res.status(200).json({ status: "success", data });
});

export const updateCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const userName = req.user?.userName || 'admin';

  const transaction = await sequelize.transaction();
  try {
    const course = await Course.findByPk(courseId, { transaction });
    if (!course || course.isActive === 'NO') throw new Error('Course not found');

    // If courseCode or semesterId is changing, check for conflicts
    if (req.body.courseCode || req.body.semesterId) {
      const code = req.body.courseCode || course.courseCode;
      const semId = req.body.semesterId || course.semesterId;

      const conflict = await Course.findOne({
        where: { 
          courseCode: code, 
          semesterId: semId, 
          courseId: { [Op.ne]: courseId },
          isActive: 'YES' 
        },
        transaction
      });
      if (conflict) throw new Error('Course code already exists in that semester');
    }

    await course.update({
      ...req.body,
      category: req.body.category ? req.body.category.toUpperCase() : course.category,
      updatedBy: userName
    }, { transaction });

    await transaction.commit();
    res.status(200).json({ status: 'success', message: 'Course updated successfully' });
  } catch (err) {
    await transaction.rollback();
    res.status(400).json({ status: 'failure', message: err.message });
  }
});

export const deleteCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const userName = req.user?.userName || 'admin';

  const course = await Course.findByPk(courseId);
  if (!course) return res.status(404).json({ status: 'failure', message: 'Course not found' });

  // Soft delete
  await course.update({ isActive: 'NO', updatedBy: userName });

  res.status(200).json({ status: 'success', message: 'Course deleted successfully' });
});
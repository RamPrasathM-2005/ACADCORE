// controllers/sectionController.js
import db from "../models/index.js";
import catchAsync from "../utils/catchAsync.js";
import { Op } from "sequelize";

const { sequelize, Section, Course, User, StaffCourse, Semester, Batch, Department } = db;

export const addSectionsToCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const { numberOfSections } = req.body;
  const userName = req.user?.userName || 'admin';

  if (!courseId || !numberOfSections || isNaN(numberOfSections) || numberOfSections < 1) {
    return res.status(400).json({
      status: 'failure',
      message: 'courseId and a valid numberOfSections (minimum 1) are required',
    });
  }

  const transaction = await sequelize.transaction();

  try {
    // 1. Validate course
    const course = await Course.findOne({ 
      where: { courseId, isActive: 'YES' },
      transaction 
    });
    if (!course) {
      throw new Error(`No active course found with courseId ${courseId}`);
    }

    // 2. Find the current maximum Batch number (SQL: Batch 1, Batch 2...)
    // We use a literal replacement for the SUBSTRING logic
    const maxSection = await Section.findOne({
      attributes: [
        [sequelize.literal("MAX(CAST(SUBSTRING(sectionName, 7) AS UNSIGNED))"), "maxNum"]
      ],
      where: { 
        courseId, 
        sectionName: { [Op.like]: 'Batch %' } 
      },
      transaction,
      raw: true
    });

    const currentMax = maxSection?.maxNum || 0;
    const sectionsAdded = [];
    const sectionsReactivated = [];

    for (let i = 1; i <= numberOfSections; i++) {
      const sectionNum = currentMax + i;
      const sectionName = `Batch ${sectionNum}`;

      // 3. Find or Create logic manually to handle reactivation
      const [section, created] = await Section.findOrCreate({
        where: { courseId, sectionName },
        defaults: {
          courseId,
          sectionName,
          isActive: 'YES',
          createdBy: userName,
          updatedBy: userName
        },
        transaction
      });

      if (!created && section.isActive === 'NO') {
        // Reactivate
        await section.update({ 
            isActive: 'YES', 
            updatedBy: userName 
        }, { transaction });
        sectionsReactivated.push(sectionName);
      } else if (created) {
        sectionsAdded.push(sectionName);
      }
    }

    await transaction.commit();
    res.status(201).json({
      status: 'success',
      message: `${sectionsAdded.length} new section(s) added and ${sectionsReactivated.length} section(s) reactivated for course ${course.courseCode}`,
      data: { added: sectionsAdded, reactivated: sectionsReactivated }
    });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ status: 'failure', message: err.message });
  }
});

export const getSectionsForCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;

  const sections = await Section.findAll({
    where: { courseId, isActive: 'YES' },
    include: [{
      model: Course,
      attributes: ['courseCode']
    }]
  });

  res.status(200).json({
    status: 'success',
    data: sections.map(s => ({
      sectionId: s.sectionId,
      sectionName: s.sectionName,
      courseCode: s.Course?.courseCode
    })),
  });
});

export const updateSectionsForCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const { sections } = req.body; // Array of { sectionId, sectionName, isActive }
  const userName = req.user?.userName || 'admin';

  const transaction = await sequelize.transaction();
  try {
    for (const item of sections) {
      const { sectionId, sectionName, isActive } = item;
      
      const section = await Section.findOne({
        where: { sectionId, courseId },
        transaction
      });

      if (section) {
        await section.update({
          sectionName: sectionName || section.sectionName,
          isActive: isActive || section.isActive,
          updatedBy: userName
        }, { transaction });
      }
    }

    await transaction.commit();
    res.status(200).json({ status: 'success', message: 'Sections updated successfully' });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ status: 'failure', message: err.message });
  }
});

export const deleteSection = catchAsync(async (req, res) => {
  const { courseId, sectionName } = req.params;
  const userName = req.user?.userName || 'admin';

  const section = await Section.findOne({
    where: { courseId, sectionName, isActive: 'YES' }
  });

  if (!section) {
    return res.status(404).json({ status: 'failure', message: 'Section not found' });
  }

  // Soft delete
  await section.update({ isActive: 'NO', updatedBy: userName });

  res.status(200).json({ status: 'success', message: `Section ${sectionName} deleted successfully` });
});

export const allocateStaffToCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const { Userid, sectionId, Deptid } = req.body;
  const userName = req.user?.userName || 'admin';

  const transaction = await sequelize.transaction();
  try {
    // 1. Validations
    const course = await Course.findOne({ where: { courseId, isActive: 'YES' }, transaction });
    if (!course) throw new Error('Active course not found');

    const section = await Section.findOne({ where: { sectionId, courseId, isActive: 'YES' }, transaction });
    if (!section) throw new Error('Active section not found for this course');

    const staff = await User.findOne({ 
      where: { userId: Userid, departmentId: Deptid, status: 'Active' },
      transaction 
    });
    if (!staff) throw new Error('Staff user not found or inactive');

    // 2. Prevent duplicate allocation for the same course in different sections
    const existing = await StaffCourse.findOne({
      where: { Userid, courseId, sectionId: { [Op.ne]: sectionId } },
      transaction
    });
    if (existing) throw new Error('Staff is already allocated to another section of this course');

    // 3. Create allocation
    const allocation = await StaffCourse.create({
      Userid,
      courseId,
      sectionId,
      Deptid,
      createdBy: userName,
      updatedBy: userName
    }, { transaction });

    await transaction.commit();
    res.status(201).json({ status: 'success', data: allocation });
  } catch (err) {
    await transaction.rollback();
    res.status(400).json({ status: 'failure', message: err.message });
  }
});

export const getSections = catchAsync(async (req, res) => {
  const { courseId, semesterId } = req.query;

  const whereCondition = { isActive: 'YES' };
  if (courseId) whereCondition.courseId = courseId;

  const sections = await Section.findAll({
    where: whereCondition,
    include: [{
      model: Course,
      where: { isActive: 'YES', ...(semesterId && { semesterId }) },
      attributes: ['courseCode', 'semesterId'],
      include: [{
        model: Semester,
        attributes: ['batchId'],
        include: [{
            model: Batch,
            attributes: ['branch']
        }]
      }]
    }]
  });

  // Flatten the data for the frontend
  const formatted = sections.map(s => ({
    sectionId: s.sectionId,
    sectionName: s.sectionName,
    courseId: s.courseId,
    courseCode: s.Course?.courseCode,
    semesterId: s.Course?.semesterId,
    batchId: s.Course?.Semester?.batchId,
    branch: s.Course?.Semester?.Batch?.branch
  }));

  res.status(200).json({ status: 'success', data: formatted });
});
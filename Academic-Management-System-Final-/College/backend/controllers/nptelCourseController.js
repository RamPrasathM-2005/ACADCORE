// controllers/nptelCourseController.js
import db from "../models/index.js";
import catchAsync from "../utils/catchAsync.js";
import Joi from 'joi';

const { 
  sequelize, 
  NptelCourse, 
  Semester, 
  Batch, 
  NptelCreditTransfer, 
  StudentNptelEnrollment, 
  StudentDetails, 
  User 
} = db;
const { Op } = db.Sequelize;

const validNptelTypes = ['OEC', 'PEC'];

const nptelCourseSchema = Joi.object({
  courseTitle: Joi.string().trim().max(255).required(),
  courseCode: Joi.string().trim().max(50).required(),
  type: Joi.string().valid(...validNptelTypes).required(),
  credits: Joi.number().integer().min(1).max(10).required(),
  semesterId: Joi.number().integer().positive().required(),
});

export const addNptelCourse = catchAsync(async (req, res) => {
  const userName = req.user?.userName || 'admin';

  const { error, value } = nptelCourseSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      status: 'failure',
      message: 'Validation error: ' + error.details.map(d => d.message).join('; '),
    });
  }

  const { courseTitle, courseCode, type, credits, semesterId } = value;

  const transaction = await sequelize.transaction();
  try {
    // Check Semester
    const semester = await Semester.findOne({ 
      where: { semesterId, isActive: 'YES' },
      transaction 
    });
    if (!semester) throw new Error(`No active semester found with ID ${semesterId}`);

    // Check Duplicate
    const existing = await NptelCourse.findOne({
      where: { courseCode, semesterId, isActive: 'YES' },
      transaction
    });
    if (existing) throw new Error(`NPTEL course with code ${courseCode} already exists in this semester`);

    const newCourse = await NptelCourse.create({
      courseTitle, courseCode, type, credits, semesterId,
      createdBy: userName,
      updatedBy: userName
    }, { transaction });

    await transaction.commit();
    res.status(201).json({
      status: 'success',
      message: 'NPTEL course added successfully',
      nptelCourseId: newCourse.nptelCourseId,
    });
  } catch (err) {
    await transaction.rollback();
    res.status(400).json({ status: 'failure', message: err.message });
  }
});

export const bulkAddNptelCourses = catchAsync(async (req, res) => {
  const { courses } = req.body;
  const userName = req.user?.userName || 'admin';

  if (!Array.isArray(courses) || courses.length === 0) {
    return res.status(400).json({ status: 'failure', message: 'No courses provided' });
  }

  const transaction = await sequelize.transaction();
  try {
    let importedCount = 0;
    const errors = [];

    for (const [index, course] of courses.entries()) {
      const { error, value } = nptelCourseSchema.validate(course);
      if (error) {
        errors.push(`Row ${index + 2}: ${error.message}`);
        continue;
      }

      const semester = await Semester.findOne({ where: { semesterId: value.semesterId, isActive: 'YES' }, transaction });
      if (!semester) {
        errors.push(`Row ${index + 2}: Invalid semesterId`);
        continue;
      }

      const [record, created] = await NptelCourse.findOrCreate({
        where: { courseCode: value.courseCode, semesterId: value.semesterId, isActive: 'YES' },
        defaults: { ...value, createdBy: userName, updatedBy: userName },
        transaction
      });

      if (created) importedCount++;
      else errors.push(`Row ${index + 2}: Duplicate courseCode ${value.courseCode}`);
    }

    await transaction.commit();
    res.status(200).json({
      status: 'success',
      message: `Successfully imported ${importedCount} courses`,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ status: 'failure', message: err.message });
  }
});

export const getAllNptelCourses = catchAsync(async (req, res) => {
  const rows = await NptelCourse.findAll({
    where: { isActive: 'YES' },
    include: [{
      model: Semester,
      attributes: ['semesterNumber'],
      include: [{ model: Batch, attributes: ['branch', 'batch'] }]
    }],
    order: [['nptelCourseId', 'DESC']]
  });

  res.status(200).json({ status: 'success', data: rows });
});

export const updateNptelCourse = catchAsync(async (req, res) => {
  const { nptelCourseId } = req.params;
  const userName = req.user?.userName || 'admin';

  const { error, value } = nptelCourseSchema.validate(req.body);
  if (error) return res.status(400).json({ status: 'failure', message: error.message });

  const transaction = await sequelize.transaction();
  try {
    const course = await NptelCourse.findByPk(nptelCourseId, { transaction });
    if (!course || course.isActive === 'NO') throw new Error('Course not found');

    // Check duplicates if code or semester changed
    const duplicate = await NptelCourse.findOne({
      where: {
        courseCode: value.courseCode,
        semesterId: value.semesterId,
        nptelCourseId: { [Op.ne]: nptelCourseId },
        isActive: 'YES'
      },
      transaction
    });
    if (duplicate) throw new Error('Course code already exists in this semester');

    await course.update({ ...value, updatedBy: userName }, { transaction });
    await transaction.commit();

    res.status(200).json({ status: 'success', message: 'NPTEL course updated successfully' });
  } catch (err) {
    await transaction.rollback();
    res.status(400).json({ status: 'failure', message: err.message });
  }
});

export const deleteNptelCourse = catchAsync(async (req, res) => {
  const { nptelCourseId } = req.params;
  const userName = req.user?.userName || 'admin';

  const course = await NptelCourse.findByPk(nptelCourseId);
  if (!course) return res.status(404).json({ status: 'failure', message: 'Not found' });

  await course.update({ isActive: 'NO', updatedBy: userName });
  res.status(200).json({ status: 'success', message: 'NPTEL course deleted successfully' });
});

export const getPendingNptelTransfers = catchAsync(async (req, res) => {
  const rows = await NptelCreditTransfer.findAll({
    include: [
      {
        model: StudentNptelEnrollment,
        include: [{ model: NptelCourse }]
      },
      {
        model: StudentDetails,
        include: [{ model: User, as: 'userAccount', attributes: ['userName'] }]
      }
    ],
    order: [
      [sequelize.literal('studentRespondedAt IS NULL'), 'DESC'],
      ['studentRespondedAt', 'DESC']
    ]
  });

  // Flattening data for frontend compatibility
  const formatted = rows.map(r => ({
    transferId: r.transferId,
    regno: r.regno,
    studentName: r.StudentDetail?.userAccount?.userName,
    courseTitle: r.StudentNptelEnrollment?.NptelCourse?.courseTitle,
    courseCode: r.StudentNptelEnrollment?.NptelCourse?.courseCode,
    type: r.StudentNptelEnrollment?.NptelCourse?.type,
    credits: r.StudentNptelEnrollment?.NptelCourse?.credits,
    grade: r.grade,
    studentStatus: r.studentStatus,
    studentRespondedAt: r.studentRespondedAt,
    studentRemarks: r.studentRemarks
  }));

  res.status(200).json({ status: "success", data: formatted });
});

export const approveRejectTransfer = catchAsync(async (req, res) => {
  const { transferId, action, remarks } = req.body;
  const userName = req.user?.userName || 'admin';

  if (!['accepted', 'rejected'].includes(action)) {
    return res.status(400).json({ status: "failure", message: "Invalid action" });
  }

  const transfer = await NptelCreditTransfer.findByPk(transferId);
  if (!transfer) return res.status(404).json({ status: "failure", message: "Request not found" });

  await transfer.update({
    studentStatus: action,
    studentRespondedAt: new Date(),
    studentRemarks: remarks || null,
    // Add audit fields if they exist in your schema
  });

  res.status(200).json({ status: "success", message: `Request ${action} successfully` });
});
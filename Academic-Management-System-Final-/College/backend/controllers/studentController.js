import db from "../models/index.js";
import catchAsync from "../utils/catchAsync.js";
import { Op } from "sequelize";

const { 
  StudentDetails, 
  Batch, 
  Semester, 
  Course, 
  Section, 
  StudentCourse, 
  StaffCourse, 
  User, 
  Department,
  sequelize 
} = db;

// Helper to safely get current user ID (handles both 'id' from JWT and 'userId' naming)
const getCurrentUserId = (req) => req.user?.id || req.user?.userId;

/**
 * Adds a new student - Creates both User and StudentDetails records
 */
export const addStudent = catchAsync(async (req, res) => {
  const currentUserId = getCurrentUserId(req);
  if (!currentUserId) {
    return res.status(401).json({ status: "failure", message: "Not authenticated - please login" });
  }

  const { rollnumber, name, degree, branch, batch, semesterNumber, email, password } = req.body;
  
  if (!rollnumber || !name || !degree || !branch || !batch || !semesterNumber) {
    return res.status(400).json({ status: "failure", message: "All fields are required" });
  }

  const t = await sequelize.transaction();

  try {
    const existing = await User.findOne({ where: { userNumber: rollnumber } });
    if (existing) {
      throw new Error("Student with this roll number already exists");
    }

    const batchRecord = await Batch.findOne({
      where: { degree, branch, batch, isActive: 'YES' }
    });
    if (!batchRecord) throw new Error(`Batch ${batch} for ${branch} not found`);

    const newUser = await User.create({
      companyId: 1,
      userNumber: rollnumber,
      userName: name,
      userMail: email || `${rollnumber}@nec.edu.in`,
      password: password || "$2b$10$fCgaFOA0WC5ak9q7H9fMlO2mP9EbFXaH7JzHZNmYgT43I.pWxhSoG",
      roleId: 3, 
      departmentId: batchRecord.regulationId ? 2 : batchRecord.Deptid,
      status: 'Active',
      createdBy: currentUserId
    }, { transaction: t });

    await StudentDetails.create({
      companyId: 1,
      studentName: name,
      registerNumber: rollnumber,
      departmentId: batchRecord.Deptid,
      batch: batch,
      semester: semesterNumber,
      pending: true,
      createdBy: currentUserId
    }, { transaction: t });

    await t.commit();
    res.status(201).json({ status: "success", message: "Student added successfully", rollnumber });
  } catch (error) {
    await t.rollback();
    res.status(400).json({ status: "failure", message: error.message });
  }
});

/**
 * Gets all students with their batch info
 */
export const getAllStudents = catchAsync(async (req, res) => {
  const students = await StudentDetails.findAll({
    include: [{
      model: Department,
      as: 'department',
      attributes: ['Deptname', 'Deptacronym']
    }],
    order: [['registerNumber', 'ASC']]
  });

  res.status(200).json({ status: "success", data: students });
});

/**
 * Updates student profile
 */
export const updateStudent = catchAsync(async (req, res) => {
  const currentUserId = getCurrentUserId(req);
  if (!currentUserId) {
    return res.status(401).json({ status: "failure", message: "Not authenticated - please login" });
  }

  const { rollnumber } = req.params;
  const { name, semesterNumber, batch, status } = req.body;

  const student = await StudentDetails.findOne({ where: { registerNumber: rollnumber } });
  if (!student) return res.status(404).json({ status: "failure", message: "Student not found" });

  await sequelize.transaction(async (t) => {
    await student.update({
      studentName: name || student.studentName,
      semester: semesterNumber || student.semester,
      batch: batch || student.batch,
      updatedBy: currentUserId
    }, { transaction: t });

    if (name) {
      await User.update({ userName: name }, { where: { userNumber: rollnumber }, transaction: t });
    }
  });

  res.status(200).json({ status: "success", message: "Student updated successfully" });
});

/**
 * Gets courses a student is enrolled in, including staff names
 */
export const getStudentEnrolledCourses = catchAsync(async (req, res) => {
  const { rollnumber } = req.params;

  const enrollments = await StudentCourse.findAll({
    where: { regno: rollnumber },
    include: [
      { 
        model: Course, 
        attributes: ['courseCode', 'courseTitle', 'credits'] 
      },
      { 
        model: Section, 
        attributes: ['sectionName'] 
      }
    ]
  });

  const data = await Promise.all(enrollments.map(async (e) => {
    const staffAlloc = await StaffCourse.findOne({
      where: { courseId: e.courseId, sectionId: e.sectionId },
      include: [{ model: User, attributes: ['userName'] }]
    });

    return {
      courseId: e.courseId,
      courseCode: e.Course?.courseCode,
      courseName: e.Course?.courseTitle,
      section: e.Section?.sectionName,
      staff: staffAlloc?.User?.userName || "Not Assigned"
    };
  }));

  res.status(200).json({ status: "success", data });
});

/**
 * Distinct list of branches from Batch table
 */
export const getBranches = catchAsync(async (req, res) => {
  const branches = await Batch.findAll({
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('branch')), 'branch']],
    where: { isActive: 'YES' },
    raw: true
  });
  res.status(200).json({ status: "success", data: branches.map(b => b.branch) });
});

/**
 * Distinct list of semesters
 */
export const getSemesters = catchAsync(async (req, res) => {
  const semesters = await Semester.findAll({
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('semesterNumber')), 'semesterNumber']],
    where: { isActive: 'YES' },
    order: [['semesterNumber', 'ASC']],
    raw: true
  });
  res.status(200).json({ status: "success", data: semesters.map(s => `Semester ${s.semesterNumber}`) });
});

/**
 * Delete student and their user account
 */
export const deleteStudent = catchAsync(async (req, res) => {
  const currentUserId = getCurrentUserId(req);
  if (!currentUserId) {
    return res.status(401).json({ status: "failure", message: "Not authenticated - please login" });
  }

  const { rollnumber } = req.params;

  const result = await sequelize.transaction(async (t) => {
    const sDeleted = await StudentDetails.destroy({ where: { registerNumber: rollnumber }, transaction: t });
    const uDeleted = await User.destroy({ where: { userNumber: rollnumber }, transaction: t });
    return sDeleted || uDeleted;
  });

  if (!result) return res.status(404).json({ status: "failure", message: "Student not found" });

  res.status(200).json({ status: "success", message: `Student ${rollnumber} deleted successfully` });
});

/**
 * Gets list of batches filtered by branch
 */
export const getBatches = catchAsync(async (req, res) => {
  const { branch } = req.query;
  const filter = { isActive: 'YES' };
  if (branch) filter.branch = branch;

  const batches = await Batch.findAll({ where: filter });
  res.status(200).json({ status: "success", data: batches });
});

/**
 * Gets a single student's full profile by roll number
 */
export const getStudentByRollNumber = catchAsync(async (req, res) => {
  const { rollnumber } = req.params;

  const student = await StudentDetails.findOne({
    where: { registerNumber: rollnumber },
    include: [
      { 
        model: Department, 
        as: 'department', 
        attributes: ['Deptname', 'Deptacronym'] 
      },
      {
        model: User,
        as: 'creator',
        attributes: ['userName']
      }
    ]
  });

  if (!student) {
    return res.status(404).json({ 
      status: "failure", 
      message: "Student profile not found" 
    });
  }

  const responseData = {
    ...student.toJSON(),
    rollnumber: student.registerNumber,
    name: student.studentName
  };

  res.status(200).json({ 
    status: "success", 
    data: responseData 
  });
});

/**
 * Gets a list of students enrolled in a specific course and section
 */
export const getStudentsByCourseAndSection = catchAsync(async (req, res) => {
  const { courseCode, sectionId } = req.query;

  if (!courseCode || !sectionId) {
    return res.status(400).json({ 
      status: "failure", 
      message: "courseCode and sectionId are required" 
    });
  }

  const course = await Course.findOne({ 
    where: { courseCode, isActive: 'YES' } 
  });

  if (!course) {
    return res.status(404).json({ status: 'failure', message: 'Course not found' });
  }

  const enrollments = await StudentCourse.findAll({
    where: { 
      courseId: course.courseId, 
      sectionId: sectionId 
    },
    include: [
      { 
        model: StudentDetails,
        attributes: ['registerNumber', 'studentName', 'batch']
      },
      { 
        model: Section, 
        attributes: ['sectionName'] 
      }
    ]
  });

  const data = enrollments.map(e => ({
    rollnumber: e.regno,
    name: e.StudentDetail?.studentName,
    batch: e.StudentDetail?.batch,
    sectionName: e.Section?.sectionName
  }));

  res.status(200).json({ status: 'success', data });
});
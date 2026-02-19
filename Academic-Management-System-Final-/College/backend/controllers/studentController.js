// controllers/studentController.js
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
  Department 
} = db;

export const addStudent = catchAsync(async (req, res) => {
  const { rollnumber, name, degree, branch, batch, semesterNumber } = req.body;
  const userName = req.user?.userName || req.user?.userMail || 'admin';

  if (!rollnumber || !name || !degree || !branch || !batch || !semesterNumber) {
    return res.status(400).json({ status: "failure", message: "All fields are required" });
  }

  // 1. Check if student already exists
  const existing = await StudentDetails.findOne({ where: { registerNumber: rollnumber } });
  if (existing) {
    return res.status(400).json({ status: "failure", message: "Student with this roll number already exists" });
  }

  // 2. Find Batch
  const batchRecord = await Batch.findOne({
    where: { degree, branch, batch, isActive: 'YES' }
  });

  if (!batchRecord) {
    return res.status(404).json({ status: "failure", message: `Batch ${batch} - ${branch} not found` });
  }

  // 3. Create Student Detail
  // Note: We map rollnumber to registerNumber and name to studentName based on our Model
  await StudentDetails.create({
    registerNumber: rollnumber,
    studentName: name,
    batch: batch,
    semester: semesterNumber,
    departmentId: batchRecord.Deptid, // Assuming Batch has Deptid or linked to it
    createdBy: req.user?.id,
    updatedBy: req.user?.id
  });

  res.status(201).json({
    status: "success",
    message: "Student added successfully",
    rollnumber: rollnumber,
  });
});

export const getAllStudents = catchAsync(async (req, res) => {
  const students = await StudentDetails.findAll({
    include: [{
      model: Batch,
      as: 'batchInfo', // Ensure this matches your association alias
      where: { isActive: 'YES' },
      required: true
    }],
    order: [['registerNumber', 'ASC']]
  });

  // Map fields to match original response format
  const data = students.map(s => ({
    ...s.toJSON(),
    rollnumber: s.registerNumber,
    name: s.studentName
  }));

  res.status(200).json({ status: "success", data });
});

export const getStudentByRollNumber = catchAsync(async (req, res) => {
  const { rollnumber } = req.params;
  const student = await StudentDetails.findOne({
    where: { registerNumber: rollnumber },
    include: [{ model: Batch }]
  });

  if (!student) {
    return res.status(404).json({ status: "failure", message: "Student not found" });
  }

  res.status(200).json({ 
    status: "success", 
    data: { ...student.toJSON(), rollnumber: student.registerNumber, name: student.studentName } 
  });
});

export const updateStudent = catchAsync(async (req, res) => {
  const { rollnumber } = req.params;
  const { name, degree, branch, batch, semesterNumber } = req.body;
  const userName = req.user?.userName || 'admin';

  const student = await StudentDetails.findOne({ where: { registerNumber: rollnumber } });
  if (!student) {
    return res.status(404).json({ status: "failure", message: "Student not found" });
  }

  const updateData = {};
  if (name) updateData.studentName = name;
  if (semesterNumber) updateData.semester = semesterNumber;
  if (batch) updateData.batch = batch;

  await student.update(updateData);

  res.status(200).json({
    status: "success",
    message: "Student updated successfully",
    rollnumber: rollnumber,
  });
});

export const deleteStudent = catchAsync(async (req, res) => {
  const { rollnumber } = req.params;
  const deleted = await StudentDetails.destroy({ where: { registerNumber: rollnumber } });

  if (!deleted) {
    return res.status(404).json({ status: "failure", message: "Student not found" });
  }

  res.status(200).json({
    status: "success",
    message: `Student with roll number ${rollnumber} deleted successfully`,
  });
});

export const getStudentEnrolledCourses = catchAsync(async (req, res) => {
  const { rollnumber } = req.params;

  const enrollments = await StudentCourse.findAll({
    where: { regno: rollnumber },
    include: [
      { model: Course, where: { isActive: 'YES' }, attributes: ['courseCode', 'courseTitle'] },
      { model: Section, where: { isActive: 'YES' }, attributes: ['sectionName'] },
    ]
  });

  // Note: Finding staff name requires a look into StaffCourse for each enrollment
  const data = await Promise.all(enrollments.map(async (e) => {
    const staffAlloc = await StaffCourse.findOne({
      where: { courseId: e.courseId, sectionId: e.sectionId },
      include: [{ model: User, attributes: ['userName'] }]
    });

    return {
      courseId: e.courseId,
      courseCode: e.Course?.courseCode,
      courseName: e.Course?.courseTitle,
      batch: e.Section?.sectionName,
      staff: staffAlloc?.User?.userName || "Not Assigned"
    };
  }));

  res.status(200).json({ status: "success", data });
});

export const getStudentsByCourseAndSection = catchAsync(async (req, res) => {
  const { courseCode, sectionId } = req.query;

  const course = await Course.findOne({ where: { courseCode, isActive: 'YES' } });
  if (!course) return res.status(404).json({ status: 'failure', message: 'Course not found' });

  const enrollments = await StudentCourse.findAll({
    where: { courseId: course.courseId, sectionId },
    include: [
      { 
        model: StudentDetails, 
        include: [{ model: User, as: 'userAccount', attributes: ['userName'] }] 
      },
      { model: Section, attributes: ['sectionName'] }
    ]
  });

  const data = enrollments.map(e => ({
    rollnumber: e.regno,
    name: e.StudentDetail?.userAccount?.userName,
    batch: e.Section?.sectionName
  }));

  res.status(200).json({ status: 'success', data });
});

export const getBranches = catchAsync(async (req, res) => {
  const branches = await Batch.findAll({
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('branch')), 'branch']],
    where: { isActive: 'YES' }
  });
  res.status(200).json({ status: "success", data: branches.map(b => b.branch) });
});

export const getSemesters = catchAsync(async (req, res) => {
  const semesters = await Semester.findAll({
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('semesterNumber')), 'semesterNumber']],
    where: { isActive: 'YES' }
  });
  res.status(200).json({ status: "success", data: semesters.map(s => `Semester ${s.semesterNumber}`) });
});

export const getBatches = catchAsync(async (req, res) => {
  const { branch } = req.query;
  const where = { isActive: 'YES' };
  if (branch) where.branch = branch;

  const batches = await Batch.findAll({ where });
  res.status(200).json({ status: "success", data: batches });
});
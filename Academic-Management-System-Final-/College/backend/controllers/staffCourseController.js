// controllers/staffCourseController.js
import db from "../models/index.js";
import catchAsync from "../utils/catchAsync.js";
import { Op } from "sequelize";

const { 
  sequelize, User, StaffCourse, Course, Section, 
  Department, Semester, Batch 
} = db;

export const getUsers = catchAsync(async (req, res) => {
  const staff = await User.findAll({
    where: { roleId: 2, status: 'Active' }, // Assuming roleId 2 is Staff
    include: [
      { model: Department, as: 'department', attributes: ['Deptname'] },
      {
        model: StaffCourse,
        as: 'teachingAssignments',
        include: [
          { 
            model: Course, 
            where: { isActive: 'YES' }, 
            required: false,
            attributes: ['courseCode', 'courseTitle', 'semesterId'] 
          },
          { 
            model: Section, 
            where: { isActive: 'YES' }, 
            required: false,
            attributes: ['sectionName'] 
          }
        ]
      }
    ]
  });

  // Format data for frontend (mimics the original reduce logic)
  const staffData = staff.map(u => ({
    id: u.userId,
    staffId: u.userId.toString(),
    name: u.userName || "Unknown",
    email: u.userMail || "",
    departmentId: u.departmentId,
    departmentName: u.department?.Deptname || "Unknown",
    allocatedCourses: (u.teachingAssignments || []).map(ta => ({
      staffCourseId: ta.staffCourseId,
      courseId: ta.courseId,
      courseCode: ta.Course?.courseCode,
      courseTitle: ta.Course?.courseTitle || "Unknown",
      sectionId: ta.sectionId,
      sectionName: ta.Section?.sectionName ? `Batch ${ta.Section.sectionName}` : "N/A",
      semesterId: ta.Course?.semesterId || null,
    }))
  }));

  res.status(200).json({ status: "success", data: staffData });
});

export const allocateStaffToCourse = catchAsync(async (req, res) => {
  const { Userid, courseId, sectionId, departmentId } = req.body;
  const userName = req.user?.userName || 'admin';

  const transaction = await sequelize.transaction();
  try {
    // 1. Validations
    const staff = await User.findOne({ where: { userId: Userid, status: 'Active' }, transaction });
    if (!staff) throw new Error("Staff member not found or inactive");

    const course = await Course.findOne({ where: { courseId, isActive: 'YES' }, transaction });
    if (!course) throw new Error("Course not found");

    const section = await Section.findOne({ where: { sectionId, courseId, isActive: 'YES' }, transaction });
    if (!section) throw new Error("Section not found for this course");

    // 2. Prevent duplicate allocation
    const existing = await StaffCourse.findOne({
      where: { Userid, courseId },
      transaction
    });
    if (existing) {
        throw new Error(`Staff is already allocated to this course in section ${existing.sectionId}`);
    }

    // 3. Create
    const allocation = await StaffCourse.create({
      Userid,
      courseId,
      sectionId,
      Deptid: departmentId,
      createdBy: userName,
      updatedBy: userName
    }, { transaction });

    await transaction.commit();
    res.status(201).json({ status: "success", data: allocation });
  } catch (err) {
    await transaction.rollback();
    res.status(400).json({ status: "failure", message: err.message });
  }
});

// Alias for specific params-based route
export const allocateCourseToStaff = allocateStaffToCourse;

export const updateStaffCourseBatch = catchAsync(async (req, res) => {
  const { staffCourseId } = req.params;
  const { sectionId } = req.body;
  const userName = req.user?.userName || 'admin';

  const allocation = await StaffCourse.findByPk(staffCourseId);
  if (!allocation) return res.status(404).json({ status: "failure", message: "Allocation not found" });

  // Validate new section
  const section = await Section.findOne({ where: { sectionId, courseId: allocation.courseId, isActive: 'YES' } });
  if (!section) return res.status(404).json({ status: "failure", message: "Invalid section for this course" });

  await allocation.update({ sectionId, updatedBy: userName });

  res.status(200).json({ status: "success", message: "Batch updated", data: allocation });
});

export const updateStaffAllocation = catchAsync(async (req, res) => {
    const { staffCourseId } = req.params;
    const { Userid, courseId, sectionId, departmentId } = req.body;
    const userName = req.user?.userName || 'admin';

    const transaction = await sequelize.transaction();
    try {
        const allocation = await StaffCourse.findByPk(staffCourseId, { transaction });
        if (!allocation) throw new Error("Allocation not found");

        // Duplicate check (excluding current record)
        const dup = await StaffCourse.findOne({
            where: { Userid, courseId, staffCourseId: { [Op.ne]: staffCourseId } },
            transaction
        });
        if (dup) throw new Error("Staff already assigned to another section of this course");

        await allocation.update({ Userid, courseId, sectionId, Deptid: departmentId, updatedBy: userName }, { transaction });
        
        await transaction.commit();
        res.status(200).json({ status: "success", message: "Allocation updated" });
    } catch (err) {
        await transaction.rollback();
        res.status(400).json({ status: "failure", message: err.message });
    }
});

export const getStaffAllocationsByCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;

  const data = await StaffCourse.findAll({
    where: { courseId },
    include: [
      { model: User, attributes: [['userName', 'staffName']] },
      { model: Course, attributes: ['courseCode'] },
      { model: Section, attributes: ['sectionName'] },
      { model: Department, as: 'department', attributes: [['Deptname', 'departmentName']] }
    ]
  });

  res.status(200).json({ status: "success", data });
});

export const getCourseAllocationsByStaff = catchAsync(async (req, res) => {
  const { Userid } = req.params;

  const data = await StaffCourse.findAll({
    where: { Userid },
    include: [
      { 
        model: Course, 
        include: [{ 
            model: Semester, 
            include: [Batch] 
        }] 
      },
      { model: Section },
      { model: Department, as: 'department' }
    ]
  });

  // Format response to include the custom "semester" string
  const formatted = data.map(ta => {
    const batch = ta.Course?.Semester?.Batch;
    const semNum = ta.Course?.Semester?.semesterNumber;
    return {
      ...ta.toJSON(),
      semester: batch ? `${batch.batchYears} ${semNum % 2 === 1 ? 'ODD' : 'EVEN'} SEMESTER` : 'N/A',
      degree: batch?.degree,
      branch: batch?.branch,
      batch: batch?.batch
    };
  });

  res.status(200).json({ status: "success", data: formatted });
});

export const getCourseAllocationsByStaffEnhanced = catchAsync(async (req, res) => {
  const { Userid } = req.params;
  const today = new Date().toISOString().split('T')[0];

  const data = await StaffCourse.findAll({
    where: { Userid },
    include: [
      { 
        model: Course, 
        include: [{ 
            model: Semester, 
            where: {
                startDate: { [Op.lte]: today },
                endDate: { [Op.gte]: today }
            },
            include: [Batch] 
        }] 
      },
      { model: Section },
      { model: Department, as: 'department' }
    ]
  });

  res.status(200).json({ status: "success", data });
});

export const deleteStaffAllocation = catchAsync(async (req, res) => {
  const { staffCourseId } = req.params;

  const deleted = await StaffCourse.destroy({ where: { staffCourseId } });
  if (!deleted) return res.status(404).json({ status: "failure", message: "Allocation not found" });

  res.status(200).json({ status: "success", message: "Allocation deleted successfully" });
});
// controllers/staffCourseController.js
import db from "../models/index.js";
import catchAsync from "../utils/catchAsync.js";
import { Op } from "sequelize";

const { 
  sequelize, User, Role, StaffCourse, Course, Section, 
  Department, Semester, Batch, Employee 
} = db;

// 1. Get all Staff/Teaching Staff and their current allocations
export const getUsers = catchAsync(async (req, res) => {
  // A. Find Role IDs for "Staff", "Teaching Staff", or "Faculty"
  const staffRoles = await Role.findAll({
    where: {
      roleName: { [Op.or]: ['Staff', 'Teaching Staff', 'Faculty'] }
    },
    attributes: ['roleId']
  });

  const roleIds = staffRoles.map(r => r.roleId);

  if (roleIds.length === 0) {
    return res.status(200).json({ status: "success", data: [] });
  }

  // B. Fetch Users with those Roles
  const staffUsers = await User.findAll({
    where: { 
      roleId: { [Op.in]: roleIds }, 
      status: 'Active' 
    },
    include: [
      { 
        model: Department, 
        as: 'department', 
        attributes: ['Deptname', 'Deptid'] 
      },
      // Try to get Employee details for better names if available
      {
        model: Employee,
        as: 'employeeProfile',
        attributes: ['firstName', 'lastName']
      }
    ],
    attributes: ['userId', 'userNumber', 'userName', 'userMail', 'departmentId']
  });

  // C. Fetch Allocations separately (Safe method if User.hasMany(StaffCourse) is missing)
  const staffIds = staffUsers.map(u => u.userId);
  const allocations = await StaffCourse.findAll({
    where: { Userid: { [Op.in]: staffIds } },
    include: [
      { 
        model: Course, 
        where: { isActive: 'YES' },
        required: false, // Left join
        attributes: ['courseId', 'courseCode', 'courseTitle', 'semesterId']
      },
      { 
        model: Section, 
        where: { isActive: 'YES' },
        required: false,
        attributes: ['sectionId', 'sectionName']
      }
    ]
  });

  // D. Map allocations to users
  const staffData = staffUsers.map(u => {
    // Determine Display Name
    let displayName = u.userName;
    if (u.employeeProfile) {
      displayName = `${u.employeeProfile.firstName} ${u.employeeProfile.lastName || ''}`.trim();
    }

    // Filter allocations for this user
    const userAllocations = allocations.filter(a => a.Userid === u.userId).map(ta => ({
      staffCourseId: ta.staffCourseId,
      courseId: ta.courseId,
      courseCode: ta.Course?.courseCode || "N/A",
      courseTitle: ta.Course?.courseTitle || "Unknown",
      sectionId: ta.sectionId,
      sectionName: ta.Section?.sectionName ? `Section ${ta.Section.sectionName}` : "N/A",
      semesterId: ta.Course?.semesterId || null,
    }));

    return {
      id: u.userId,
      staffId: u.userNumber, // Using userNumber (Register/Staff ID)
      name: displayName || "Unknown",
      email: u.userMail || "",
      departmentId: u.departmentId,
      departmentName: u.department?.Deptname || "Unknown",
      allocatedCourses: userAllocations
    };
  });

  res.status(200).json({ status: "success", data: staffData });
});

// 2. Allocate Staff to Course
export const allocateStaffToCourse = catchAsync(async (req, res) => {
  // Userid matches model definition (Userid)
  const { Userid, courseId, sectionId, departmentId } = req.body; 
  const userName = req.user?.userName || 'system';

  const transaction = await sequelize.transaction();
  try {
    // 1. Validations
    const staff = await User.findOne({ where: { userId: Userid, status: 'Active' }, transaction });
    if (!staff) throw new Error("Staff member not found or inactive");

    const course = await Course.findOne({ where: { courseId, isActive: 'YES' }, transaction });
    if (!course) throw new Error("Course not found");

    const section = await Section.findOne({ where: { sectionId, courseId, isActive: 'YES' }, transaction });
    if (!section) throw new Error("Section not found for this course");

    // 2. Prevent duplicate allocation (Same Staff, Same Course, Same Section)
    const existing = await StaffCourse.findOne({
      where: { Userid, courseId, sectionId },
      transaction
    });

    if (existing) {
        throw new Error(`Staff is already allocated to this exact course and section.`);
    }

    // 3. Create Allocation
    // Note: Model uses 'Userid' and 'Deptid' (capitalized)
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

// Alias
export const allocateCourseToStaff = allocateStaffToCourse;

// 3. Update specific allocation (e.g., change section)
export const updateStaffCourseBatch = catchAsync(async (req, res) => {
  const { staffCourseId } = req.params;
  const { sectionId } = req.body;
  const userName = req.user?.userName || 'system';

  const allocation = await StaffCourse.findByPk(staffCourseId);
  if (!allocation) return res.status(404).json({ status: "failure", message: "Allocation not found" });

  // Validate new section matches the course
  const section = await Section.findOne({ where: { sectionId, courseId: allocation.courseId, isActive: 'YES' } });
  if (!section) return res.status(404).json({ status: "failure", message: "Invalid section for this course" });

  await allocation.update({ sectionId, updatedBy: userName });

  res.status(200).json({ status: "success", message: "Section updated successfully", data: allocation });
});

// 4. Fully update an allocation entry
export const updateStaffAllocation = catchAsync(async (req, res) => {
    const { staffCourseId } = req.params;
    const { Userid, courseId, sectionId, departmentId } = req.body;
    const userName = req.user?.userName || 'system';

    const transaction = await sequelize.transaction();
    try {
        const allocation = await StaffCourse.findByPk(staffCourseId, { transaction });
        if (!allocation) throw new Error("Allocation not found");

        // Duplicate check (excluding current record)
        const dup = await StaffCourse.findOne({
            where: { 
              Userid, 
              courseId, 
              sectionId,
              staffCourseId: { [Op.ne]: staffCourseId } 
            },
            transaction
        });
        
        if (dup) throw new Error("This staff assignment already exists.");

        await allocation.update({ 
          Userid, 
          courseId, 
          sectionId, 
          Deptid: departmentId, 
          updatedBy: userName 
        }, { transaction });
        
        await transaction.commit();
        res.status(200).json({ status: "success", message: "Allocation updated" });
    } catch (err) {
        await transaction.rollback();
        res.status(400).json({ status: "failure", message: err.message });
    }
});

// 5. Get all staff assigned to a specific course
// controllers/staffCourseController.js

// Find the getStaffAllocationsByCourse function and update the return object:
export const getStaffAllocationsByCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;

  const data = await StaffCourse.findAll({
    where: { courseId },
    include: [
      { model: User, attributes: ['userName', 'userNumber'] },
      { model: Course, attributes: ['courseCode', 'courseTitle'] },
      { model: Section, attributes: ['sectionName'] },
      { model: Department, as: 'department', attributes: ['Deptname', 'Deptacronym'] }
    ]
  });

  const formatted = data.map(item => ({
    staffCourseId: item.staffCourseId,
    staffName: item.User?.userName,
    staffId: item.User?.userNumber,
    courseCode: item.Course?.courseCode,
    // CHANGE 'section' TO 'sectionName'
    sectionName: item.Section?.sectionName, 
    department: item.department?.Deptacronym || 'N/A'
  }));

  res.status(200).json({ status: "success", data: formatted });
});

// 6. Get courses assigned to a specific staff member
export const getCourseAllocationsByStaff = catchAsync(async (req, res) => {
  const { Userid } = req.params; // Expecting userId

  const data = await StaffCourse.findAll({
    where: { Userid }, // Matches StaffCourse model
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

  const formatted = data.map(ta => {
    const batch = ta.Course?.Semester?.Batch;
    const semNum = ta.Course?.Semester?.semesterNumber;
    
    // Construct semantic semester info
    const semString = batch 
      ? `${batch.batchYears} | ${semNum} (${semNum % 2 !== 0 ? 'ODD' : 'EVEN'})` 
      : 'N/A';

    return {
      staffCourseId: ta.staffCourseId,
      courseId: ta.courseId,
      courseCode: ta.Course?.courseCode,
      courseTitle: ta.Course?.courseTitle,
      sectionId: ta.sectionId,
      sectionName: ta.Section?.sectionName,
      semesterInfo: semString,
      degree: batch?.degree,
      branch: batch?.branch,
      batchYear: batch?.batch
    };
  });

  res.status(200).json({ status: "success", data: formatted });
});

// 7. Get *Current* Active Semester Allocations for Staff
export const getCourseAllocationsByStaffEnhanced = catchAsync(async (req, res) => {
  const { Userid } = req.params;
  const today = new Date().toISOString().split('T')[0];

  const data = await StaffCourse.findAll({
    where: { Userid },
    include: [
      { 
        model: Course,
        required: true, 
        include: [{ 
            model: Semester,
            required: true,
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
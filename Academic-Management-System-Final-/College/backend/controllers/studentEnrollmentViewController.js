// controllers/studentEnrollmentViewController.js
import db from "../models/index.js";
import catchAsync from "../utils/catchAsync.js";
import { Op } from "sequelize";

const { 
  StudentCourse, 
  StudentDetails, 
  User, 
  Course, 
  Semester, 
  Batch, 
  DepartmentAcademic, 
  StaffCourse, 
  Section 
} = db;

export const getStudentEnrollments = catchAsync(async (req, res) => {
  const { batch, dept, sem } = req.query;

  // 1. Validation Logic
  if (sem) {
    const semNum = parseInt(sem, 10);
    if (isNaN(semNum) || semNum < 1 || semNum > 8) {
      return res.status(400).json({ status: 'failure', message: 'Invalid sem. Must be 1-8.' });
    }
  }
  if (batch && !/^\d{4}$/.test(batch)) {
    return res.status(400).json({ status: 'failure', message: 'Invalid batch format. Must be 4-digits.' });
  }
  if (dept && !/^[A-Z0-9]{2,}$/.test(dept.toUpperCase())) {
    return res.status(400).json({ status: 'failure', message: 'Invalid dept acronym.' });
  }

  // 2. Querying via StudentCourse (The intersection table)
  const rows = await StudentCourse.findAll({
    include: [
      {
        model: StudentDetails,
        required: true, // INNER JOIN
        where: {
          ...(batch && { batch }),
          ...(sem && { semester: sem })
        },
        include: [
          { 
            model: User, 
            as: 'userAccount', 
            where: { status: 'Active' }, 
            attributes: ['userName'] 
          },
          { 
            model: DepartmentAcademic, 
            as: 'department', 
            where: dept ? { Deptacronym: dept } : {}, 
            attributes: [] 
          }
        ]
      },
      {
        model: Course,
        required: true,
        where: { isActive: 'YES' },
        attributes: ['courseCode', 'courseTitle'],
        include: [{ 
          model: Semester, 
          where: { isActive: 'YES' }, 
          attributes: [] 
        }]
      },
      {
        model: Section,
        attributes: ['sectionId', 'sectionName']
      }
    ],
    order: [
        [StudentDetails, 'registerNumber', 'ASC'],
        [Course, 'courseCode', 'ASC']
    ]
  });

  // 3. Flattening the data
  // Since one Course + Section can have a Staff assigned in StaffCourse table, 
  // we look up the staff for each record.
  const enrollments = await Promise.all(rows.map(async (row) => {
    // Find the staff assigned to this specific course and section
    const staffAssignment = await StaffCourse.findOne({
      where: { 
        courseId: row.courseId, 
        sectionId: row.sectionId 
      },
      include: [{ 
        model: User, 
        where: { status: 'Active' }, 
        attributes: ['userId', 'userName'] 
      }]
    });

    return {
      regno: row.regno,
      name: row.StudentDetail?.userAccount?.userName || 'Unknown',
      courseCode: row.Course?.courseCode || 'Unknown',
      courseTitle: row.Course?.courseTitle || 'Unknown',
      staffId: staffAssignment?.User?.userId || 'Not Assigned',
      staffName: staffAssignment?.User?.userName || 'Not Assigned',
      sectionName: row.Section?.sectionName || 'N/A'
    };
  }));

  res.status(200).json({
    status: 'success',
    data: enrollments,
  });
});
import db from "../models/index.js";
import catchAsync from "../utils/catchAsync.js";

const { 
  StudentCourse, 
  StudentDetails, 
  User, 
  Course, 
  Semester, 
  Section, 
  StaffCourse, 
  Department 
} = db;

// Helper to safely get current user ID (handles both 'id' from JWT and 'userId' naming)
const getCurrentUserId = (req) => req.user?.id || req.user?.userId;

export const getStudentEnrollments = catchAsync(async (req, res) => {
  // Defensive check: ensure user is authenticated (optional but recommended)
  const currentUserId = getCurrentUserId(req);
  if (!currentUserId) {
    return res.status(401).json({ 
      status: "failure", 
      message: "Not authenticated - please login" 
    });
  }

  const { batch, dept, sem } = req.query;

  // ... (Validation logic remains the same) ...

  // 2. Querying via StudentCourse
  const rows = await StudentCourse.findAll({
    include: [
      {
        model: StudentDetails,
        required: true,
        where: {
          ...(batch && { batch }),
          ...(sem && { semester: sem })
        },
        include: [
          { 
            model: User,
            // FIX 1: MUST use the alias 'user' defined in Step 1
            as: 'user', 
            where: { status: 'Active' }, 
            attributes: ['userName', 'userNumber'] 
          },
          { 
            model: Department, 
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
        include: [{ model: Semester, where: { isActive: 'YES' }, attributes: [] }]
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
  const enrollments = await Promise.all(rows.map(async (row) => {
    // FIX 2: Access via the alias 'user' (lowercase)
    const studentUser = row.StudentDetail?.user;

    // ... (Staff lookup logic remains the same) ...
    const staffAssignment = await StaffCourse.findOne({
        where: { courseId: row.courseId, sectionId: row.sectionId },
        include: [{ 
            model: User, 
            required: false,
            attributes: ['userId', 'userName'] 
        }]
    });
    
    const staffUser = staffAssignment?.User;

    return {
      regno: row.StudentDetail?.registerNumber || row.regno,
      name: studentUser?.userName || 'Unknown', // Now this will work
      courseCode: row.Course?.courseCode || 'Unknown',
      courseTitle: row.Course?.courseTitle || 'Unknown',
      staffId: staffUser?.userId || 'Not Assigned',
      staffName: staffUser?.userName || 'Not Assigned',
      sectionName: row.Section?.sectionName || 'N/A'
    };
  }));

  res.status(200).json({
    status: 'success',
    results: enrollments.length,
    data: enrollments,
  });
});

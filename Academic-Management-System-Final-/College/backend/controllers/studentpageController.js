import { Op } from "sequelize";
import db from "../models/index.js"; 
import catchAsync from "../utils/catchAsync.js";

const { 
  User, StudentDetails, Department, Batch, Course, Semester, 
  ElectiveBucket, ElectiveBucketCourse, StudentElectiveSelection, 
  RegulationCourse, NptelCreditTransfer, NptelCourse, StudentNptelEnrollment,
  DayAttendance, Section, StudentCourse, sequelize 
} = db;

// Helper to safely get user ID from req.user (handles both id and userId)
const getCurrentUserId = (req) => req.user?.id || req.user?.userId;

// 1. GET STUDENT ACADEMIC IDS
export const getStudentAcademicIds = catchAsync(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  const student = await User.findByPk(userId, {
    include: [{
      model: StudentDetails,
      as: 'studentProfile',
      attributes: ['departmentId', 'batch', 'semester']
    }]
  });

  if (!student || !student.studentProfile) {
    return res.status(404).json({ status: "failure", message: "Student academic details not found" });
  }

  const profile = student.studentProfile;

  const [batchRecord, semesterRecord] = await Promise.all([
    Batch.findOne({ where: { batch: profile.batch, isActive: 'YES' } }),
    Semester.findOne({ 
      where: { semesterNumber: profile.semester, isActive: 'YES' },
      include: [{ model: Batch, where: { batch: profile.batch } }] 
    })
  ]);

  res.status(200).json({
    status: "success",
    data: {
      deptId: profile.departmentId,
      batchId: batchRecord ? batchRecord.batchId : null,
      semesterId: semesterRecord ? semesterRecord.semesterId : null
    }
  });
});

// 2. GET OEC/PEC PROGRESS
export const getOecPecProgress = catchAsync(async (req, res) => {
  const userId = req.user?.id || req.user?.userId;
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  // Step 1: Get the current user's registerNumber reliably
  let regno;

  // If JWT already has userNumber (future-proof)
  if (req.user?.userNumber) {
    regno = req.user.userNumber;
  } else {
    // Fallback: fetch from users table
    const currentUser = await User.findByPk(userId, { 
      attributes: ['userNumber'] 
    });
    
    if (!currentUser || !currentUser.userNumber) {
      return res.status(404).json({ 
        status: "failure", 
        message: "User or register number not found" 
      });
    }
    regno = currentUser.userNumber;
  }

  // Step 2: Fetch student profile using registerNumber (most reliable key)
  const student = await StudentDetails.findOne({
    where: { registerNumber: regno },
    include: [{ model: Department, as: 'department' }]
  });

  if (!student) {
    return res.status(404).json({ 
      status: "failure", 
      message: `Student profile not found for register number ${regno}` 
    });
  }

  // Step 3: Now safely get batch using student's data
  const batch = await Batch.findOne({ 
    where: { 
      batch: student.batch, 
      branch: student.department?.Deptacronym || '',  // safe chaining
      isActive: 'YES' 
    } 
  });

  if (!batch || !batch.regulationId) {
    return res.status(404).json({ 
      status: "failure", 
      message: "Batch or regulation not assigned for this student" 
    });
  }

  // The rest of your original logic (unchanged from here)
  const required = await RegulationCourse.findAll({
    where: { regulationId: batch.regulationId, category: { [Op.in]: ['OEC', 'PEC'] }, isActive: 'YES' },
    attributes: ['category', [sequelize.fn('COUNT', sequelize.col('category')), 'count']],
    group: ['category']
  });

  const requiredMap = { OEC: 0, PEC: 0 };
  required.forEach(r => requiredMap[r.category] = parseInt(r.get('count')));

  const nptel = await NptelCreditTransfer.findAll({
    where: { regno: student.registerNumber, studentStatus: 'accepted' },
    include: [{ model: NptelCourse, attributes: ['type'] }],
    attributes: [[sequelize.fn('COUNT', sequelize.col('NptelCreditTransfer.transferId')), 'count']],
    includeIgnoreAttributes: false,
    group: ['NptelCourse.type']
  });

  const nptelMap = { OEC: 0, PEC: 0 };
  nptel.forEach(r => {
    const type = r.NptelCourse?.type;
    if (type) nptelMap[type] = parseInt(r.get('count'));
  });

  const college = await StudentElectiveSelection.findAll({
    where: { regno: student.registerNumber, status: 'allocated' },
    include: [{
      model: Course,
      attributes: [],
      where: { category: { [Op.in]: ['OEC', 'PEC'] } }
    }],
    group: ['Course.category'],
    attributes: [
      [sequelize.col('Course.category'), 'category'],
      [sequelize.fn('COUNT', sequelize.col('Course.category')), 'count']
    ]
  });

  const collegeMap = { OEC: 0, PEC: 0 };
  college.forEach(r => {
    const cat = r.get('category');
    if (cat) collegeMap[cat] = parseInt(r.get('count'));
  });

  const totalOec = nptelMap.OEC + collegeMap.OEC;
  const totalPec = nptelMap.PEC + collegeMap.PEC;

  res.status(200).json({
    status: "success",
    data: {
      required: requiredMap,
      completed: { OEC: totalOec, PEC: totalPec },
      remaining: {
        OEC: Math.max(0, requiredMap.OEC - totalOec),
        PEC: Math.max(0, requiredMap.PEC - totalPec)
      },
      fromNptel: nptelMap,
      fromCollege: collegeMap
    }
  });
});

// 3. GET STUDENT DETAILS (PROFILE)
export const getStudentDetails = catchAsync(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  const student = await User.findOne({
    where: { userId, status: 'Active' },
    include: [{
      model: StudentDetails,
      as: 'studentProfile',
      include: [
        { model: Department, as: 'department' },
      ]
    }]
  });

  if (!student) {
    return res.status(404).json({ status: "failure", message: "Student not found" });
  }

  res.status(200).json({ status: "success", data: student });
});

// 4. GET ELECTIVE BUCKETS (unchanged – no userId needed)
export const getElectiveBuckets = catchAsync(async (req, res) => {
  const { semesterId } = req.query;
  if (!semesterId) {
    return res.status(400).json({ status: "failure", message: "semesterId is required" });
  }

  const buckets = await ElectiveBucket.findAll({
    where: { semesterId },
    attributes: ["bucketId", "bucketNumber", "bucketName"],
    include: [{
      model: ElectiveBucketCourse,
      attributes: ["id", "courseId"],
      include: [{
        model: Course,
        required: false,
        where: { isActive: "YES" },
        attributes: ["courseId", "courseCode", "courseTitle", "credits", "category"]
      }]
    }],
    order: [["bucketNumber", "ASC"]]
  });

  const formatted = buckets.map((bucket) => {
    const b = bucket.toJSON();
    const courses = (b.ElectiveBucketCourses || [])
      .map((item) => item.Course)
      .filter(Boolean)
      .map((course) => ({
        courseId: course.courseId,
        courseCode: course.courseCode,
        courseTitle: course.courseTitle,
        credits: course.credits,
        category: course.category
      }));

    return {
      bucketId: b.bucketId,
      bucketNumber: b.bucketNumber,
      bucketName: b.bucketName,
      requiredSelections: courses.length > 0 ? 1 : 0,
      courses
    };
  });

  res.status(200).json({ status: "success", data: formatted });
});

// 5. ALLOCATE ELECTIVES
export const allocateElectives = catchAsync(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  const user = await User.findByPk(userId, { include: [{ model: StudentDetails, as: 'studentProfile' }] });
  
  if (!user?.studentProfile) {
    return res.status(404).json({ status: "failure", message: "Student profile not found" });
  }

  const { selections } = req.body;
  
  const data = selections.map(s => ({
    regno: user.studentProfile.registerNumber,
    bucketId: s.bucketId,
    selectedCourseId: s.courseId,
    status: 'allocated',
    createdBy: userId   // ← safe
  }));

  await StudentElectiveSelection.bulkCreate(data);
  res.status(200).json({ status: "success", message: "Allocated successfully" });
});

// 6. ATTENDANCE SUMMARY
export const getAttendanceSummary = catchAsync(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  const { semesterId } = req.query;
  const user = await User.findByPk(userId, { include: [{ model: StudentDetails, as: 'studentProfile' }] });

  if (!user?.studentProfile) {
    return res.status(404).json({ status: "failure", message: "Student profile not found" });
  }

  const sem = await Semester.findByPk(semesterId);

  const stats = await DayAttendance.findAll({
    where: { regno: user.studentProfile.registerNumber, semesterNumber: sem.semesterNumber },
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('dayAttendanceId')), 'totalDays'],
      [sequelize.literal("SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END)"), 'daysPresent']
    ],
    raw: true
  });

  res.status(200).json({ status: "success", data: stats[0] });
});

// 7. GET ENROLLED COURSES
export const getStudentEnrolledCourses = catchAsync(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  const { semesterId } = req.query;
  const user = await User.findByPk(userId, { include: [{ model: StudentDetails, as: 'studentProfile' }] });

  if (!user?.studentProfile) {
    return res.status(404).json({ status: "failure", message: "Student profile not found" });
  }

  const courses = await StudentCourse.findAll({
    where: { regno: user.studentProfile.registerNumber },
    include: [{ model: Course, where: semesterId ? { semesterId } : {} }, { model: Section }]
  });

  res.status(200).json({ status: "success", data: courses });
});

// 8. OTHER REQUIRED EXPORTS (some unchanged, some fixed)
export const getMandatoryCourses = catchAsync(async (req, res) => {
  const { semesterId } = req.query;
  const courses = await Course.findAll({ 
    where: { semesterId, isActive: 'YES', category: { [Op.notIn]: ['PEC', 'OEC'] } } 
  });
  res.status(200).json({ status: "success", data: courses });
});

export const getSemesters = catchAsync(async (req, res) => {
  const semesters = await Semester.findAll({ 
    include: [{ model: Batch, where: { isActive: 'YES' } }] 
  });
  res.status(200).json({ status: "success", data: semesters });
});

export const getUserId = catchAsync(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }
  res.status(200).json({ status: "success", data: { userId } });
});

export const getElectiveSelections = catchAsync(async (req, res) => {
  const selections = await StudentElectiveSelection.findAll({ 
    where: { status: 'allocated' }, 
    include: [Course] 
  });
  res.status(200).json({ status: "success", data: selections });
});

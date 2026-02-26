import { Op } from "sequelize";
import db from "../models/index.js"; 
import catchAsync from "../utils/catchAsync.js";

const { 
  User, StudentDetails, Department, Batch, Course, Semester, 
  ElectiveBucket, ElectiveBucketCourse, StudentElectiveSelection, 
  RegulationCourse, NptelCreditTransfer, NptelCourse, StudentNptelEnrollment,
  DayAttendance, PeriodAttendance, Section, StudentCourse, sequelize 
} = db;

// Helper to safely get user ID from req.user (handles both id and userId)
const getCurrentUserId = (req) => req.user?.id || req.user?.userId;
const RESELECTION_KEY = "electiveReselectionRequests";

const readReselectionRequests = (messages) => {
  if (!messages || typeof messages !== "object") return [];
  const list = messages[RESELECTION_KEY];
  return Array.isArray(list) ? list : [];
};

const writeReselectionRequests = async (student, requests, updatedBy = null) => {
  const currentMessages = (student.messages && typeof student.messages === "object") ? student.messages : {};
  const nextMessages = { ...currentMessages };
  if (Array.isArray(requests) && requests.length > 0) {
    nextMessages[RESELECTION_KEY] = requests;
  } else {
    delete nextMessages[RESELECTION_KEY];
  }
  await student.update({
    messages: nextMessages,
    ...(updatedBy ? { updatedBy } : {}),
  });
};

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

  const dept = profile.departmentId
    ? await Department.findByPk(profile.departmentId, { attributes: ['Deptacronym', 'Deptname'] })
    : null;

  const batchWhere = {
    batch: profile.batch,
    isActive: 'YES',
  };
  if (dept?.Deptacronym) {
    batchWhere.branch = dept.Deptacronym;
  }

  const batchRecord = await Batch.findOne({ where: batchWhere });
  if (!batchRecord) {
    return res.status(404).json({
      status: "failure",
      message: `No active Batch mapping for batch ${profile.batch} and department ${dept?.Deptacronym || profile.departmentId}`
    });
  }

  const semesterRecord = await Semester.findOne({
    where: {
      semesterNumber: profile.semester,
      batchId: batchRecord.batchId,
      isActive: 'YES'
    }
  });

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
  const userId = getCurrentUserId(req);
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  const user = await User.findByPk(userId, { include: [{ model: StudentDetails, as: "studentProfile" }] });
  if (!user?.studentProfile) {
    return res.status(404).json({ status: "failure", message: "Student profile not found" });
  }

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

  const existingSelections = await StudentElectiveSelection.findAll({
    where: { regno: user.studentProfile.registerNumber, status: "allocated" },
    include: [{
      model: ElectiveBucket,
      attributes: ["bucketId", "semesterId"]
    }, {
      model: Course,
      attributes: ["courseId", "courseCode", "courseTitle", "credits", "category"]
    }]
  });

  const semesterSelections = existingSelections.filter(
    (s) => Number(s.ElectiveBucket?.semesterId) === Number(semesterId)
  );
  const selectedByBucket = new Map(semesterSelections.map((s) => [Number(s.bucketId), s.Course]));
  const isFinalized = semesterSelections.length > 0;

  const reselectionRequests = readReselectionRequests(user.studentProfile.messages);
  const latestRequest = [...reselectionRequests]
    .filter((r) => Number(r.semesterId) === Number(semesterId))
    .sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0))[0] || null;
  const canReselectNow = latestRequest?.status === "approved" && latestRequest?.open === true;

  const formatted = buckets.map((bucket) => {
    const b = bucket.toJSON();
    const allCourses = (b.ElectiveBucketCourses || [])
      .map((item) => item.Course)
      .filter(Boolean)
      .map((course) => ({
        courseId: course.courseId,
        courseCode: course.courseCode,
        courseTitle: course.courseTitle,
        credits: course.credits,
        category: course.category
      }));

    const selectedCourse = selectedByBucket.get(Number(b.bucketId));
    const courses = (isFinalized && !canReselectNow)
      ? (selectedCourse ? [{
          courseId: selectedCourse.courseId,
          courseCode: selectedCourse.courseCode,
          courseTitle: selectedCourse.courseTitle,
          credits: selectedCourse.credits,
          category: selectedCourse.category
        }] : [])
      : allCourses;

    return {
      bucketId: b.bucketId,
      bucketNumber: b.bucketNumber,
      bucketName: b.bucketName,
      selectedCourseId: selectedCourse?.courseId || null,
      requiredSelections: courses.length > 0 ? 1 : 0,
      courses
    };
  });

  res.status(200).json({
    status: "success",
    data: {
      buckets: formatted,
      isFinalized,
      canReselectNow,
      reselectionRequest: latestRequest
    }
  });
});

// 5. ALLOCATE ELECTIVES
export const allocateElectives = catchAsync(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  const user = await User.findByPk(userId, { include: [{ model: StudentDetails, as: "studentProfile" }] });

  if (!user?.studentProfile) {
    return res.status(404).json({ status: "failure", message: "Student profile not found" });
  }

  const { semesterId, selections } = req.body;
  if (!semesterId || !Array.isArray(selections)) {
    return res.status(400).json({ status: "failure", message: "semesterId and selections are required" });
  }

  const buckets = await ElectiveBucket.findAll({
    where: { semesterId },
    include: [{
      model: ElectiveBucketCourse,
      attributes: ["bucketId", "courseId"]
    }],
    order: [["bucketNumber", "ASC"]]
  });

  if (buckets.length === 0) {
    return res.status(400).json({ status: "failure", message: "No elective buckets configured for this semester" });
  }

  const validBucketIds = new Set(buckets.map((b) => Number(b.bucketId)));
  const bucketCourseMap = new Map();
  for (const bucket of buckets) {
    bucketCourseMap.set(
      Number(bucket.bucketId),
      new Set((bucket.ElectiveBucketCourses || []).map((x) => Number(x.courseId)))
    );
  }

  if (selections.length !== buckets.length) {
    return res.status(400).json({
      status: "failure",
      message: "You must select exactly one course from each elective bucket."
    });
  }

  const selectedBucketIds = new Set();
  for (const sel of selections) {
    const bucketId = Number(sel.bucketId);
    const courseId = Number(sel.courseId);

    if (!validBucketIds.has(bucketId)) {
      return res.status(400).json({ status: "failure", message: "Invalid bucket selected: " + bucketId });
    }
    if (selectedBucketIds.has(bucketId)) {
      return res.status(400).json({ status: "failure", message: "Only one course can be selected per bucket." });
    }
    selectedBucketIds.add(bucketId);

    if (!bucketCourseMap.get(bucketId)?.has(courseId)) {
      return res.status(400).json({ status: "failure", message: "Selected course is not part of bucket " + bucketId });
    }
  }

  const regno = user.studentProfile.registerNumber;
  const existingSelections = await StudentElectiveSelection.findAll({
    where: { regno, status: "allocated" },
    include: [{ model: ElectiveBucket, attributes: ["bucketId", "semesterId"] }]
  });
  const semesterSelections = existingSelections.filter(
    (s) => Number(s.ElectiveBucket?.semesterId) === Number(semesterId)
  );

  const requests = readReselectionRequests(user.studentProfile.messages);
  const latestRequestIndex = [...requests]
    .map((r, i) => ({ ...r, index: i }))
    .filter((r) => Number(r.semesterId) === Number(semesterId))
    .sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0))[0];
  const canReselectNow = latestRequestIndex?.status === "approved" && latestRequestIndex?.open === true;

  if (semesterSelections.length > 0 && !canReselectNow) {
    return res.status(400).json({
      status: "failure",
      message: "Elective selection is already finalized for this semester. Request reselection to modify."
    });
  }

  await sequelize.transaction(async (t) => {
    if (semesterSelections.length > 0) {
      await StudentElectiveSelection.destroy({
        where: { selectionId: { [Op.in]: semesterSelections.map((s) => s.selectionId) } },
        transaction: t
      });
    }

    const data = selections.map((s) => ({
      regno,
      bucketId: Number(s.bucketId),
      selectedCourseId: Number(s.courseId),
      status: "allocated",
      createdBy: userId
    }));

    await StudentElectiveSelection.bulkCreate(data, { transaction: t });
  });

  if (canReselectNow && latestRequestIndex) {
    // Requirement: after successful reselection submission, remove the request entry from DB messages.
    requests.splice(latestRequestIndex.index, 1);
    await writeReselectionRequests(user.studentProfile, requests, userId);
  }

  res.status(200).json({ status: "success", message: "Elective selection submitted successfully" });
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

// 6b. SUBJECT-WISE ATTENDANCE (for dashboard chart)
export const getSubjectwiseAttendance = catchAsync(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  const { semesterId } = req.query;
  if (!semesterId) {
    return res.status(400).json({ status: "failure", message: "semesterId is required" });
  }

  const user = await User.findByPk(userId, {
    include: [{ model: StudentDetails, as: 'studentProfile' }]
  });
  if (!user?.studentProfile) {
    return res.status(404).json({ status: "failure", message: "Student profile not found" });
  }

  const sem = await Semester.findByPk(semesterId, { attributes: ['semesterNumber'] });
  if (!sem) {
    return res.status(404).json({ status: "failure", message: "Semester not found" });
  }

  const rows = await PeriodAttendance.findAll({
    where: {
      regno: user.studentProfile.registerNumber,
      semesterNumber: sem.semesterNumber
    },
    include: [{
      model: Course,
      attributes: ['courseId', 'courseCode', 'courseTitle'],
      required: false
    }],
    attributes: [
      'courseId',
      [sequelize.fn('COUNT', sequelize.col('PeriodAttendance.periodAttendanceId')), 'totalPeriods'],
      [sequelize.fn('SUM', sequelize.literal("CASE WHEN PeriodAttendance.status IN ('P','OD') THEN 1 ELSE 0 END")), 'presentPeriods']
    ],
    group: ['courseId', 'Course.courseId', 'Course.courseCode', 'Course.courseTitle'],
    order: [[sequelize.literal('presentPeriods / NULLIF(totalPeriods, 0)'), 'DESC']]
  });

  const data = rows.map((r) => {
    const total = Number(r.get('totalPeriods') || 0);
    const present = Number(r.get('presentPeriods') || 0);
    const percentage = total > 0 ? Number(((present / total) * 100).toFixed(1)) : 0;
    return {
      courseId: r.courseId,
      courseCode: r.Course?.courseCode || 'NA',
      courseTitle: r.Course?.courseTitle || 'Unknown Course',
      totalPeriods: total,
      presentPeriods: present,
      percentage
    };
  });

  res.status(200).json({ status: "success", data });
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
  const userId = getCurrentUserId(req);
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  const user = await User.findByPk(userId, {
    include: [{ model: StudentDetails, as: 'studentProfile', attributes: ['batch', 'departmentId'] }]
  });

  if (!user?.studentProfile) {
    return res.status(404).json({ status: "failure", message: "Student profile not found" });
  }

  const profile = user.studentProfile;
  const dept = profile.departmentId
    ? await Department.findByPk(profile.departmentId, { attributes: ['Deptacronym'] })
    : null;

  const batchWhere = { batch: profile.batch, isActive: 'YES' };
  if (dept?.Deptacronym) batchWhere.branch = dept.Deptacronym;

  const batches = await Batch.findAll({ where: batchWhere, attributes: ['batchId'] });

  const batchIds = batches.map((b) => b.batchId);
  if (!batchIds.length) {
    return res.status(404).json({
      status: "failure",
      message: `No active Batch mapping for batch ${profile.batch} and department ${dept?.Deptacronym || profile.departmentId}`
    });
  }

  const semesters = await Semester.findAll({
    where: { batchId: { [Op.in]: batchIds } },
    include: [{ model: Batch, where: { isActive: 'YES' }, required: true }],
    order: [['semesterNumber', 'ASC']]
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


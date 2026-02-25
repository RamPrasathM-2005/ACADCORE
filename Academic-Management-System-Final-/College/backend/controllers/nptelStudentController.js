import db from "../models/index.js";
import catchAsync from "../utils/catchAsync.js";
import { Op } from "sequelize";

const {
  sequelize,
  NptelCourse,
  StudentNptelEnrollment,
  StudentDetails,
  Semester,
  StudentGrade,
  NptelCreditTransfer,
  StudentElectiveSelection,
  Course,
  User,
  Department
} = db;

// Helper to safely get current user ID (handles both 'id' from JWT and 'userId' naming)
const getCurrentUserId = (req) => req.user?.id || req.user?.userId;

/**
 * Utility: Get Student Registration Number from User Session
 */
const getRegNo = async (req) => {
  const userId = getCurrentUserId(req);
  if (!userId) return null;

  let regno = req.user?.userNumber;
  if (!regno) {
    const currentUser = await User.findByPk(userId, {
      attributes: ["userNumber"],
    });
    regno = currentUser?.userNumber || null;
  }

  if (!regno) return null;

  const student = await StudentDetails.findOne({
    where: { registerNumber: regno },
    attributes: ["registerNumber"],
  });

  return student?.registerNumber || null;
};

export const getNptelCourses = catchAsync(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  const { semesterId } = req.query;

  if (!semesterId) {
    return res.status(400).json({ status: "failure", message: "semesterId is required" });
  }

  const regno = await getRegNo(req);
  if (!regno) {
    return res.status(404).json({ status: "failure", message: "Student profile not found" });
  }

  const courses = await NptelCourse.findAll({
    where: { semesterId, isActive: 'YES' },
    order: [['courseTitle', 'ASC']]
  });

  const enrollments = await StudentNptelEnrollment.findAll({
    where: {
      regno,
      nptelCourseId: { [Op.in]: courses.map(c => c.nptelCourseId) }
    },
    attributes: ['nptelCourseId']
  });

  const enrolledIds = new Set(enrollments.map(e => e.nptelCourseId));

  const enriched = courses.map(c => ({
    ...c.toJSON(),
    isEnrolled: enrolledIds.has(c.nptelCourseId)
  }));

  res.status(200).json({ status: "success", data: enriched });
});

export const enrollNptel = catchAsync(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  const { semesterId, nptelCourseIds } = req.body;

  if (!semesterId || !Array.isArray(nptelCourseIds) || nptelCourseIds.length === 0) {
    return res.status(400).json({ status: "failure", message: "Invalid input data" });
  }

  const regno = await getRegNo(req);
  if (!regno) {
    return res.status(404).json({ status: "failure", message: "Student profile not found" });
  }

  const transaction = await sequelize.transaction();
  try {
    const sem = await Semester.findOne({ where: { semesterId, isActive: 'YES' }, transaction });
    if (!sem) throw new Error("Invalid or inactive semester");

    const validCourses = await NptelCourse.findAll({
      where: {
        nptelCourseId: { [Op.in]: nptelCourseIds },
        semesterId,
        isActive: 'YES'
      },
      transaction
    });

    if (validCourses.length !== nptelCourseIds.length) {
      throw new Error("One or more courses are invalid for this semester");
    }

    let enrolledCount = 0;
    for (const courseId of nptelCourseIds) {
      const [record, created] = await StudentNptelEnrollment.findOrCreate({
        where: { regno, nptelCourseId: courseId, semesterId },
        transaction
      });
      if (created) enrolledCount++;
    }

    await transaction.commit();
    res.status(200).json({ status: "success", message: `Enrolled in ${enrolledCount} course(s)`, enrolledCount });
  } catch (err) {
    await transaction.rollback();
    res.status(400).json({ status: "failure", message: err.message });
  }
});

export const getStudentNptelEnrollments = catchAsync(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  const regno = await getRegNo(req);
  if (!regno) {
    return res.status(404).json({ status: "failure", message: "Student profile not found" });
  }

  const enrollments = await StudentNptelEnrollment.findAll({
    where: { regno, isActive: 'YES' },
    include: [
      { model: NptelCourse },
      { model: Semester },
      { model: NptelCreditTransfer }
    ],
    order: [[Semester, 'semesterNumber', 'DESC'], [NptelCourse, 'courseTitle', 'ASC']]
  });

  const courseCodes = enrollments.map(e => e.NptelCourse.courseCode);
  const grades = await StudentGrade.findAll({ where: { regno, courseCode: { [Op.in]: courseCodes } } });
  const gradeMap = new Map(grades.map(g => [g.courseCode, g.grade]));

  const data = enrollments.map(e => ({
    enrollmentId: e.enrollmentId,
    nptelCourseId: e.nptelCourseId,
    courseTitle: e.NptelCourse.courseTitle,
    courseCode: e.NptelCourse.courseCode,
    type: e.NptelCourse.type,
    credits: e.NptelCourse.credits,
    semesterNumber: e.Semester.semesterNumber,
    importedGrade: gradeMap.get(e.NptelCourse.courseCode) || null,
    studentStatus: e.NptelCreditTransfer?.studentStatus || null,
    studentRemarks: e.NptelCreditTransfer?.studentRemarks || null,
    studentRespondedAt: e.NptelCreditTransfer?.studentRespondedAt || null
  }));

  res.status(200).json({ status: "success", data });
});

export const requestCreditTransfer = catchAsync(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  const { enrollmentId, decision, remarks } = req.body;

  if (!['accepted', 'rejected'].includes(decision)) {
    return res.status(400).json({ status: "failure", message: "Invalid decision" });
  }

  const regno = await getRegNo(req);
  if (!regno) {
    return res.status(404).json({ status: "failure", message: "Student profile not found" });
  }

  const enrollment = await StudentNptelEnrollment.findOne({
    where: { enrollmentId, regno },
    include: [{ model: NptelCourse }]
  });
  if (!enrollment) return res.status(404).json({ status: "failure", message: "Enrollment not found" });

  const gradeRecord = await StudentGrade.findOne({
    where: { regno, courseCode: enrollment.NptelCourse.courseCode }
  });
  if (!gradeRecord) return res.status(400).json({ status: "failure", message: "Grade not imported yet" });

  await NptelCreditTransfer.upsert({
    enrollmentId,
    regno,
    nptelCourseId: enrollment.nptelCourseId,
    grade: gradeRecord.grade,
    studentStatus: decision,
    studentRemarks: remarks || null,
    studentRespondedAt: new Date()
  });

  res.status(200).json({
    status: "success",
    message: decision === 'accepted' ? "Credit transfer accepted!" : "Credit transfer rejected."
  });
});

export const getOecPecProgress = catchAsync(async (req, res) => {
  // 1. Safely get userId (from your updated middleware)
  const userId = req.user?.id || req.user?.userId;
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  // 2. Get registerNumber reliably (most important key)
  let regno;

  // Prefer userNumber if already in JWT (future-proof)
  if (req.user?.userNumber) {
    regno = req.user.userNumber;
  } else {
    // Fallback: look up userNumber from users table
    const currentUser = await User.findByPk(userId, {
      attributes: ['userNumber'],
    });

    if (!currentUser || !currentUser.userNumber) {
      return res.status(404).json({
        status: "failure",
        message: "User or register number not found",
      });
    }

    regno = currentUser.userNumber;
    console.log(currentUser); 
  }
 // Debug log (remove in production)
  console.log(`[OEC/PEC] Fetching for userId: ${userId}, regno: ${regno}`);

  // 3. Fetch student profile using registerNumber (reliable)
  const student = await StudentDetails.findOne({
    where: { registerNumber: regno },
    include: [{ model: Department, as: 'department' }],
  });

  if (!student) {
    return res.status(404).json({
      status: "failure",
      message: `Student profile not found for register number ${regno}`,
    });
  }

  // Debug log
  console.log(`[OEC/PEC] Student found: ${student.registerNumber}, batch: ${student.batch}`);

  // 4. Requirement is fixed irrespective of regulation.
  const requiredMap = { OEC: 3, PEC: 6 };

  // 5. Academics enrolled OEC/PEC (pending + allocated are treated as enrolled)
  const collegeEnrollments = await StudentElectiveSelection.findAll({
    where: {
      regno: student.registerNumber,
      status: { [Op.in]: ['pending', 'allocated'] }
    },
    include: [{
      model: Course,
      attributes: ['courseCode', 'category'],
      where: { category: { [Op.in]: ['OEC', 'PEC'] } }
    }],
    attributes: ['selectionId'],
  });

  // 6. NPTEL enrolled OEC/PEC
  const nptelEnrollments = await StudentNptelEnrollment.findAll({
    where: { regno: student.registerNumber, isActive: 'YES' },
    include: [{
      model: NptelCourse,
      attributes: ['courseCode', 'type'],
      where: { type: { [Op.in]: ['OEC', 'PEC'] } }
    }],
    attributes: ['enrollmentId'],
  });

  const collegeEnrolledMap = { OEC: 0, PEC: 0 };
  const nptelEnrolledMap = { OEC: 0, PEC: 0 };
  const collegeCodesByType = { OEC: new Set(), PEC: new Set() };
  const nptelCodesByType = { OEC: new Set(), PEC: new Set() };

  for (const row of collegeEnrollments) {
    const course = row.Course;
    const category = course?.category;
    const courseCode = course?.courseCode;
    if (!category || !courseCode) continue;
    collegeEnrolledMap[category] += 1;
    collegeCodesByType[category].add(courseCode);
  }

  for (const row of nptelEnrollments) {
    const course = row.NptelCourse;
    const type = course?.type;
    const courseCode = course?.courseCode;
    if (!type || !courseCode) continue;
    nptelEnrolledMap[type] += 1;
    nptelCodesByType[type].add(courseCode);
  }

  // 7. Grade completed OEC/PEC (exclude U)
  const gradeCourseCodes = [
    ...collegeCodesByType.OEC,
    ...collegeCodesByType.PEC,
    ...nptelCodesByType.OEC,
    ...nptelCodesByType.PEC,
  ];

  const gradeCompletedCollegeMap = { OEC: 0, PEC: 0 };
  const gradeCompletedNptelMap = { OEC: 0, PEC: 0 };

  if (gradeCourseCodes.length > 0) {
    const grades = await StudentGrade.findAll({
      where: {
        regno: student.registerNumber,
        courseCode: { [Op.in]: gradeCourseCodes },
        grade: { [Op.ne]: 'U' },
      },
      attributes: ['courseCode'],
    });

    const passedCodes = new Set(grades.map((g) => g.courseCode));

    for (const code of collegeCodesByType.OEC) if (passedCodes.has(code)) gradeCompletedCollegeMap.OEC += 1;
    for (const code of collegeCodesByType.PEC) if (passedCodes.has(code)) gradeCompletedCollegeMap.PEC += 1;
    for (const code of nptelCodesByType.OEC) if (passedCodes.has(code)) gradeCompletedNptelMap.OEC += 1;
    for (const code of nptelCodesByType.PEC) if (passedCodes.has(code)) gradeCompletedNptelMap.PEC += 1;
  }

  const enrolledTotal = {
    OEC: collegeEnrolledMap.OEC + nptelEnrolledMap.OEC,
    PEC: collegeEnrolledMap.PEC + nptelEnrolledMap.PEC,
  };

  const gradeCompletedTotal = {
    OEC: gradeCompletedCollegeMap.OEC + gradeCompletedNptelMap.OEC,
    PEC: gradeCompletedCollegeMap.PEC + gradeCompletedNptelMap.PEC,
  };

  res.status(200).json({
    status: "success",
    data: {
      required: requiredMap,
      // Keep existing key for current UI flow (enrolled-based progress)
      completed: enrolledTotal,
      enrolled: enrolledTotal,
      gradeCompleted: gradeCompletedTotal,
      remaining: {
        OEC: Math.max(0, requiredMap.OEC - enrolledTotal.OEC),
        PEC: Math.max(0, requiredMap.PEC - enrolledTotal.PEC),
      },
      fromNptel: nptelEnrolledMap,
      fromCollege: collegeEnrolledMap,
      gradeCompletedFromNptel: gradeCompletedNptelMap,
      gradeCompletedFromCollege: gradeCompletedCollegeMap,
    },
  });
});

// Alias (unchanged)
export const studentNptelCreditDecision = requestCreditTransfer;

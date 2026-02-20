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
  Batch,
  RegulationCourse,
  StudentElectiveSelection,
  Course,
  User
} = db;

// Helper to safely get current user ID (handles both 'id' from JWT and 'userId' naming)
const getCurrentUserId = (req) => req.user?.id || req.user?.userId;

/**
 * Utility: Get Student Registration Number from User Session
 */
const getRegNo = async (userId) => {
  const student = await StudentDetails.findOne({
    where: { 
      [Op.or]: [{ registerNumber: userId }, { studentId: userId }] 
    },
    attributes: ['registerNumber']
  });
  if (!student) throw new Error("Student profile not found");
  return student.registerNumber;
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

  const regno = await getRegNo(userId);

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

  const regno = await getRegNo(userId);

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

  const regno = await getRegNo(userId);

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

  const regno = await getRegNo(userId);

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
  const userId = getCurrentUserId(req);
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  const student = await StudentDetails.findOne({
    where: { [Op.or]: [{ registerNumber: req.user.userNumber }, { studentId: userId }] },
    include: [{ model: Department, as: 'department' }]
  });

  if (!student) return res.status(404).json({ status: "failure", message: "Student not found" });

  const batch = await Batch.findOne({ 
    where: { batch: student.batch, branch: student.department.Deptacronym, isActive: 'YES' } 
  });
  if (!batch || !batch.regulationId) return res.status(404).json({ status: "failure", message: "Regulation not assigned" });

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
    include: [{ model: Course, where: { category: { [Op.in]: ['OEC', 'PEC'] } } }],
    group: ['Course.category'],
    attributes: [[sequelize.fn('COUNT', sequelize.col('Course.category')), 'count']]
  });

  const collegeMap = { OEC: 0, PEC: 0 };
  college.forEach(r => {
    const cat = r.Course?.category;
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

// Alias (unchanged)
export const studentNptelCreditDecision = requestCreditTransfer;
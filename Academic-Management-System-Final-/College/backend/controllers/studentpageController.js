import { Op } from "sequelize";
import db from "../models/index.js"; 
import catchAsync from "../utils/catchAsync.js";

const { 
  User, StudentDetails, Department, Batch, Course, Semester, 
  ElectiveBucket, ElectiveBucketCourse, StudentElectiveSelection, 
  RegulationCourse, NptelCreditTransfer, NptelCourse, StudentNptelEnrollment,
  DayAttendance, Section, StudentCourse, sequelize 
} = db;

// 1. GET STUDENT ACADEMIC IDS (The function that was missing)
export const getStudentAcademicIds = catchAsync(async (req, res) => {
  if (!req.user || !req.user.userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  const student = await User.findByPk(req.user.userId, {
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

  // Find IDs from other tables based on the profile values
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
  const userId = req.user.userId;

  const user = await User.findByPk(userId, {
    include: [{ 
      model: StudentDetails, 
      as: 'studentProfile',
      include: [{ 
        model: Batch, 
        required: true,
        on: { '$studentProfile.batch$': { [Op.col]: 'studentProfile->batchRecord.batch' } },
        as: 'batchRecord'
      }]
    }]
  });

  if (!user?.studentProfile?.batchRecord) {
    return res.status(404).json({ status: "failure", message: "Academic record or Regulation not found" });
  }

  const { registerNumber } = user.studentProfile;
  const { regulationId } = user.studentProfile.batchRecord;

  // Required from Regulation
  const required = await RegulationCourse.findAll({
    where: { regulationId, category: { [Op.in]: ['OEC', 'PEC'] }, isActive: 'YES' },
    attributes: ['category', [sequelize.fn('COUNT', sequelize.col('category')), 'count']],
    group: ['category']
  });

  // Approved NPTEL
  const nptel = await NptelCreditTransfer.findAll({
    where: { regno: registerNumber, studentStatus: 'accepted' },
    include: [{ 
      model: StudentNptelEnrollment, 
      include: [{ model: NptelCourse, attributes: ['type'] }] 
    }]
  });

  // Allocated College Electives
  const college = await StudentElectiveSelection.findAll({
    where: { regno: registerNumber, status: 'allocated' },
    include: [{ model: Course, attributes: ['category'] }]
  });

  const reqMap = { OEC: 0, PEC: 0 };
  required.forEach(r => reqMap[r.category] = parseInt(r.get('count')));

  const compMap = { OEC: 0, PEC: 0 };
  nptel.forEach(n => { if(n.StudentNptelEnrollment?.NptelCourse) compMap[n.StudentNptelEnrollment.NptelCourse.type]++ });
  college.forEach(c => { if(c.Course) compMap[c.Course.category]++ });

  res.status(200).json({
    status: "success",
    data: {
      required: reqMap,
      completed: compMap,
      remaining: {
        OEC: Math.max(0, reqMap.OEC - compMap.OEC),
        PEC: Math.max(0, reqMap.PEC - compMap.PEC)
      }
    }
  });
});

// 3. GET STUDENT DETAILS (PROFILE)
export const getStudentDetails = catchAsync(async (req, res) => {
  const student = await User.findOne({
    where: { userId: req.user.userId, status: 'Active' },
    include: [{
      model: StudentDetails,
      as: 'studentProfile',
      include: [
        { model: Department, as: 'department' },
        { 
          model: Batch, 
          required: false,
          on: { '$studentProfile.batch$': { [Op.col]: 'studentProfile->Batch.batch' } }
        }
      ]
    }]
  });
  res.status(200).json({ status: "success", data: student });
});

// 4. GET ELECTIVE BUCKETS
export const getElectiveBuckets = catchAsync(async (req, res) => {
  const { semesterId } = req.query;
  const buckets = await ElectiveBucket.findAll({
    where: { semesterId },
    include: [{ 
        model: ElectiveBucketCourse, 
        include: [{ model: Course, where: { isActive: 'YES' } }] 
    }]
  });
  res.status(200).json({ status: "success", data: buckets });
});

// 5. ALLOCATE ELECTIVES
export const allocateElectives = catchAsync(async (req, res) => {
  const { selections } = req.body;
  const user = await User.findByPk(req.user.userId, { include: [{ model: StudentDetails, as: 'studentProfile' }] });
  
  const data = selections.map(s => ({
    regno: user.studentProfile.registerNumber,
    bucketId: s.bucketId,
    selectedCourseId: s.courseId,
    status: 'allocated',
    createdBy: req.user.userId
  }));

  await StudentElectiveSelection.bulkCreate(data);
  res.status(200).json({ status: "success", message: "Allocated successfully" });
});

// 6. ATTENDANCE SUMMARY
export const getAttendanceSummary = catchAsync(async (req, res) => {
  const { semesterId } = req.query;
  const user = await User.findByPk(req.user.userId, { include: [{ model: StudentDetails, as: 'studentProfile' }] });
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
    const { semesterId } = req.query;
    const user = await User.findByPk(req.user.userId, { include: [{ model: StudentDetails, as: 'studentProfile' }] });

    const courses = await StudentCourse.findAll({
        where: { regno: user.studentProfile.registerNumber },
        include: [{ model: Course, where: semesterId ? { semesterId } : {} }, { model: Section }]
    });
    res.status(200).json({ status: "success", data: courses });
});

// 8. OTHER REQUIRED EXPORTS
export const getMandatoryCourses = catchAsync(async (req, res) => {
  const { semesterId } = req.query;
  const courses = await Course.findAll({ where: { semesterId, isActive: 'YES', category: { [Op.notIn]: ['PEC', 'OEC'] } } });
  res.status(200).json({ status: "success", data: courses });
});

export const getSemesters = catchAsync(async (req, res) => {
    const semesters = await Semester.findAll({ include: [{ model: Batch, where: { isActive: 'YES' } }] });
    res.status(200).json({ status: "success", data: semesters });
});

export const getUserId = catchAsync(async (req, res) => {
  res.status(200).json({ status: "success", data: { userId: req.user.userId } });
});

export const getElectiveSelections = catchAsync(async (req, res) => {
    const selections = await StudentElectiveSelection.findAll({ where: { status: 'allocated' }, include: [Course] });
    res.status(200).json({ status: "success", data: selections });
});
// controllers/staffAttendanceController.js
import { Op } from 'sequelize';
import db from '../models/index.js';

const { 
  sequelize, 
  User, 
  Timetable, 
  Course, 
  StaffCourse, 
  Section, 
  DepartmentAcademic, 
  Semester, 
  StudentCourse, 
  StudentDetails, 
  PeriodAttendance 
} = db;

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function generateDates(start, end) {
  const dates = [];
  let current = new Date(start);
  const endDate = new Date(end);
  while (current <= endDate) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function getDayOfWeek(dateStr) {
  const day = new Date(dateStr).getDay(); 
  return day === 0 ? 7 : day; 
}

const dayMap = {
  1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI", 6: "SAT", 7: "SUN"
};

// Helper to resolve internal PK (userId) from the staffId provided in token
async function getInternalUser(staffId) {
  const user = await User.findOne({ where: { userNumber: staffId } }); // Assuming userNumber stores staffId
  if (!user) throw new Error("Staff user not found");
  return user;
}

// ==========================================
// CONTROLLER FUNCTIONS
// ==========================================

/**
 * 1. FETCH TIMETABLE FOR STAFF
 */
export async function getTimetable(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const staffIdFromToken = req.user.userNumber; // Adjust based on your JWT payload

    if (!startDate || !endDate) {
      return res.status(400).json({ status: "error", message: "Dates required" });
    }

    const user = await getInternalUser(staffIdFromToken);

    // Fetch periods where staff is assigned
    const periods = await Timetable.findAll({
      where: { isActive: 'YES' },
      include: [
        {
          model: StaffCourse,
          as: 'teachingAssignments', // Check your User association alias
          required: true,
          where: { Userid: user.userId },
          on: {
            [Op.and]: [
              sequelize.where(sequelize.col('Timetable.courseId'), '=', sequelize.col('StaffCourse.courseId')),
              {
                [Op.or]: [
                  sequelize.where(sequelize.col('Timetable.sectionId'), '=', sequelize.col('StaffCourse.sectionId')),
                  sequelize.where(sequelize.col('Timetable.sectionId'), { [Op.is]: null })
                ]
              }
            ]
          }
        },
        { model: Course, required: true, where: { isActive: 'YES' } },
        { model: Section, required: false },
        { model: DepartmentAcademic, attributes: ['Deptacronym'] },
        { model: Semester, required: true }
      ],
      order: [
        [sequelize.fn('FIELD', sequelize.col('Timetable.dayOfWeek'), 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT')],
        ['periodNumber', 'ASC']
      ]
    });

    const dates = generateDates(startDate, endDate);
    const timetable = {};

    dates.forEach((date) => {
      const dayStr = dayMap[getDayOfWeek(date)];
      timetable[date] = dayStr ? periods
        .filter(p => p.dayOfWeek === dayStr)
        .map(p => ({
          timetableId: p.timetableId,
          courseId: p.courseId,
          courseCode: p.Course.courseCode,
          sectionId: p.sectionId,
          dayOfWeek: p.dayOfWeek,
          periodNumber: p.periodNumber,
          courseTitle: p.Course.courseTitle,
          sectionName: p.Section?.sectionName,
          semesterId: p.semesterId,
          departmentCode: p.department?.Deptacronym,
          isStaffCourse: true
        })) : [];
    });

    res.status(200).json({ status: "success", data: { timetable } });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
}

/**
 * 2. FETCH STUDENTS FOR PERIOD
 */
export async function getStudentsForPeriod(req, res, next) {
  try {
    const { courseId, sectionId, dayOfWeek, periodNumber } = req.params;
    const date = req.query.date || new Date().toISOString().split("T")[0];
    const user = await getInternalUser(req.user.userNumber);

    const course = await Course.findByPk(courseId);
    if (!course) return res.status(404).json({ status: "error", message: "Course not found" });

    const isElective = ["OEC", "PEC"].includes(course.category?.trim().toUpperCase());
    let targetCourseIds = [parseInt(courseId)];

    if (isElective) {
      const related = await Course.findAll({
        attributes: ['courseId'],
        include: [{
          model: StaffCourse,
          required: true,
          where: { Userid: user.userId }
        }],
        where: {
          [Op.or]: [{ courseCode: course.courseCode }, { courseTitle: course.courseTitle }]
        }
      });
      targetCourseIds = related.map(r => r.courseId);
    }

    // Auth Check
    const isAssigned = await StaffCourse.findOne({
      where: { 
        Userid: user.userId, 
        courseId, 
        ...(sectionId !== 'null' && !isNaN(sectionId) ? { sectionId } : {}) 
      }
    });

    if (!isAssigned) return res.status(403).json({ status: "error", message: "Unauthorized" });

    // Fetch Students
    const students = await StudentCourse.findAll({
      where: { 
        courseId: { [Op.in]: targetCourseIds },
        ...( !isElective && !isNaN(sectionId) ? { sectionId } : {} )
      },
      include: [
        { 
          model: StudentDetails, 
          required: true,
          attributes: ['registerNumber', 'studentName']
        },
        {
          model: PeriodAttendance,
          required: false,
          on: {
            regno: sequelize.where(sequelize.col('StudentCourse.regno'), '=', sequelize.col('PeriodAttendances.regno')),
            courseId: sequelize.where(sequelize.col('StudentCourse.courseId'), '=', sequelize.col('PeriodAttendances.courseId')),
            sectionId: sequelize.where(sequelize.col('StudentCourse.sectionId'), '=', sequelize.col('PeriodAttendances.sectionId')),
            dayOfWeek,
            periodNumber,
            attendanceDate: date,
            staffId: user.userId
          }
        }
      ],
      order: [[sequelize.col('StudentDetail.registerNumber'), 'ASC']]
    });

    res.json({
      status: "success",
      data: students.map(s => ({
        rollnumber: s.regno,
        name: s.StudentDetail?.studentName || 'N/A',
        status: s.PeriodAttendances?.[0]?.status || '',
        sectionId: s.sectionId,
        courseId: s.courseId
      })),
      meta: { isElective, mappedCourses: targetCourseIds }
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
}

/**
 * 3. FETCH SKIPPED STUDENTS (Admin Marked)
 */
export async function getSkippedStudents(req, res, next) {
  try {
    const { courseId, sectionId, dayOfWeek, periodNumber } = req.params;
    const { date } = req.query;
    const user = await getInternalUser(req.user.userNumber);

    const safeSectionId = !isNaN(parseInt(sectionId)) ? parseInt(sectionId) : null;

    // Auth Check
    const assignment = await StaffCourse.findOne({
      where: { Userid: user.userId, courseId, ...(safeSectionId ? { sectionId: safeSectionId } : {}) }
    });
    if (!assignment) return res.status(403).json({ status: "error", message: "Unauthorized" });

    const skipped = await PeriodAttendance.findAll({
      where: {
        courseId,
        dayOfWeek,
        periodNumber,
        attendanceDate: date,
        updatedBy: 'admin',
        sectionId: {
          [Op.in]: sequelize.literal(`(SELECT sectionId FROM StaffCourse WHERE Userid = ${user.userId} AND courseId = ${courseId})`)
        },
        ...(safeSectionId ? { sectionId: safeSectionId } : {})
      },
      include: [{ model: StudentDetails, attributes: ['studentName'] }]
    });

    res.json({
      status: "success",
      data: skipped.map(pa => ({
        rollnumber: pa.regno,
        status: pa.status,
        name: pa.StudentDetail?.studentName,
        reason: 'Attendance marked by admin'
      }))
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
}

/**
 * 4. MARK ATTENDANCE
 */
export async function markAttendance(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const { courseId, sectionId, dayOfWeek, periodNumber } = req.params;
    const { date, attendances } = req.body;
    const user = await getInternalUser(req.user.userNumber);
    const deptId = user.departmentId || 1;

    const safeSectionId = !isNaN(parseInt(sectionId)) ? parseInt(sectionId) : null;

    // Auth & Timetable Checks
    const isAssigned = await StaffCourse.findOne({
      where: { Userid: user.userId, courseId, ...(safeSectionId ? { sectionId: safeSectionId } : {}) }
    });
    const slotExists = await Timetable.findOne({ where: { courseId, dayOfWeek, periodNumber } });

    if (!isAssigned || !slotExists) {
      throw new Error("Invalid assignment or timetable slot");
    }

    const course = await Course.findByPk(courseId, { include: [Semester] });
    const semNum = course.Semester.semesterNumber;

    const processed = [];
    const skipped = [];

    for (const att of attendances) {
      if (!att.rollnumber || !["P", "A", "OD"].includes(att.status)) {
        skipped.push({ rollnumber: att.rollnumber, reason: "Invalid status" });
        continue;
      }

      const sc = await StudentCourse.findOne({ where: { regno: att.rollnumber, courseId } });
      if (!sc) {
        skipped.push({ rollnumber: att.rollnumber, reason: "Not enrolled" });
        continue;
      }

      // Section check
      if (safeSectionId && safeSectionId !== sc.sectionId) {
        skipped.push({ rollnumber: att.rollnumber, reason: "Section mismatch" });
        continue;
      }

      // Check Admin lock
      const existing = await PeriodAttendance.findOne({
        where: { regno: att.rollnumber, courseId, sectionId: sc.sectionId, attendanceDate: date, periodNumber }
      });

      if (existing?.updatedBy === 'admin') {
        skipped.push({ rollnumber: att.rollnumber, reason: "Locked by Admin" });
        continue;
      }

      // Save
      await PeriodAttendance.upsert({
        regno: att.rollnumber,
        staffId: user.userId,
        courseId,
        sectionId: sc.sectionId,
        semesterNumber: semNum,
        dayOfWeek,
        periodNumber,
        attendanceDate: date,
        status: att.status,
        Deptid: deptId,
        updatedBy: 'staff'
      }, { transaction: t });

      processed.push(att.rollnumber);
    }

    await t.commit();
    res.json({ status: "success", message: `Processed ${processed.length}, Skipped ${skipped.length}`, data: { processed, skipped } });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ status: "error", message: err.message });
  }
}

/**
 * 5. REPORT HELPER
 */
export const getCourseWiseAttendance = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    const report = await PeriodAttendance.findAll({
      attributes: [
        'regno',
        [sequelize.col('Course.courseCode'), 'CourseCode'],
        [sequelize.fn('COUNT', sequelize.col('PeriodAttendance.periodAttendanceId')), 'ConductedPeriods'],
        [sequelize.literal("SUM(CASE WHEN status='P' THEN 1 ELSE 0 END)"), 'AttendedPeriods']
      ],
      include: [{ model: Course, attributes: [] }],
      where: { attendanceDate: { [Op.between]: [fromDate, toDate] } },
      group: ['regno', 'Course.courseCode'],
      raw: true
    });

    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
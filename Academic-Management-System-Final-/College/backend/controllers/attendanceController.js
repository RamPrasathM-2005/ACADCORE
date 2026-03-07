// controllers/staffAttendanceController.js
import { Op } from 'sequelize';
import db from '../models/index.js';
import { sendAbsentAttendanceEmails } from '../services/attendanceNotificationService.js';

const { 
  sequelize, 
  User, 
  Timetable, 
  Course, 
  StaffCourse, 
  Section, 
  Department, 
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

// Resolve current staff from JWT payload (supports old/new token payload shapes)
async function getInternalUser(authUser) {
  if (!authUser) throw new Error("Unauthorized");

  if (authUser.id) {
    const user = await User.findByPk(authUser.id);
    if (user) return user;
  }

  if (authUser.userId) {
    const user = await User.findByPk(authUser.userId);
    if (user) return user;
  }

  if (authUser.userNumber) {
    const user = await User.findOne({ where: { userNumber: authUser.userNumber } });
    if (user) return user;
  }

  throw new Error("Staff user not found");
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

    if (!startDate || !endDate) {
      return res.status(400).json({ status: "error", message: "Dates required" });
    }

    const user = await getInternalUser(req.user);

    // Fetch periods where staff is assigned.
    // Timetable has no direct Sequelize association with StaffCourse, so we filter
    // via EXISTS on StaffCourse instead of include/joining StaffCourse model.
    const periods = await Timetable.findAll({
      where: {
        isActive: 'YES',
        [Op.and]: [
          sequelize.literal(`EXISTS (
            SELECT 1
            FROM StaffCourse sc
            WHERE sc.Userid = ${user.userId}
              AND sc.courseId = Timetable.courseId
              AND (
                Timetable.sectionId IS NULL
                OR Timetable.sectionId = sc.sectionId
              )
          )`)
        ]
      },
      include: [
        { model: Course, required: true, where: { isActive: 'YES' } },
        { model: Section, required: false },
        { model: Department, attributes: ['departmentAcr'] },
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
          departmentCode: p.department?.departmentAcr,
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
    const user = await getInternalUser(req.user);
    const requestedCourseId = parseInt(courseId, 10);
    const safeSectionId = Number.isNaN(parseInt(sectionId, 10)) ? null : parseInt(sectionId, 10);

    const course = await Course.findByPk(requestedCourseId);
    if (!course) return res.status(404).json({ status: "error", message: "Course not found" });

    const isElective = ["OEC", "PEC"].includes(course.category?.trim().toUpperCase());
    let targetCourseIds = [requestedCourseId];

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
      targetCourseIds = [...new Set([requestedCourseId, ...related.map(r => r.courseId)])];
    }

    // Auth Check
    const isAssigned = await StaffCourse.findOne({
      where: { 
        Userid: user.userId, 
        courseId: requestedCourseId, 
        ...(!isElective && safeSectionId ? { sectionId: safeSectionId } : {}) 
      }
    });

    if (!isAssigned) return res.status(403).json({ status: "error", message: "Unauthorized" });

    // Fetch Students
    let students = await StudentCourse.findAll({
      where: { 
        courseId: { [Op.in]: targetCourseIds },
        ...(!isElective && safeSectionId ? { sectionId: safeSectionId } : {})
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

    // Core-course fallback:
    // If StudentCourse mapping is missing, build roster from StudentDetails by dept/sem/section.
    if (!isElective && students.length === 0) {
      const slot = await Timetable.findOne({
        where: {
          courseId: requestedCourseId,
          dayOfWeek,
          periodNumber,
          ...(safeSectionId ? { sectionId: safeSectionId } : {})
        },
        include: [
          { model: Semester, required: true, attributes: ['semesterNumber'] },
          { model: Section, required: false, attributes: ['sectionName'] }
        ],
        attributes: ['departmentId', 'sectionId', 'semesterId']
      });

      const semesterNumber = slot?.Semester?.semesterNumber;
      let sectionName = slot?.Section?.sectionName || null;

      if (!sectionName && safeSectionId) {
        const sectionRow = await Section.findByPk(safeSectionId, { attributes: ['sectionName'] });
        sectionName = sectionRow?.sectionName || null;
      }

      if (slot?.departmentId && semesterNumber) {
        const roster = await StudentDetails.findAll({
          where: {
            departmentId: slot.departmentId,
            semester: String(semesterNumber),
            ...(sectionName ? { section: sectionName } : {})
          },
          attributes: ['registerNumber', 'studentName'],
          order: [['registerNumber', 'ASC']]
        });

        const mapped = await Promise.all(
          roster.map(async (stu) => {
            const attendance = await PeriodAttendance.findOne({
              where: {
                regno: stu.registerNumber,
                courseId: requestedCourseId,
                ...(safeSectionId ? { sectionId: safeSectionId } : {}),
                dayOfWeek,
                periodNumber,
                attendanceDate: date
              },
              order: [['periodAttendanceId', 'DESC']]
            });

            return {
              regno: stu.registerNumber,
              StudentDetail: { studentName: stu.studentName },
              PeriodAttendances: attendance ? [attendance] : [],
              sectionId: safeSectionId || null,
              courseId: requestedCourseId
            };
          })
        );
        students = mapped;
      }
    }

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
    const user = await getInternalUser(req.user);

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
    const user = await getInternalUser(req.user);
    const deptId = user.departmentId || 1;

    const requestedCourseId = parseInt(courseId, 10);
    const safeSectionId = !isNaN(parseInt(sectionId)) ? parseInt(sectionId) : null;

    // Auth & Timetable Checks
    const isAssigned = await StaffCourse.findOne({
      where: { Userid: user.userId, courseId: requestedCourseId, ...(safeSectionId ? { sectionId: safeSectionId } : {}) }
    });
    const slotExists = await Timetable.findOne({ where: { courseId: requestedCourseId, dayOfWeek, periodNumber } });

    if (!isAssigned || !slotExists) {
      throw new Error("Invalid assignment or timetable slot");
    }

    const baseCourse = await Course.findByPk(requestedCourseId, { include: [Semester] });
    const requestedIsElective = ["OEC", "PEC"].includes((baseCourse?.category || "").trim().toUpperCase());
    const baseSemNum = baseCourse?.Semester?.semesterNumber;

    const uniqueAttendanceCourseIds = [
      ...new Set(
        attendances
          .map((att) => parseInt(att.courseId, 10))
          .filter((id) => !Number.isNaN(id))
      ),
      requestedCourseId
    ];

    const courseRows = await Course.findAll({
      where: { courseId: { [Op.in]: uniqueAttendanceCourseIds } },
      include: [{ model: Semester, required: false }]
    });
    const semByCourseId = new Map(courseRows.map((c) => [c.courseId, c.Semester?.semesterNumber]));

    const processed = [];
    const skipped = [];
    const absentEntries = [];

    for (const att of attendances) {
      if (!att.rollnumber || !["P", "A", "OD"].includes(att.status)) {
        skipped.push({ rollnumber: att.rollnumber, reason: "Invalid status" });
        continue;
      }

      const attCourseId = parseInt(att.courseId, 10);
      const effectiveCourseId = Number.isNaN(attCourseId) ? requestedCourseId : attCourseId;

      const sc = await StudentCourse.findOne({ where: { regno: att.rollnumber, courseId: effectiveCourseId } });
      let resolvedSectionId = sc?.sectionId || safeSectionId;

      if (!sc && requestedIsElective) {
        skipped.push({ rollnumber: att.rollnumber, reason: "Not enrolled" });
        continue;
      }

      if (!resolvedSectionId) {
        const stu = await StudentDetails.findOne({
          where: { registerNumber: att.rollnumber },
          attributes: ['section']
        });
        const secName = (stu?.section || "").trim();
        if (secName) {
          const sec = await Section.findOne({
            where: { courseId: effectiveCourseId, sectionName: secName },
            attributes: ['sectionId']
          });
          resolvedSectionId = sec?.sectionId || null;
        }
      }

      if (!resolvedSectionId) {
        skipped.push({ rollnumber: att.rollnumber, reason: "Section not found" });
        continue;
      }

      // Section check
      if (sc && safeSectionId && safeSectionId !== sc.sectionId) {
        skipped.push({ rollnumber: att.rollnumber, reason: "Section mismatch" });
        continue;
      }

      // Check Admin lock
      const existing = await PeriodAttendance.findOne({
        where: { regno: att.rollnumber, courseId: effectiveCourseId, sectionId: resolvedSectionId, attendanceDate: date, periodNumber }
      });

      if (existing?.updatedBy === 'admin') {
        skipped.push({ rollnumber: att.rollnumber, reason: "Locked by Admin" });
        continue;
      }

      // Save
      await PeriodAttendance.upsert({
        regno: att.rollnumber,
        staffId: user.userId,
        courseId: effectiveCourseId,
        sectionId: resolvedSectionId,
        semesterNumber: semByCourseId.get(effectiveCourseId) || baseSemNum,
        dayOfWeek,
        periodNumber,
        attendanceDate: date,
        status: att.status,
        departmentId: deptId,
        updatedBy: 'staff'
      }, { transaction: t });

      processed.push(att.rollnumber);
      if (att.status === "A") {
        absentEntries.push({
          rollnumber: att.rollnumber,
          status: att.status,
          courseId: effectiveCourseId,
          sectionId: resolvedSectionId,
          periodNumber: Number(periodNumber),
          date,
        });
      }
    }

    await t.commit();
    sendAbsentAttendanceEmails({
      absentEntries,
      markedByName: user.userName || "Staff",
      markedByEmail: user.userMail || "",
    }).catch((emailErr) => {
      console.error("Absent email notification failed:", emailErr.message);
    });

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


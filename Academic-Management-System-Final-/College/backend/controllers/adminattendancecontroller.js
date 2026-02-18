// attendancecontroller.js
import { Op } from 'sequelize';
import db from '../models/index.js';

const { 
  sequelize, 
  Timetable, 
  Course, 
  Section, 
  Department, 
  Semester, 
  Batch, 
  StudentCourse, 
  StudentDetails, 
  User, 
  PeriodAttendance 
} = db;

// Helper to generate dates between two dates (inclusive)
function generateDates(start, end) {
  const dates = [];
  let current = new Date(start);
  const endDate = new Date(end);

  while (current <= endDate) {
    dates.push(current.toISOString().split("T")[0]); // YYYY-MM-DD
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// Helper to get dayOfWeek (1 = Monday, 7 = Sunday)
function getDayOfWeek(dateStr) {
  const day = new Date(dateStr).getDay(); // 0 = Sunday
  return day === 0 ? 7 : day; // Convert Sunday to 7
}

/**
 * GET TIMETABLE ADMIN
 * Replaces the complex JOIN query with Sequelize include logic
 */
export async function getTimetableAdmin(req, res, next) {
  try {
    const { startDate, endDate, degree, batch, branch, Deptid, semesterId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ status: "error", message: "Start and end dates required" });
    }
    if (!degree || !batch || !branch || !Deptid || !semesterId) {
      return res.status(400).json({
        status: "error",
        message: "Degree, batch, branch, Deptid, and semesterId are required",
      });
    }

    const periods = await Timetable.findAll({
      where: {
        Deptid: Deptid,
        semesterId: semesterId,
        isActive: 'YES'
      },
      include: [
        {
          model: Course,
          required: false, // LEFT JOIN
          where: {
            [Op.or]: [
              { isActive: 'YES' },
              { courseId: null }
            ]
          }
        },
        {
          model: Section,
          required: false // LEFT JOIN
        },
        {
          model: Department,
          required: true,
          attributes: ['Deptacronym']
        },
        {
          model: Semester,
          required: true,
          include: [{
            model: Batch,
            required: true,
            where: {
              degree: degree,
              batch: batch,
              branch: branch
            }
          }]
        }
      ],
      order: [
        [sequelize.fn('FIELD', sequelize.col('Timetable.dayOfWeek'), 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT')],
        ['periodNumber', 'ASC']
      ]
    });

    // Filter out periods where courseId is null (manual filter as per original logic)
    const validPeriods = periods.filter(p => p.courseId !== null);

    const dates = generateDates(startDate, endDate);
    const dayMap = { 1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI", 6: "SAT" };

    const timetable = {};
    dates.forEach((date) => {
      const dayOfWeekNum = getDayOfWeek(date);
      const dayOfWeekStr = dayMap[dayOfWeekNum];
      let periodsForDay = [];
      
      if (dayOfWeekStr) {
        periodsForDay = validPeriods
          .filter((row) => row.dayOfWeek === dayOfWeekStr)
          .map((p) => ({
            timetableId: p.timetableId,
            courseId: p.courseId,
            sectionId: p.sectionId ? parseInt(p.sectionId) : null,
            dayOfWeek: p.dayOfWeek,
            periodNumber: p.periodNumber,
            courseTitle: p.Course?.courseTitle,
            courseCode: p.Course?.courseCode,
            sectionName: p.Section?.sectionName,
            semesterId: p.semesterId,
            Deptid: p.Deptid,
            departmentCode: p.department?.Deptacronym
          }));
      }
      timetable[date] = periodsForDay;
    });

    res.status(200).json({ status: "success", data: { timetable } });
  } catch (err) {
    console.error("Error in getTimetableAdmin:", err);
    res.status(500).json({ status: "error", message: err.message || "Failed to fetch timetable" });
    next(err);
  }
}

/**
 * GET STUDENTS FOR PERIOD ADMIN
 */
export async function getStudentsForPeriodAdmin(req, res, next) {
  try {
    const { courseId, sectionId, dayOfWeek, periodNumber } = req.params;
    const date = req.query.date || new Date().toISOString().split("T")[0];
    const deptId = req.user.departmentId || null; // Use departmentId from user model

    const students = await StudentCourse.findAll({
      where: { courseId: courseId },
      include: [
        {
          model: StudentDetails,
          required: true,
          on: { regno: sequelize.where(sequelize.col('StudentCourse.regno'), '=', sequelize.col('StudentDetail.registerNumber')) },
          where: deptId ? { departmentId: deptId } : {},
          include: [{
            model: User,
            as: 'creator', // Matches association in StudentDetails model
            attributes: ['userName']
          }]
        },
        {
          model: Section,
          required: false,
          attributes: ['sectionName']
        }
      ],
      order: [[sequelize.col('StudentDetail.registerNumber'), 'ASC']]
    });

    // Fetch attendance separately to mimic the LEFT JOIN behavior cleanly
    const studentData = await Promise.all(students.map(async (sc) => {
      const attendance = await PeriodAttendance.findOne({
        where: {
          regno: sc.regno,
          courseId: courseId,
          sectionId: sc.sectionId,
          dayOfWeek: dayOfWeek,
          periodNumber: periodNumber,
          attendanceDate: date
        }
      });

      return {
        rollnumber: sc.regno,
        name: sc.StudentDetail?.creator?.userName || 'Unknown',
        status: attendance ? attendance.status : '',
        sectionId: sc.sectionId,
        sectionName: sc.Section?.sectionName
      };
    }));

    res.json({ status: "success", data: studentData });
  } catch (err) {
    console.error("Error in getStudentsForPeriodAdmin:", err);
    res.status(500).json({ status: "error", message: err.message || "Internal server error" });
    next(err);
  }
}

/**
 * MARK ATTENDANCE ADMIN
 * Uses Sequelize Transactions and Upsert logic
 */
export async function markAttendanceAdmin(req, res, next) {
  const t = await sequelize.transaction();

  try {
    const { courseId, dayOfWeek, periodNumber } = req.params;
    const { date, attendances } = req.body;
    const adminUserId = req.user.userId;
    const deptId = req.user.departmentId || 1;

    if (!Array.isArray(attendances) || attendances.length === 0) {
      return res.status(400).json({ status: "error", message: "No attendance data provided" });
    }

    const courseInfo = await Course.findOne({
      where: { courseId },
      include: [{ model: Semester, required: true }]
    });

    if (!courseInfo) {
      throw new Error("Course not found or invalid semester information");
    }
    const semesterNumber = courseInfo.Semester.semesterNumber;

    const processedStudents = [];
    const skippedStudents = [];

    for (const att of attendances) {
      if (!att.rollnumber || !["P", "A", "OD"].includes(att.status)) {
        skippedStudents.push({ rollnumber: att.rollnumber, reason: "Invalid status" });
        continue;
      }

      const studentCourse = await StudentCourse.findOne({
        where: { regno: att.rollnumber, courseId: courseId }
      });

      if (!studentCourse) {
        skippedStudents.push({ rollnumber: att.rollnumber, reason: "Not enrolled" });
        continue;
      }

      // Sequelize Upsert (Insert or Update on Duplicate Key)
      // Note: Requires a composite unique index in your database on 
      // (regno, courseId, periodNumber, attendanceDate)
      await PeriodAttendance.upsert({
        regno: att.rollnumber,
        staffId: adminUserId,
        courseId: courseId,
        sectionId: studentCourse.sectionId,
        semesterNumber: semesterNumber,
        dayOfWeek: dayOfWeek,
        periodNumber: periodNumber,
        attendanceDate: date,
        status: att.status,
        Deptid: deptId,
        updatedBy: "admin"
      }, { transaction: t });

      processedStudents.push({ rollnumber: att.rollnumber, status: att.status });
    }

    await t.commit();

    res.json({
      status: "success",
      message: `Updated ${processedStudents.length} records.`,
      data: {
        processedCount: processedStudents.length,
        skippedCount: skippedStudents.length,
      },
    });
  } catch (err) {
    await t.rollback();
    console.error("Admin Attendance Error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
}

/**
 * GET STUDENTS BY SEMESTER
 */
export async function getStudentsBySemester(req, res) {
  const { batch, semesterId, Deptid } = req.query;

  try {
    const students = await StudentDetails.findAll({
      where: {
        departmentId: Deptid,
        batch: batch,
        semester: semesterId
      },
      include: [{
        model: User,
        as: 'creator',
        attributes: ['userName']
      }],
      attributes: [['registerNumber', 'rollnumber']],
      order: [['registerNumber', 'ASC']]
    });

    const formattedStudents = students.map(s => ({
      rollnumber: s.get('rollnumber'),
      name: s.creator?.userName || 'Unknown'
    }));

    res.json({ status: "success", data: formattedStudents });
  } catch (err) {
    console.error("Error fetching student roster:", err);
    res.status(500).json({
      status: "error",
      message: "Failed to load student roster",
      details: err.message,
    });
  }
}

/**
 * MARK FULL DAY OD
 */
export async function markFullDayOD(req, res) {
  const t = await sequelize.transaction();
  try {
    const { startDate, students, Deptid, semesterId, batch } = req.body;
    const adminUserId = req.user.userId;

    if (!students || students.length === 0) {
      return res.status(400).json({ status: "error", message: "No students selected" });
    }

    const dayOfWeek = new Date(startDate)
      .toLocaleDateString("en-US", { weekday: "short" })
      .toUpperCase();

    // Finding timetable slots for the specific group
    const timetableSlots = await Timetable.findAll({
      where: {
        Deptid: Deptid,
        dayOfWeek: dayOfWeek,
        semesterId: semesterId
      }
    });

    if (timetableSlots.length === 0) {
      return res.status(404).json({
        status: "error",
        message: `No classes found in timetable for Batch ${batch}, Dept ${Deptid} on ${dayOfWeek}.`,
      });
    }

    for (const student of students) {
      for (const slot of timetableSlots) {
        await PeriodAttendance.upsert({
          regno: student.rollnumber,
          staffId: adminUserId,
          courseId: slot.courseId,
          sectionId: slot.sectionId || 1,
          semesterNumber: semesterId,
          dayOfWeek: dayOfWeek,
          periodNumber: slot.periodNumber,
          attendanceDate: startDate,
          status: "OD",
          Deptid: Deptid,
          updatedBy: "admin"
        }, { transaction: t });
      }
    }

    await t.commit();
    res.json({
      status: "success",
      message: `OD marked successfully for Batch ${batch}.`,
    });
  } catch (err) {
    await t.rollback();
    console.error("Full Day OD Error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
}

/**
 * GET STUDENTS BY DEPT AND SEM
 */
export async function getStudentsByDeptAndSem(req, res, next) {
  try {
    const { dayOfWeek, periodNumber } = req.params;
    const { date, Deptid, semesterId } = req.query;

    if (!dayOfWeek || !periodNumber || !date || !Deptid || !semesterId) {
      return res.status(400).json({ 
        status: "error", 
        message: "Missing required params: dayOfWeek, periodNumber, date, Deptid, semesterId" 
      });
    }

    const students = await StudentDetails.findAll({
      where: {
        departmentId: Deptid,
        semester: semesterId
      },
      include: [
        {
          model: User,
          as: 'creator',
          where: { status: 'Active' },
          attributes: ['userName']
        },
        {
          model: PeriodAttendance,
          required: false,
          where: {
            attendanceDate: date,
            periodNumber: periodNumber
          }
        }
      ],
      order: [['registerNumber', 'ASC']]
    });

    const formattedData = students.map(s => {
      // Logic for determining markedCourseId from the hasMany relation PeriodAttendances
      const attendance = s.PeriodAttendances?.[0];
      return {
        rollnumber: s.registerNumber,
        name: s.creator?.userName || 'Unknown',
        status: attendance ? attendance.status : '',
        markedCourseId: attendance ? attendance.courseId : null
      };
    });

    res.json({ status: "success", data: formattedData });

  } catch (err) {
    console.error("Error in getStudentsByDeptAndSem:", err);
    res.status(500).json({
      status: "error",
      message: err.message || "Internal server error",
    });
    next(err);
  }
}
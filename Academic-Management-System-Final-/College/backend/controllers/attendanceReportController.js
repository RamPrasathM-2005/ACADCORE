// controllers/reportController.js
import { Op } from 'sequelize';
import db from '../models/index.js';

const { 
  sequelize, 
  Batch, 
  DepartmentAcademic, 
  Semester, 
  Course, 
  Timetable, 
  StudentDetails, 
  User, 
  PeriodAttendance 
} = db;

// ==========================================
// HELPERS
// ==========================================

function countDaysInRange(from, to, dayOfWeek) {
  const map = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  const target = map[dayOfWeek];
  if (target === undefined) return 0;

  let count = 0;
  let cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    if (cur.getDay() === target) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ==========================================
// CONTROLLERS
// ==========================================

// Get all active batches
export const getBatches = async (req, res) => {
  try {
    const batches = await Batch.findAll({
      where: { isActive: 'YES' },
      attributes: ['batchId', 'branch', 'batch']
    });
    res.json({ success: true, batches });
  } catch (error) {
    console.error("Error fetching batches:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get departments for a specific batch
export const getDepartments = async (req, res) => {
  const { batchId } = req.params;
  try {
    if (!batchId) return res.json({ success: true, departments: [] });

    // Find the batch first to get the branch acronym
    const batch = await Batch.findByPk(batchId);
    if (!batch) return res.json({ success: true, departments: [] });

    const departments = await DepartmentAcademic.findAll({
      where: {
        Deptacronym: batch.branch
      },
      attributes: [
        ['Deptid', 'departmentId'], 
        ['Deptname', 'departmentName'], 
        ['Deptacronym', 'departmentCode']
      ]
    });

    res.json({ success: true, departments });
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get semesters for a batch
export const getSemesters = async (req, res) => {
  const { batchId } = req.params;
  try {
    if (!batchId) return res.json({ success: true, semesters: [] });

    const semesters = await Semester.findAll({
      where: { batchId, isActive: 'YES' },
      attributes: ['semesterId', 'semesterNumber'],
      order: [['semesterNumber', 'ASC']]
    });

    res.json({ success: true, semesters });
  } catch (error) {
    console.error("Error fetching semesters:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * SUBJECT WISE ATTENDANCE REPORT
 */
export const getSubjectWiseAttendance = async (req, res) => {
  const { batchId, semesterId } = req.params;
  const { fromDate, toDate } = req.query;

  try {
    if (!batchId || !semesterId || !fromDate || !toDate) {
      return res.status(400).json({ success: false, error: "Missing required parameters" });
    }

    // 1. Get batch info
    const batchInfo = await Batch.findOne({
      where: { batchId, isActive: 'YES' }
    });
    if (!batchInfo) return res.status(404).json({ success: false, error: "Batch not found" });

    // 2. Get students for batch
    const students = await StudentDetails.findAll({
      where: { batch: batchInfo.batch },
      attributes: [['registerNumber', 'RegisterNumber'], ['studentName', 'StudentName']]
    });
    
    if (!students.length) return res.json({ success: true, courses: [], report: [] });

    // 3. Get courses for semester
    const courses = await Course.findAll({
      where: { semesterId, isActive: 'YES' },
      attributes: ['courseId', 'courseTitle']
    });

    if (!courses.length) return res.json({ success: true, courses: [], report: [] });

    const courseIds = courses.map(c => c.courseId);
    const courseTitles = courses.map(c => c.courseTitle);

    // 4. Get timetable slots for conducted periods calculation
    const timetableRows = await Timetable.findAll({
      where: {
        semesterId,
        courseId: { [Op.in]: courseIds },
        isActive: 'YES'
      },
      attributes: ['courseId', 'dayOfWeek', [sequelize.fn('COUNT', sequelize.col('*')), 'periodsPerDay']],
      group: ['courseId', 'dayOfWeek']
    });

    // 5. Compute total conducted periods map
    const courseConductedMap = {};
    timetableRows.forEach((r) => {
      const dayCount = countDaysInRange(fromDate, toDate, r.dayOfWeek);
      const periodsPerDay = r.get('periodsPerDay');
      const total = dayCount * periodsPerDay;
      courseConductedMap[r.courseId] = (courseConductedMap[r.courseId] || 0) + total;
    });

    // 6. Fetch attended periods per student per course
    const attendanceRows = await PeriodAttendance.findAll({
      where: {
        status: 'P',
        courseId: { [Op.in]: courseIds },
        attendanceDate: { [Op.between]: [fromDate, toDate] }
      },
      attributes: [
        'regno', 
        'courseId', 
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.literal("CONCAT(attendanceDate, '-', periodNumber)"))), 'AttendedPeriods']
      ],
      group: ['regno', 'courseId'],
      raw: true
    });

    // Build lookup
    const attendanceMap = {};
    attendanceRows.forEach((r) => {
      if (!attendanceMap[r.regno]) attendanceMap[r.regno] = {};
      attendanceMap[r.regno][r.courseId] = r.AttendedPeriods;
    });

    // 7. Build the final report
    const report = students.map((s) => {
      const regNo = s.get('RegisterNumber');
      let TotalConducted = 0;
      let TotalAttended = 0;

      const studentData = {
        RegisterNumber: regNo,
        StudentName: s.get('StudentName'),
      };

      courses.forEach((c) => {
        const conducted = courseConductedMap[c.courseId] || 0;
        const attended = attendanceMap[regNo]?.[c.courseId] || 0;

        studentData[`${c.courseTitle} Conducted Periods`] = conducted;
        studentData[`${c.courseTitle} Attended Periods`] = attended;
        studentData[`${c.courseTitle} Att%`] = conducted
          ? ((attended / conducted) * 100).toFixed(2)
          : "0.00";

        TotalConducted += conducted;
        TotalAttended += attended;
      });

      studentData["Total Conducted Periods"] = TotalConducted;
      studentData["Total Attended Periods"] = TotalAttended;
      studentData["Total Percentage %"] = TotalConducted
        ? ((TotalAttended / TotalConducted) * 100).toFixed(2)
        : "0.00";

      return studentData;
    });

    res.json({ success: true, courses: courseTitles, report });
  } catch (err) {
    console.error("Error in getSubjectWiseAttendance:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * UNMARKED ATTENDANCE REPORT
 */
export const getUnmarkedAttendanceReport = async (req, res) => {
  const { batchId, semesterId } = req.params;
  const { fromDate, toDate } = req.query;

  try {
    if (!batchId || !semesterId || !fromDate || !toDate) {
      return res.status(400).json({ success: false, error: "Missing required parameters" });
    }

    const batchInfo = await Batch.findOne({ where: { batchId, isActive: 'YES' } });
    if (!batchInfo) return res.status(404).json({ success: false, error: "Batch not found" });

    const students = await StudentDetails.findAll({
      where: { batch: batchInfo.batch },
      attributes: [['registerNumber', 'RegisterNumber'], ['studentName', 'StudentName']]
    });

    if (!students.length) return res.json({ success: true, report: [] });

    const courses = await Course.findAll({
      where: { semesterId, isActive: 'YES' },
      attributes: ['courseId', 'courseTitle']
    });

    if (!courses.length) return res.json({ success: true, report: [] });

    const courseIds = courses.map(c => c.courseId);
    const courseMap = Object.fromEntries(courses.map(c => [c.courseId, c.courseTitle]));

    const timetableRows = await Timetable.findAll({
      where: {
        semesterId,
        courseId: { [Op.in]: courseIds },
        isActive: 'YES'
      },
      attributes: ['courseId', 'dayOfWeek', 'periodNumber']
    });

    // Helper to generate expected slots
    const getPossibleAttendanceDates = (from, to, dayOfWeek, periodNumber) => {
      const dayMap = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
      const target = dayMap[dayOfWeek];
      if (target === undefined) return [];

      const dates = [];
      let cur = new Date(from);
      const end = new Date(to);
      while (cur <= end) {
        if (cur.getDay() === target) {
          dates.push({
            date: new Date(cur).toISOString().split("T")[0],
            periodNumber,
          });
        }
        cur.setDate(cur.getDate() + 1);
      }
      return dates;
    };

    const possibleAttendance = [];
    timetableRows.forEach((t) => {
      const dates = getPossibleAttendanceDates(fromDate, toDate, t.dayOfWeek, t.periodNumber);
      dates.forEach((d) => {
        possibleAttendance.push({
          courseId: t.courseId,
          date: d.date,
          periodNumber: d.periodNumber,
        });
      });
    });

    if (!possibleAttendance.length) return res.json({ success: true, report: [] });

    // Get actually marked attendance
    const markedAttendance = await PeriodAttendance.findAll({
      where: {
        courseId: { [Op.in]: courseIds },
        attendanceDate: { [Op.between]: [fromDate, toDate] }
      },
      attributes: ['regno', 'courseId', 'attendanceDate', 'periodNumber'],
      raw: true
    });

    const markedSet = new Set(
      markedAttendance.map(m => `${m.regno}-${m.courseId}-${m.attendanceDate}-${m.periodNumber}`)
    );

    const unmarkedReport = [];
    for (const student of students) {
      const regNo = student.get('RegisterNumber');
      const name = student.get('StudentName');

      for (const pa of possibleAttendance) {
        const key = `${regNo}-${pa.courseId}-${pa.date}-${pa.periodNumber}`;
        if (!markedSet.has(key)) {
          unmarkedReport.push({
            RegisterNumber: regNo,
            StudentName: name,
            Date: pa.date,
            PeriodNumber: pa.periodNumber,
            Course: courseMap[pa.courseId] || "Unknown",
          });
        }
      }
    }

    res.json({ success: true, report: unmarkedReport });
  } catch (err) {
    console.error("Error in getUnmarkedAttendanceReport:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};
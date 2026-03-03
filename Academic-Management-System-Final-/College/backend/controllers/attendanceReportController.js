// controllers/reportController.js
import { Op } from 'sequelize';
import db from '../models/index.js';
import { getOrSetCache, makeCacheKey, ttl } from "../utils/cache.js";

const { 
  sequelize, 
  Batch, 
  Department, 
  Semester, 
  Course, 
  Section,
  Timetable, 
  StaffCourse,
  StudentDetails, 
  User, 
  PeriodAttendance 
} = db;
const markCache = (res) => (status) => res.set("X-Cache", status);

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
    const key = makeCacheKey("attendanceReports:batches", { query: req.query || {} });
    const batches = await getOrSetCache(
      key,
      () =>
        Batch.findAll({
          where: { isActive: "YES" },
          attributes: ["batchId", "branch", "batch"],
        }),
      { ttlSeconds: ttl.medium, onStatus: markCache(res) }
    );
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

    const key = makeCacheKey("attendanceReports:departments", { batchId });
    const departments = await getOrSetCache(
      key,
      async () => {
        // Find the batch first to get the branch acronym
        const batch = await Batch.findByPk(batchId);
        if (!batch) return [];
        return Department.findAll({
          where: {
            Deptacronym: batch.branch
          },
          attributes: [
            'departmentId',
            ['Deptname', 'departmentName'],
            ['Deptacronym', 'departmentCode']
          ]
        });
      },
      { ttlSeconds: ttl.medium, onStatus: markCache(res) }
    );

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

    const key = makeCacheKey("attendanceReports:semesters", { batchId });
    const semesters = await getOrSetCache(
      key,
      () =>
        Semester.findAll({
          where: { batchId, isActive: "YES" },
          attributes: ["semesterId", "semesterNumber"],
          order: [["semesterNumber", "ASC"]],
        }),
      { ttlSeconds: ttl.medium, onStatus: markCache(res) }
    );

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
  const { degree, batchId, departmentId, semesterId } = req.params;
  const { fromDate, toDate } = req.query;

  try {
    if (!degree || !batchId || !departmentId || !semesterId || !fromDate || !toDate) {
      return res.status(400).json({ success: false, error: "Missing required parameters" });
    }

    const normalizedDeptId = parseInt(departmentId, 10);
    if (Number.isNaN(normalizedDeptId)) {
      return res.status(400).json({ success: false, error: "Invalid departmentId" });
    }

    const key = makeCacheKey("attendanceReports:subjectWise", {
      degree,
      batchId,
      departmentId: normalizedDeptId,
      semesterId,
      fromDate,
      toDate,
    });

    const payload = await getOrSetCache(
      key,
      async () => {
        // 1. Get batch + semester info
        const batchInfo = await Batch.findOne({
          where: { batchId, degree, isActive: "YES" },
        });
        if (!batchInfo) return { statusCode: 404, body: { success: false, error: "Batch not found" } };

        const semesterInfo = await Semester.findOne({
          where: { semesterId, batchId: batchInfo.batchId, isActive: "YES" },
          attributes: ["semesterId", "semesterNumber"],
        });
        if (!semesterInfo) {
          return { statusCode: 404, body: { success: false, error: "Semester not found for selected batch" } };
        }

        // 2. Get students only for selected batch + department + semester
        const students = await StudentDetails.findAll({
          where: {
            batch: batchInfo.batch,
            departmentId: normalizedDeptId,
            semester: String(semesterInfo.semesterNumber),
          },
          attributes: [["registerNumber", "RegisterNumber"], ["studentName", "StudentName"]],
        });

        if (!students.length) return { statusCode: 200, body: { success: true, courses: [], report: [] } };
        const selectedRegNos = students.map((s) => String(s.get("RegisterNumber")).trim());

    // 3. Build course set from timetable for selected dept+semester
    const timetableCourseRows = await Timetable.findAll({
      where: {
        semesterId,
        departmentId: normalizedDeptId,
        isActive: 'YES',
        courseId: { [Op.ne]: null }
      },
      attributes: ['courseId'],
      group: ['courseId']
    });

        const courseIds = timetableCourseRows.map((r) => r.courseId);
        if (!courseIds.length) return { statusCode: 200, body: { success: true, courses: [], report: [] } };

        const courses = await Course.findAll({
          where: { courseId: { [Op.in]: courseIds }, isActive: "YES" },
          attributes: ["courseId", "courseCode", "courseTitle"],
          order: [["courseCode", "ASC"]],
        });

        const orderedCourseIds = courses.map((c) => c.courseId);
        const courseCodes = [...new Set(courses.map((c) => c.courseCode))];
        const courseCodeById = new Map(courses.map((c) => [c.courseId, c.courseCode]));

    // 4. Conducted slots are unique per (course, dayOfWeek, period) for selected dept+semester
    const timetableSlotRows = await Timetable.findAll({
      where: {
        semesterId,
        departmentId: normalizedDeptId,
        courseId: { [Op.in]: orderedCourseIds },
        isActive: 'YES'
      },
      attributes: ['courseId', 'dayOfWeek', 'periodNumber'],
      group: ['courseId', 'dayOfWeek', 'periodNumber']
    });

        // 5. Compute total conducted periods map
        const courseConductedMap = {};
        timetableSlotRows.forEach((r) => {
          const code = courseCodeById.get(r.courseId);
          if (!code) return;
          const dayCount = countDaysInRange(fromDate, toDate, r.dayOfWeek);
          courseConductedMap[code] = (courseConductedMap[code] || 0) + dayCount;
        });

        // 6. Fetch raw attendance rows and aggregate by courseCode.
        const selectedRegNoSet = new Set(selectedRegNos.map((r) => String(r).trim()));
        const attendanceRows = await PeriodAttendance.findAll({
          where: {
            status: { [Op.in]: ["P", "OD"] },
            regno: { [Op.in]: selectedRegNos },
            attendanceDate: { [Op.between]: [fromDate, toDate] },
          },
          attributes: ["regno", "courseId", "attendanceDate", "periodNumber"],
          include: [
            {
              model: Course,
              required: true,
              attributes: ["courseCode"],
              where: { courseCode: { [Op.in]: courseCodes } },
            },
          ],
          raw: true,
        });

        // Build lookup: attendanceMap[regno][courseCode] = distinct attended slot count.
        const attendanceSlotMap = {};
        attendanceRows.forEach((row) => {
          const regno = String(row.regno || "").trim();
          if (!selectedRegNoSet.has(regno)) return;
          const courseCode = row["Course.courseCode"];
          if (!courseCode) return;

          if (!attendanceSlotMap[regno]) attendanceSlotMap[regno] = {};
          if (!attendanceSlotMap[regno][courseCode]) attendanceSlotMap[regno][courseCode] = new Set();

          attendanceSlotMap[regno][courseCode].add(`${row.attendanceDate}-${row.periodNumber}`);
        });

        const attendanceMap = {};
        Object.keys(attendanceSlotMap).forEach((regno) => {
          attendanceMap[regno] = {};
          Object.keys(attendanceSlotMap[regno]).forEach((courseId) => {
            attendanceMap[regno][courseId] = attendanceSlotMap[regno][courseId].size;
          });
        });

        // 7. Build the final report
        const report = students.map((s) => {
          const regNo = String(s.get("RegisterNumber")).trim();
          let totalConducted = 0;
          let totalAttended = 0;

          const studentData = {
            RegisterNumber: regNo,
            StudentName: s.get("StudentName"),
          };

          courseCodes.forEach((courseCode) => {
            const conducted = courseConductedMap[courseCode] || 0;
            const attended = attendanceMap[regNo]?.[courseCode] || 0;

            studentData[`${courseCode} Conducted Periods`] = conducted;
            studentData[`${courseCode} Attended Periods`] = attended;
            studentData[`${courseCode} Att%`] = conducted ? ((attended / conducted) * 100).toFixed(2) : "0.00";

            totalConducted += conducted;
            totalAttended += attended;
          });

          studentData["Total Conducted Periods"] = totalConducted;
          studentData["Total Attended Periods"] = totalAttended;
          studentData["Total Percentage %"] = totalConducted ? ((totalAttended / totalConducted) * 100).toFixed(2) : "0.00";

          return studentData;
        });

        return { statusCode: 200, body: { success: true, courses: courseCodes, report } };
      },
      { ttlSeconds: ttl.short, onStatus: markCache(res) }
    );

    return res.status(payload.statusCode).json(payload.body);
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
  const { fromDate, toDate, departmentId } = req.query;

  try {
    if (!batchId || !semesterId || !fromDate || !toDate) {
      return res.status(400).json({ success: false, error: "Missing required parameters" });
    }

    const normalizedDeptId = Number.isNaN(parseInt(departmentId, 10)) ? null : parseInt(departmentId, 10);
    const key = makeCacheKey("attendanceReports:unmarked", {
      batchId,
      semesterId,
      fromDate,
      toDate,
      departmentId: normalizedDeptId,
    });

    const payload = await getOrSetCache(
      key,
      async () => {
        const batchInfo = await Batch.findOne({ where: { batchId, isActive: "YES" } });
        if (!batchInfo) return { statusCode: 404, body: { success: false, error: "Batch not found" } };

        const courses = await Course.findAll({
          where: { semesterId, isActive: "YES" },
          attributes: ["courseId", "courseCode", "courseTitle"],
        });

        if (!courses.length) return { statusCode: 200, body: { success: true, report: [] } };

        const courseIds = courses.map((c) => c.courseId);
        const courseMetaMap = Object.fromEntries(
          courses.map((c) => [c.courseId, { courseCode: c.courseCode, courseTitle: c.courseTitle }])
        );

    const normalizedDeptId = Number.isNaN(parseInt(departmentId, 10))
      ? null
      : parseInt(departmentId, 10);

    const timetableRows = await Timetable.findAll({
      where: {
        semesterId,
        courseId: { [Op.in]: courseIds },
        ...(normalizedDeptId ? { departmentId: normalizedDeptId } : {}),
        isActive: 'YES'
      },
      attributes: ['courseId', 'sectionId', 'departmentId', 'dayOfWeek', 'periodNumber'],
      include: [
        { model: Section, required: false, attributes: ['sectionId', 'sectionName'] }
      ]
    });

        const getDatesForDay = (from, to, dayOfWeek) => {
          const dayMap = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
          const target = dayMap[dayOfWeek];
          if (target === undefined) return [];

          const dates = [];
          let cur = new Date(from);
          const end = new Date(to);
          while (cur <= end) {
            if (cur.getDay() === target) {
              dates.push(new Date(cur).toISOString().split("T")[0]);
            }
            cur.setDate(cur.getDate() + 1);
          }
          return dates;
        };

        if (!timetableRows.length) return { statusCode: 200, body: { success: true, report: [] } };

        const markedAttendance = await PeriodAttendance.findAll({
          where: {
            courseId: { [Op.in]: courseIds },
            attendanceDate: { [Op.between]: [fromDate, toDate] },
          },
          attributes: ["courseId", "sectionId", "attendanceDate", "periodNumber"],
          raw: true,
        });

        const markedWithSectionSet = new Set();
        const markedWithoutSectionSet = new Set();
        markedAttendance.forEach((m) => {
          const base = `${m.courseId}-${m.attendanceDate}-${m.periodNumber}`;
          markedWithoutSectionSet.add(base);
          if (m.sectionId) markedWithSectionSet.add(`${base}-${m.sectionId}`);
        });

    const teacherAssignments = await StaffCourse.findAll({
      where: {
        courseId: { [Op.in]: courseIds },
        ...(normalizedDeptId ? { departmentId: normalizedDeptId } : {})
      },
      attributes: ['Userid', 'courseId', 'sectionId', 'departmentId'],
      include: [
        { model: User, required: false, attributes: ['userId', 'userName', 'userNumber'] },
        { model: Section, required: false, attributes: ['sectionId', 'sectionName'] }
      ]
    });

        const assignmentMap = new Map();
        const assignmentByCourse = new Map();
        for (const a of teacherAssignments) {
          const mapKey = `${a.courseId}-${a.sectionId || 0}`;
          const teacher = {
            userId: a.Userid,
            staffName: a.User?.userName || `User ${a.Userid}`,
            staffNumber: a.User?.userNumber || "-",
            sectionName: a.Section?.sectionName || "-",
          };
          assignmentMap.set(mapKey, teacher);
          if (!assignmentByCourse.has(a.courseId)) assignmentByCourse.set(a.courseId, []);
          assignmentByCourse.get(a.courseId).push(teacher);
        }

        const dayMapLabel = {
          MON: "Monday",
          TUE: "Tuesday",
          WED: "Wednesday",
          THU: "Thursday",
          FRI: "Friday",
          SAT: "Saturday",
        };

        const unmarkedReport = [];
        const emitted = new Set();

        for (const slot of timetableRows) {
          const dates = getDatesForDay(fromDate, toDate, slot.dayOfWeek);
          const courseMeta = courseMetaMap[slot.courseId] || {};
          const sectionId = slot.sectionId || null;
          const sectionName = slot.Section?.sectionName || "-";

          for (const date of dates) {
            const base = `${slot.courseId}-${date}-${slot.periodNumber}`;
            const isMarked = sectionId
              ? markedWithSectionSet.has(`${base}-${sectionId}`) || markedWithoutSectionSet.has(base)
              : markedWithoutSectionSet.has(base);
            if (isMarked) continue;

            let teachers = [];
            if (sectionId) {
              const direct = assignmentMap.get(`${slot.courseId}-${sectionId}`);
              if (direct) teachers = [direct];
            } else {
              teachers = assignmentByCourse.get(slot.courseId) || [];
            }
            if (!teachers.length) {
              teachers = [
                {
                  userId: null,
                  staffName: "Unassigned",
                  staffNumber: "-",
                  sectionName,
                },
              ];
            }

            for (const teacher of teachers) {
              const dedupe = `${date}-${slot.periodNumber}-${slot.courseId}-${sectionId || 0}-${teacher.userId || 0}`;
              if (emitted.has(dedupe)) continue;
              emitted.add(dedupe);

          unmarkedReport.push({
            Date: date,
            Day: dayMapLabel[slot.dayOfWeek] || slot.dayOfWeek,
            PeriodNumber: slot.periodNumber,
            CourseCode: courseMeta.courseCode || '-',
            CourseTitle: courseMeta.courseTitle || '-',
            Section: teacher.sectionName || sectionName,
            StaffName: teacher.staffName,
            StaffNumber: teacher.staffNumber,
            departmentId: slot.departmentId
          });
        }
      }
    }

        unmarkedReport.sort((a, b) => {
          if (a.Date !== b.Date) return a.Date.localeCompare(b.Date);
          if (a.PeriodNumber !== b.PeriodNumber) return a.PeriodNumber - b.PeriodNumber;
          return a.CourseCode.localeCompare(b.CourseCode);
        });

        return { statusCode: 200, body: { success: true, report: unmarkedReport } };
      },
      { ttlSeconds: ttl.short, onStatus: markCache(res) }
    );

    return res.status(payload.statusCode).json(payload.body);
  } catch (err) {
    console.error("Error in getUnmarkedAttendanceReport:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};


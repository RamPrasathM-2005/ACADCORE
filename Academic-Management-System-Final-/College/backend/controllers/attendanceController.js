import pool from "../db.js";

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Generate array of dates between start and end
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
// Get dayOfWeek string (MON, TUE...) from date or number
function getDayOfWeek(dateStr) {
  const day = new Date(dateStr).getDay(); // 0 = Sunday
  return day === 0 ? 7 : day; // Convert Sunday to 7
}

// Map numeric day (1-7) to String
const dayMap = {
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
  7: "SUN", // Just in case
};

// Helper to resolve internal Userid from public staffId
async function getUserIdFromStaffId(staffId, connection = null) {
  const conn = connection || pool;
  const [user] = await conn.query(
    "SELECT Userid FROM users WHERE staffId = ?",
    [staffId]
  );
  if (user.length === 0) {
    throw new Error("Staff user not found");
  }
  return user[0].Userid;
}

// ==========================================
// CONTROLLER FUNCTIONS
// ==========================================

// 1. Fetch Timetable for Staff
// Fix: Filters by StaffCourse assignment, NOT by Department ID
export async function getTimetable(req, res, next) {
  const connection = await pool.getConnection();
  try {
    const { startDate, endDate } = req.query;
    const staffId = req.user.staffId;

    if (!staffId) {
      return res
        .status(400)
        .json({ status: "error", message: "Staff ID not found in token" });
    }
    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ status: "error", message: "Start and end dates required" });
    }

    const userId = await getUserIdFromStaffId(staffId, connection);

    // SQL Logic:
    // 1. Join Timetable to StaffCourse based on Course AND Section.
    // 2. (t.sectionId = sc.sectionId OR t.sectionId IS NULL) handles cases where
    //    a timetable slot might be a common lecture (NULL) or specific section.
    // 3. Filter strictly by sc.Userid (The Staff), ignoring Dept restrictions.
    const [periods] = await connection.query(
      `
      SELECT 
        t.timetableId, 
        t.courseId, 
        c.courseCode,
        COALESCE(t.sectionId, NULL) as sectionId, 
        t.dayOfWeek, 
        t.periodNumber, 
        c.courseTitle, 
        s.sectionName, 
        t.semesterId, 
        t.Deptid,
        d.Deptacronym as departmentCode
      FROM Timetable t
      INNER JOIN StaffCourse sc 
          ON t.courseId = sc.courseId 
          AND (t.sectionId = sc.sectionId OR t.sectionId IS NULL)
      INNER JOIN Course c ON t.courseId = c.courseId
      LEFT JOIN Section s ON t.sectionId = s.sectionId
      JOIN department d ON t.Deptid = d.Deptid
      JOIN Semester sm ON t.semesterId = sm.semesterId
      WHERE 
        sc.Userid = ? 
        AND t.isActive = 'YES'
        AND c.isActive = 'YES'
      ORDER BY FIELD(t.dayOfWeek, 'MON','TUE','WED','THU','FRI','SAT'), t.periodNumber;
      `,
      [userId]
    );

    console.log("Fetched Timetable for UserID:", userId, "Count:", periods.length);

    const dates = generateDates(startDate, endDate);
    const timetable = {};

    dates.forEach((date) => {
      const dayOfWeekNum = getDayOfWeek(date);
      const dayOfWeekStr = dayMap[dayOfWeekNum];
      let periodsForDay = [];
      
      if (dayOfWeekStr) {
        periodsForDay = periods
          .filter((row) => row.dayOfWeek === dayOfWeekStr)
          .map((period) => ({
            ...period,
            sectionId: period.sectionId ? parseInt(period.sectionId) : null,
            isStaffCourse: true,
          }));
      }
      timetable[date] = periodsForDay;
    });

    res.status(200).json({ status: "success", data: { timetable } });
  } catch (err) {
    console.error("Error in getTimetable:", err);
    res.status(500).json({
      status: "error",
      message: err.message || "Failed to fetch timetable",
    });
  } finally {
    connection.release();
  }
}

// 2. Fetch Students for a specific period
export async function getStudentsForPeriod(req, res, next) {
  const connection = await pool.getConnection();
  try {
    const { courseId, sectionId, dayOfWeek, periodNumber } = req.params;
    const date = req.query.date || new Date().toISOString().split("T")[0];
    const staffId = req.user.staffId;

    if (!courseId || !dayOfWeek || !periodNumber) {
      return res
        .status(400)
        .json({ status: "error", message: "Missing params" });
    }

    const userId = await getUserIdFromStaffId(staffId, connection);
    const safeSectionId =
      sectionId && !isNaN(parseInt(sectionId)) ? parseInt(sectionId) : null;

    // A. Fetch Course Details
    const [courseDetails] = await connection.query(
      "SELECT category, courseCode, courseTitle FROM Course WHERE courseId = ?",
      [courseId]
    );

    if (courseDetails.length === 0) {
      return res.status(404).json({ status: "error", message: "Course not found" });
    }

    const { category, courseCode, courseTitle } = courseDetails[0];
    // Check if it's an elective (OEC/PEC)
    const isElective = ["OEC", "PEC"].includes(category?.trim().toUpperCase());

    // B. Identify Target Course IDs
    // If elective, fetch all courseIds with same Code/Title assigned to this staff
    let targetCourseIds = [parseInt(courseId)];

    if (isElective) {
      const [relatedCourses] = await connection.query(
        `SELECT DISTINCT c.courseId 
         FROM Course c
         JOIN StaffCourse sc ON c.courseId = sc.courseId
         WHERE sc.Userid = ? 
         AND (c.courseCode = ? OR c.courseTitle = ?)`,
        [userId, courseCode, courseTitle]
      );
      if (relatedCourses.length > 0) {
        targetCourseIds = relatedCourses.map((rc) => rc.courseId);
      }
    }

    // C. Authorization Check
    // Verify staff is assigned to the requested course (and section if provided)
    const [authCheck] = await connection.query(
      `SELECT COUNT(*) as count FROM StaffCourse 
       WHERE Userid = ? AND courseId = ? ${
         safeSectionId ? "AND sectionId = ?" : ""
       }`,
      safeSectionId ? [userId, courseId, safeSectionId] : [userId, courseId]
    );

    if (authCheck[0].count === 0) {
      return res
        .status(403)
        .json({ status: "error", message: "Not authorized for this course/section" });
    }

    // D. Fetch Students
    const baseQuery = `
      SELECT DISTINCT
        sd.regno AS rollnumber, 
        COALESCE(u.username, 'Name Not Set') AS name, 
        COALESCE(pa.status, '') AS status,
        sc.sectionId,
        sc.courseId
      FROM StudentCourse sc
      JOIN student_details sd ON sc.regno = sd.regno
      LEFT JOIN users u ON sd.Userid = u.Userid
      LEFT JOIN PeriodAttendance pa ON sc.regno = pa.regno 
        AND pa.courseId = sc.courseId 
        AND pa.sectionId = sc.sectionId
        AND pa.dayOfWeek = ? 
        AND pa.periodNumber = ? 
        AND pa.attendanceDate = ?
        AND pa.staffId = ?
      WHERE sc.courseId IN (?)
        ${!isElective && safeSectionId ? "AND sc.sectionId = ?" : ""}
      ORDER BY sd.regno
    `;

    const params = [dayOfWeek, periodNumber, date, userId, targetCourseIds];
    if (!isElective && safeSectionId) params.push(safeSectionId);

    const [students] = await connection.query(baseQuery, params);

    res.json({
      status: "success",
      data: students || [],
      meta: {
        isElective,
        mappedCourses: targetCourseIds,
      },
    });
  } catch (err) {
    console.error("Error in getStudentsForPeriod:", err);
    res.status(500).json({ status: "error", message: err.message });
  } finally {
    connection.release();
  }
}

// 3. Fetch Skipped Students (marked by Admin)
export async function getSkippedStudents(req, res, next) {
  const connection = await pool.getConnection();
  try {
    const { courseId, sectionId, dayOfWeek, periodNumber } = req.params;
    const { date } = req.query;
    const staffId = req.user.staffId;

    if (!courseId || !dayOfWeek || !periodNumber || !date) {
      return res.status(400).json({
        status: "error",
        message: "Missing required parameters",
      });
    }

    const userId = await getUserIdFromStaffId(staffId, connection);
    const safeSectionId = sectionId && !isNaN(parseInt(sectionId)) ? parseInt(sectionId) : null;

    // Auth Check
    const assignmentQuery = safeSectionId
      ? `SELECT COUNT(*) as count FROM StaffCourse WHERE Userid = ? AND courseId = ? AND sectionId = ?`
      : `SELECT COUNT(*) as count FROM StaffCourse WHERE Userid = ? AND courseId = ?`;
    
    const assignmentParams = safeSectionId ? [userId, courseId, safeSectionId] : [userId, courseId];
    const [courseAssignment] = await connection.query(assignmentQuery, assignmentParams);

    if (courseAssignment[0].count === 0) {
      return res.status(403).json({ status: "error", message: "Not authorized" });
    }

    const baseQuery = `
      SELECT 
        pa.regno AS rollnumber, 
        pa.status,
        u.username AS name,
        'Attendance marked by admin' AS reason
      FROM PeriodAttendance pa
      JOIN student_details sd ON pa.regno = sd.regno
      JOIN users u ON sd.Userid = u.Userid
      WHERE pa.courseId = ?
        -- Ensure we only show students from sections this staff teaches
        AND pa.sectionId IN (SELECT sectionId FROM StaffCourse WHERE Userid = ? AND courseId = ?)
        ${safeSectionId ? "AND pa.sectionId = ?" : ""}
        AND pa.dayOfWeek = ?
        AND pa.periodNumber = ?
        AND pa.attendanceDate = ?
        AND pa.updatedBy = 'admin'
      ORDER BY pa.regno
    `;

    const params = [courseId, userId, courseId];
    if (safeSectionId) params.push(safeSectionId);
    params.push(dayOfWeek, periodNumber, date);

    const [skippedStudents] = await connection.query(baseQuery, params);

    res.json({ status: "success", data: skippedStudents || [] });
  } catch (err) {
    console.error("Error in getSkippedStudents:", err);
    res.status(500).json({ status: "error", message: err.message });
  } finally {
    connection.release();
  }
}

// 4. Mark Attendance
export async function markAttendance(req, res, next) {
  const connection = await pool.getConnection();
  try {
    const { courseId, sectionId, dayOfWeek, periodNumber } = req.params;
    const { date, attendances } = req.body;
    const staffId = req.user.staffId;
    const deptId = req.user.Deptid || 1; // Fallback dept

    let safeSectionId = sectionId && !isNaN(parseInt(sectionId)) ? parseInt(sectionId) : null;

    if (!Array.isArray(attendances) || !date || !courseId || !dayOfWeek || !periodNumber) {
      return res.status(400).json({ status: "error", message: "Missing required data" });
    }

    const userId = await getUserIdFromStaffId(staffId, connection);

    // A. Check Authorization (Staff must be assigned to this course)
    const assignmentQuery = safeSectionId
      ? `SELECT COUNT(*) as count FROM StaffCourse WHERE Userid = ? AND courseId = ? AND sectionId = ?`
      : `SELECT COUNT(*) as count FROM StaffCourse WHERE Userid = ? AND courseId = ?`;
    
    const assignmentParams = safeSectionId ? [userId, courseId, safeSectionId] : [userId, courseId];
    const [courseAssignment] = await connection.query(assignmentQuery, assignmentParams);

    if (courseAssignment[0].count === 0) {
      return res.status(403).json({ status: "error", message: "Not authorized" });
    }

    // B. Validate Timetable Slot
    const [timetableCheck] = await connection.query(
      `SELECT COUNT(*) as count FROM Timetable WHERE courseId = ? AND dayOfWeek = ? AND periodNumber = ?`,
      [courseId, dayOfWeek, periodNumber]
    );

    if (timetableCheck[0].count === 0) {
      return res.status(400).json({ status: "error", message: "Invalid Timetable Slot" });
    }

    // Start Transaction
    await connection.beginTransaction();

    // Get Semester info for insertion
    const [courseInfo] = await connection.query(
      `SELECT s.semesterNumber FROM Course c JOIN Semester s ON c.semesterId = s.semesterId WHERE c.courseId = ?`,
      [courseId]
    );
    const semesterNumber = courseInfo[0]?.semesterNumber;

    const processedStudents = [];
    const skippedStudents = [];

    // Loop through attendance records
    for (const att of attendances) {
      if (!att.rollnumber || !["P", "A", "OD"].includes(att.status)) {
        skippedStudents.push({ rollnumber: att.rollnumber || "N/A", reason: "Invalid Data" });
        continue;
      }

      // 1. Get Student's Enrolled Section
      const [studentCourse] = await connection.query(
        `SELECT sectionId FROM StudentCourse WHERE regno = ? AND courseId = ? LIMIT 1`,
        [att.rollnumber, courseId]
      );

      if (studentCourse.length === 0) {
        skippedStudents.push({ rollnumber: att.rollnumber, reason: "Not enrolled in course" });
        continue;
      }

      const thisStudentSectionId = parseInt(studentCourse[0].sectionId);

      // 2. Mismatch Check: If API requested a specific section, student must match
      if (safeSectionId && safeSectionId !== thisStudentSectionId) {
        skippedStudents.push({ rollnumber: att.rollnumber, reason: "Student section mismatch" });
        continue;
      }

      // 3. Staff Assignment Check: Does this staff teach the student's section?
      const [staffSectionCheck] = await connection.query(
        `SELECT COUNT(*) as count FROM StaffCourse WHERE Userid = ? AND courseId = ? AND sectionId = ?`,
        [userId, courseId, thisStudentSectionId]
      );

      if (staffSectionCheck[0].count === 0) {
        skippedStudents.push({ rollnumber: att.rollnumber, reason: "You do not teach this student's section" });
        continue;
      }

      // 4. Admin Override Check
      const [existingRecord] = await connection.query(
        `SELECT updatedBy FROM PeriodAttendance 
         WHERE regno = ? AND courseId = ? AND sectionId = ? AND attendanceDate = ? AND periodNumber = ?`,
        [att.rollnumber, courseId, thisStudentSectionId, date, periodNumber]
      );

      if (existingRecord[0]?.updatedBy === "admin") {
        skippedStudents.push({ rollnumber: att.rollnumber, reason: "Locked by Admin" });
        continue;
      }

      // 5. Insert/Update
      await connection.query(
        `
        INSERT INTO PeriodAttendance 
        (regno, staffId, courseId, sectionId, semesterNumber, dayOfWeek, periodNumber, attendanceDate, status, Deptid, updatedBy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE status = ?, updatedBy = ?
        `,
        [
          att.rollnumber, userId, courseId, thisStudentSectionId, semesterNumber,
          dayOfWeek, periodNumber, date, att.status, deptId, "staff",
          att.status, "staff"
        ]
      );

      processedStudents.push({ rollnumber: att.rollnumber, status: att.status });
    }

    await connection.commit();

    res.json({
      status: "success",
      message: `Processed ${processedStudents.length}, Skipped ${skippedStudents.length}`,
      data: { processedStudents, skippedStudents },
    });

  } catch (err) {
    await connection.rollback();
    console.error("Error in markAttendance:", err);
    res.status(500).json({ status: "error", message: err.message });
  } finally {
    connection.release();
  }
}
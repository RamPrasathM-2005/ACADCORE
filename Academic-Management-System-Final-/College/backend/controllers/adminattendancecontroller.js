// attendancecontroller.js - Fixed SQL syntax by removing invalid // comments
import pool from "../db.js";

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

export async function getTimetableAdmin(req, res, next) {
  try {
    const { startDate, endDate, degree, batch, branch, Deptid, semesterId } =
      req.query;

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ status: "error", message: "Start and end dates required" });
    }
    if (!degree || !batch || !branch || !Deptid || !semesterId) {
      return res.status(400).json({
        status: "error",
        message: "Degree, batch, branch, Deptid, and semesterId are required",
      });
    }

    // Fetch all periods for the selected filters (use LEFT JOIN for Course to detect nulls)
    const [periods] = await pool.query(
      `
SELECT 
    t.timetableId, 
    t.courseId, 
    COALESCE(t.sectionId, NULL) as sectionId, 
    t.dayOfWeek, 
    t.periodNumber, 
    c.courseTitle, 
    c.courseCode AS courseCode,
    s.sectionName, 
    t.semesterId, 
    t.Deptid,
    d.Deptacronym as departmentCode
FROM Timetable t
LEFT JOIN Course c ON t.courseId = c.courseId
LEFT JOIN Section s ON t.sectionId = s.sectionId
JOIN department d ON t.Deptid = d.Deptid
JOIN Semester sm ON t.semesterId = sm.semesterId
JOIN Batch b ON sm.batchId = b.batchId
WHERE 
  b.degree = ?
  AND b.batch = ?
  AND b.branch = ?
  AND t.Deptid = ?
  AND t.semesterId = ?
  AND t.isActive = 'YES'
  AND (c.isActive = 'YES' OR c.courseId IS NULL)
ORDER BY FIELD(t.dayOfWeek, 'MON','TUE','WED','THU','FRI','SAT'), t.periodNumber;
      `,
      [degree, batch, branch, Deptid, semesterId]
    );

    // Filter out periods where courseId is null (invalid timetable entries)
    const validPeriods = periods.filter(
      (p) => p.courseId != null && p.courseId !== null
    );

    // Log the fetched periods and any null courseId issues
    console.log("Fetched Timetable for Admin");
    console.log("Filters:", {
      startDate,
      endDate,
      degree,
      batch,
      branch,
      Deptid,
      semesterId,
    });
    if (validPeriods.length < periods.length) {
      console.warn(
        `Filtered out ${
          periods.length - validPeriods.length
        } periods with null courseId`
      );
    }
    console.log("Valid Periods:", JSON.stringify(validPeriods, null, 2));

    // Generate dates between startDate and endDate
    const dates = generateDates(startDate, endDate);

    // Day mapping from number (1-6) to day string
    const dayMap = {
      1: "MON",
      2: "TUE",
      3: "WED",
      4: "THU",
      5: "FRI",
      6: "SAT",
    };

    // Map timetable data to dates
    const timetable = {};
    dates.forEach((date) => {
      const dayOfWeekNum = getDayOfWeek(date);
      const dayOfWeekStr = dayMap[dayOfWeekNum];
      let periodsForDay = [];
      if (dayOfWeekStr) {
        periodsForDay = validPeriods
          .filter((row) => row.dayOfWeek === dayOfWeekStr)
          .map((period) => ({
            ...period,
            sectionId: period.sectionId ? parseInt(period.sectionId) : null,
          }));
      }
      timetable[date] = periodsForDay;
    });

    console.log("Structured Timetable:", JSON.stringify(timetable, null, 2));
    res.status(200).json({ status: "success", data: { timetable } });
  } catch (err) {
    console.error("Error in getTimetableAdmin:", err);
    res.status(500).json({
      status: "error",
      message: err.message || "Failed to fetch timetable",
    });
    next(err);
  }
}

export async function getStudentsForPeriodAdmin(req, res, next) {
  try {
    const { courseId, sectionId, dayOfWeek, periodNumber } = req.params;
    const date = req.query.date || new Date().toISOString().split("T")[0];
    const userId = req.user.Userid;
    const deptId = req.user.Deptid || null;

    // Log input parameters for debugging
    console.log("Input Parameters:", {
      courseId,
      sectionId,
      dayOfWeek,
      periodNumber,
      date,
      userId,
      deptId,
    });

    // Validate params
    if (!courseId || !dayOfWeek || !periodNumber) {
      return res.status(400).json({
        status: "error",
        message:
          "Missing required parameters: courseId, dayOfWeek, periodNumber",
      });
    }

    // For admin, ignore sectionId filter if 'all'
    const isAllSections = sectionId === "all";

    if (!isAllSections) {
      console.warn("Specific section requested for admin; treating as all.");
    }

    // Get all students enrolled in this course (irrespective of section)
    const [students] = await pool.query(
      `
      SELECT 
        sd.regno AS rollnumber, 
        u.username AS name, 
        COALESCE(pa.status, '') AS status,
        sc.sectionId,
        s.sectionName
      FROM StudentCourse sc
      JOIN student_details sd ON sc.regno = sd.regno
      JOIN users u ON sd.Userid = u.Userid
      LEFT JOIN Section s ON sc.sectionId = s.sectionId
      LEFT JOIN PeriodAttendance pa ON sc.regno = pa.regno 
        AND pa.courseId = ? 
        AND pa.sectionId = sc.sectionId
        AND pa.dayOfWeek = ? 
        AND pa.periodNumber = ? 
        AND pa.attendanceDate = ?
      WHERE sc.courseId = ? 
        ${deptId ? "AND sd.Deptid = ?" : ""}
      ORDER BY sd.regno
      `,
      deptId
        ? [courseId, dayOfWeek, periodNumber, date, courseId, deptId]
        : [courseId, dayOfWeek, periodNumber, date, courseId]
    );

    // Log the fetched students (including if no students enrolled)
    console.log("Fetched Students for Period (Admin):", {
      courseId,
      sectionId: "all",
      date,
      dayOfWeek,
      periodNumber,
      totalStudents: students.length,
      hasEnrollments: students.length > 0,
    });

    if (students.length === 0) {
      console.log(
        "No students enrolled for courseId:",
        courseId,
        "- Check StudentCourse table for enrollments."
      );
    }

    res.json({ status: "success", data: students || [] });
  } catch (err) {
    console.error("Error in getStudentsForPeriodAdmin:", {
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({
      status: "error",
      message: err.message || "Internal server error",
    });
    next(err);
  }
}

export async function markAttendanceAdmin(req, res, next) {
  const connection = await pool.getConnection();

  try {
    const { courseId, dayOfWeek, periodNumber } = req.params;
    const { date, attendances } = req.body;
    const adminUserId = req.user.Userid;
    const deptId = req.user.Deptid || 1;

    // 1. Validation
    if (!Array.isArray(attendances) || attendances.length === 0) {
      return res
        .status(400)
        .json({ status: "error", message: "No attendance data provided" });
    }
    if (!date || !courseId || !dayOfWeek || !periodNumber) {
      return res
        .status(400)
        .json({ status: "error", message: "Missing required parameters" });
    }

    await connection.beginTransaction();

    // 2. Get Course/Semester Info
    const [courseInfo] = await connection.query(
      `SELECT c.semesterId, s.semesterNumber 
       FROM Course c 
       JOIN Semester s ON c.semesterId = s.semesterId
       WHERE c.courseId = ?`,
      [courseId]
    );

    if (!courseInfo[0]) {
      throw new Error("Course not found or invalid semester information");
    }
    const semesterNumber = courseInfo[0].semesterNumber;

    const processedStudents = [];
    const skippedStudents = [];

    // 3. Process each student
    for (const att of attendances) {
      // Allow P, A, and OD
      if (!att.rollnumber || !["P", "A", "OD"].includes(att.status)) {
        skippedStudents.push({
          rollnumber: att.rollnumber,
          reason: "Invalid status",
        });
        continue;
      }

      // Fetch student's specific section for this course
      const [studentCourse] = await connection.query(
        `SELECT sectionId FROM StudentCourse WHERE regno = ? AND courseId = ?`,
        [att.rollnumber, courseId]
      );

      if (studentCourse.length === 0) {
        skippedStudents.push({
          rollnumber: att.rollnumber,
          reason: "Not enrolled",
        });
        continue;
      }

      const studentSectionId = studentCourse[0].sectionId;

      /**
       * IMPORTANT:
       * We use VALUES(column_name) in the UPDATE section.
       * This tells MySQL: "If this record exists, update the status and updatedBy
       * using the new values I just provided in the INSERT part."
       */
      const query = `
        INSERT INTO PeriodAttendance 
          (regno, staffId, courseId, sectionId, semesterNumber, dayOfWeek, periodNumber, attendanceDate, status, Deptid, updatedBy)
        VALUES 
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          status = VALUES(status),
          updatedBy = VALUES(updatedBy),
          staffId = VALUES(staffId),
          Deptid = VALUES(Deptid)
      `;

      const values = [
        att.rollnumber,
        adminUserId, // staffId becomes admin's ID
        courseId,
        studentSectionId,
        semesterNumber,
        dayOfWeek,
        periodNumber,
        date,
        att.status, // Store actual status (P, A, or OD)
        deptId,
        "admin", // updatedBy label
      ];

      await connection.query(query, values);

      processedStudents.push({
        rollnumber: att.rollnumber,
        status: att.status,
      });
    }

    await connection.commit();

    res.json({
      status: "success",
      message: `Updated ${processedStudents.length} records.`,
      data: {
        processedCount: processedStudents.length,
        skippedCount: skippedStudents.length,
      },
    });
  } catch (err) {
    await connection.rollback();
    console.error("Admin Attendance Error:", err);
    res.status(500).json({ status: "error", message: err.message });
  } finally {
    connection.release();
  }
}
/**
 * 1. GET STUDENTS LIST
 * Fetches all students enrolled in a specific Degree, Batch, and Semester.
 */
export async function getStudentsBySemester(req, res) {
  // We only need Deptid, batch, and semesterId from the frontend
  const { batch, semesterId, Deptid } = req.query;

  try {
    const [students] = await pool.query(
      `SELECT DISTINCT sd.regno as rollnumber, u.username as name 
       FROM student_details sd
       JOIN users u ON sd.Userid = u.Userid
       WHERE sd.Deptid = ? 
         AND sd.batch = ? 
         AND sd.Semester = ?
       ORDER BY sd.regno ASC`,
      [Deptid, batch, semesterId]
    );

    res.json({ status: "success", data: students });
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
 * 2. MARK FULL DAY OD
 * Marks selected students as 'OD' for every period found in the timetable for that day.
 */
export async function markFullDayOD(req, res) {
  const connection = await pool.getConnection();
  try {
    const { startDate, students, Deptid, semesterId, batch } = req.body;
    const adminUserId = req.user.Userid;

    if (!students || students.length === 0) {
      return res
        .status(400)
        .json({ status: "error", message: "No students selected" });
    }

    await connection.beginTransaction();

    const dayOfWeek = new Date(startDate)
      .toLocaleDateString("en-US", { weekday: "short" })
      .toUpperCase();

    /**
     * 1. FIND THE TIMETABLE SLOTS
     * We join 'timetable' with 'student_details' to ensure we only get
     * periods that belong to the specific Batch, Dept, and Semester.
     */
    const [timetableSlots] = await connection.query(
      `SELECT DISTINCT t.courseId, t.sectionId, t.periodNumber
       FROM timetable t
       JOIN student_details sd ON t.Deptid = sd.Deptid AND t.courseId IN (
          /* Subquery to find courses mapped to this student group */
          SELECT DISTINCT courseId FROM student_details WHERE Deptid = ? AND batch = ? AND Semester = ?
       )
       WHERE t.Deptid = ? AND t.dayOfWeek = ? AND sd.batch = ? AND sd.Semester = ?`,
      [Deptid, batch, semesterId, Deptid, dayOfWeek, batch, semesterId]
    );

    // If the above complex join is too restrictive, use this simpler version:
    /*
    const [timetableSlots] = await connection.query(
      `SELECT courseId, sectionId, periodNumber 
       FROM timetable 
       WHERE Deptid = ? AND dayOfWeek = ?`, 
      [Deptid, dayOfWeek]
    );
    */

    if (timetableSlots.length === 0) {
      return res.status(404).json({
        status: "error",
        message: `No classes found in timetable for Batch ${batch}, Dept ${Deptid} on ${dayOfWeek}.`,
      });
    }

    // 2. MARK ATTENDANCE
    for (const student of students) {
      for (const slot of timetableSlots) {
        await connection.query(
          `INSERT INTO periodattendance 
            (regno, staffId, courseId, sectionId, semesterNumber, dayOfWeek, periodNumber, attendanceDate, status, Deptid, updatedBy)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
            status = 'OD',
            updatedBy = 'admin',
            staffId = ?`,
          [
            student.rollnumber,
            adminUserId,
            slot.courseId,
            1,
            semesterId,
            dayOfWeek,
            slot.periodNumber,
            startDate,
            "P",
            Deptid,
            "admin",
            adminUserId,
          ]
        );
      }
    }

    await connection.commit();
    res.json({
      status: "success",
      message: `OD marked successfully for Batch ${batch}.`,
    });
  } catch (err) {
    await connection.rollback();
    console.error("Full Day OD Error:", err);
    res.status(500).json({ status: "error", message: err.message });
  } finally {
    connection.release();
  }
}


export async function getStudentsByDeptAndSem(req, res, next) {
  try {
    const { dayOfWeek, periodNumber } = req.params;
    const { date, Deptid, semesterId } = req.query;

    // Validate params
    if (!dayOfWeek || !periodNumber || !date || !Deptid || !semesterId) {
      return res.status(400).json({ 
        status: "error", 
        message: "Missing required params: dayOfWeek, periodNumber, date, Deptid, semesterId" 
      });
    }

    console.log("Fetching Full Class Roster:", { Deptid, semesterId, date, periodNumber });

    const [students] = await pool.query(
      `
      SELECT 
        sd.regno AS rollnumber, 
        u.username AS name, 
        COALESCE(pa.status, '') AS status,
        pa.courseId AS markedCourseId
      FROM student_details sd
      JOIN users u ON sd.Userid = u.Userid
      
      -- Join Attendance based on TIME (Date+Period)
      LEFT JOIN PeriodAttendance pa ON 
            sd.regno = pa.regno 
            AND pa.attendanceDate = ? 
            AND pa.periodNumber = ?
            
      WHERE 
        sd.Deptid = ? 
        AND sd.Semester = ?
        AND u.status = 'active'  -- CHANGED: Use 'u.status' instead of 'sd.isActive'
      ORDER BY sd.regno ASC
      `,
      [date, periodNumber, Deptid, semesterId]
    );

    res.json({ status: "success", data: students || [] });

  } catch (err) {
    console.error("Error in getStudentsByDeptAndSem:", err);
    res.status(500).json({
      status: "error",
      message: err.message || "Internal server error",
    });
    next(err);
  }
}

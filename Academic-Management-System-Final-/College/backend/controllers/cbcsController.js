// controllers/cbcsController.js
import { pool } from '../db.js';
import { stringify } from 'csv-stringify/sync'; 
import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import path from 'path';

export const getCoursesByBatchDeptSemester = async (req, res) => {
  try {
    const { Deptid, batchId, semesterId } = req.query;

    // Validate required params
    if (!Deptid || !batchId || !semesterId) {
      return res
        .status(400)
        .json({ error: "Deptid, batchId and semesterId are required" });
    }

    const conn = await pool.getConnection(); 
    try {
      // STEP 1: Fetch all active courses for the semester
      const [allCourses] = await conn.execute(
        `
        SELECT 
          c.courseId, c.courseCode, c.courseTitle, c.category, c.type,
          c.lectureHours, c.tutorialHours, c.practicalHours, 
          c.experientialHours, c.totalContactPeriods, 
          c.credits, c.minMark, c.maxMark
        FROM Course c
        WHERE c.semesterId = ? AND c.isActive = 'YES'
        `,
        [semesterId]
      );

      // STEP 2: Fetch elective bucket mapping for the semester
      const [ebcRows] = await conn.execute(
        `
        SELECT 
          ebc.courseId, eb.bucketId, eb.bucketNumber, eb.bucketName
        FROM ElectiveBucketCourse ebc
        JOIN ElectiveBucket eb ON ebc.bucketId = eb.bucketId
        WHERE eb.semesterId = ?
        `,
        [semesterId]
      );

      // STEP 3: Map courseId → bucket details
      const courseToBucket = new Map();
      ebcRows.forEach((row) => {
        courseToBucket.set(row.courseId, {
          bucketId: row.bucketId,
          bucketNumber: row.bucketNumber,
          bucketName: row.bucketName,
        });
      });

      // STEP 4: Fetch section & staff details
      const [sectionStaffRows] = await conn.execute(
        `
        SELECT 
          s.sectionId, s.sectionName, s.courseId, 
          u.Userid, u.userName, u.email, u.role
        FROM Section s
        LEFT JOIN StaffCourse sc ON s.sectionId = sc.sectionId
        LEFT JOIN users u ON sc.Userid = u.Userid
        WHERE s.isActive = 'YES'
        `
      );

      // STEP 5: Organize section → staff mapping
      const courseSectionsMap = {};
      sectionStaffRows.forEach((row) => {
        if (!courseSectionsMap[row.courseId]) courseSectionsMap[row.courseId] = [];

        let section = courseSectionsMap[row.courseId].find(
          (sec) => sec.sectionId === row.sectionId
        );

        if (!section) {
          section = {
            sectionId: row.sectionId,
            sectionName: row.sectionName,
            staff: [],
          };
          courseSectionsMap[row.courseId].push(section);
        }

        if (row.Userid) {
          section.staff.push({
            Userid: row.Userid,
            userName: row.userName,
            email: row.email,
            role: row.role,
          });
        }
      });

      // ✅ STEP 6: Get elective student counts
      const [electiveCounts] = await conn.execute(
        `
        SELECT selectedCourseId AS courseId, COUNT(*) AS studentCount
        FROM StudentElectiveSelection
        WHERE status IN ('pending','allocated')
        GROUP BY selectedCourseId
        `
      );

      const courseToStudentCount = new Map();
      electiveCounts.forEach((row) => {
        courseToStudentCount.set(row.courseId, row.studentCount);
      });

      // STEP 7: Group courses (Core / Elective) + attach sections & total_students
      const groupedCourses = {};

      allCourses.forEach((course) => {
        const bucket = courseToBucket.get(course.courseId);
        const key = bucket
          ? `Elective Bucket ${bucket.bucketNumber} - ${bucket.bucketName}`
          : "Core";

        if (!groupedCourses[key]) groupedCourses[key] = [];

        const total_students = bucket
          ? courseToStudentCount.get(course.courseId) || 0 // elective
          : 120; // core

        groupedCourses[key].push({
          ...course,
          total_students,
          sections: courseSectionsMap[course.courseId] || [],
        });
      });

      // STEP 8: Return structured data
      return res.json({ success: true, courses: groupedCourses });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("getCoursesByBatchDeptSemester error:", err);
    return res
      .status(500)
      .json({ success: false, error: err.message });
  }
};
export const createCbcs = async (req, res) => {
  try {
    const {
      Deptid,
      batchId,
      semesterId,
      createdBy,
      subjects,
      total_students,
      type
    } = req.body;

    if (!Deptid || !batchId || !semesterId || !subjects || subjects.length === 0) {
      return res.status(400).json({
        error: 'Deptid, batchId, semesterId, and subjects are required'
      });
    }

    console.log('Received payload:', { total_students, subjects }); // ← Debug: check what frontend sent

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // Insert CBCS master
      const [cbcsResult] = await conn.execute(
        `INSERT INTO CBCS 
         (batchId, Deptid, semesterId, total_students, type, createdBy)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          batchId,
          Deptid,
          semesterId,
          total_students || 0,
          type || 'FCFS',
          createdBy
        ]
      );

      const cbcsId = cbcsResult.insertId;

      // Loop subjects
      for (const subj of subjects) {
        // Insert CBCS_Subject
        const [subjRes] = await conn.execute(
          `INSERT INTO CBCS_Subject 
           (cbcs_id, courseId, courseCode, courseTitle, category, type, credits, bucketName)
           SELECT ?, c.courseId, c.courseCode, c.courseTitle, c.category, c.type, c.credits, ?
           FROM Course c
           WHERE c.courseId = ?`,
          [cbcsId, subj.bucketName || 'Core', subj.subject_id]
        );

        const cbcsSubjectId = subjRes.insertId;

        // FIXED: Use the value sent from frontend!
        const totalStudents = Number(subj.total_students) || Number(total_students) || 120; // ← Real fix

        console.log(`Subject ${subj.subject_id}: Using totalStudents = ${totalStudents}`); // Debug

        const sections = subj.staffs || [];
        const sectionCount = sections.length;

        if (sectionCount === 0) {
          throw new Error(`No sections found for subject ${subj.subject_id}`);
        }

        // Distribute students
        const baseCount = Math.floor(totalStudents / sectionCount);
        let remainder = totalStudents % sectionCount;

        for (let index = 0; index < sectionCount; index++) {
          const st = sections[index];

          if (!st?.sectionId || !st?.staff_id) {
            throw new Error(`Invalid section/staff data for subject ${subj.subject_id}`);
          }

          const studentCount = baseCount + (remainder > 0 ? 1 : 0);
          if (remainder > 0) remainder--;

          console.log(`Section ${st.sectionId}: ${studentCount} students`); // Debug

          await conn.execute(
            `INSERT INTO CBCS_Section_Staff
             (cbcs_subject_id, sectionId, staffId, student_count)
             VALUES (?, ?, ?, ?)`,
            [cbcsSubjectId, st.sectionId, st.staff_id, studentCount]
          );
        }
      }

      await conn.commit();

      return res.json({
        success: true,
        message: 'CBCS created successfully',
        cbcs_id: cbcsId
      });

    } catch (err) {
      await conn.rollback();
      console.error('Transaction error:', err);
      throw err;
    } finally {
      conn.release();
    }

  } catch (err) {
    console.error('createCbcs error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
// export const createCbcs = async (req, res) => {
//   try {
//     const {
//       Deptid,
//       batchId,
//       semesterId,
//       createdBy,
//       subjects,
//       total_students,
//       type
//     } = req.body;
//     if (!Deptid || !batchId || !semesterId || !subjects || subjects.length === 0) {
//       return res.status(400).json({
//         error: 'Deptid, batchId, semesterId, and subjects are required'
//       });
//     }
//     console.log(subjects);

//     const conn = await pool.getConnection();

//     try {
//       await conn.beginTransaction();

//       // Insert CBCS master
//       const [cbcsResult] = await conn.execute(
//         `INSERT INTO CBCS 
//          (batchId, Deptid, semesterId, total_students, type, createdBy)
//          VALUES (?, ?, ?, ?, ?, ?)`,
//         [
//           batchId,
//           Deptid,
//           semesterId,
//           total_students || 0,
//           type || 'FCFS',
//           createdBy
//         ]
//       );

//       const cbcsId = cbcsResult.insertId;

//       // Loop subjects
//       for (const subj of subjects) {

//         // Insert CBCS_Subject
//         const [subjRes] = await conn.execute(
//           `INSERT INTO CBCS_Subject 
//            (cbcs_id, courseId, courseCode, courseTitle, category, type, credits, bucketName)
//            SELECT ?, c.courseId, c.courseCode, c.courseTitle, c.category, c.type, c.credits, ?
//            FROM Course c
//            WHERE c.courseId = ?`,
//           [cbcsId, subj.bucketName || 'Core', subj.subject_id]
//         );

//         const cbcsSubjectId = subjRes.insertId;

//         const totalStudents = Number(subj.total_students) || 0;
//         const sections = subj.staffs || [];
//         const sectionCount = sections.length;

//         if (sectionCount === 0) {
//           throw new Error(`No sections found for subject ${subj.subject_id}`);
//         }

//         // ✅ FIXED STUDENT DISTRIBUTION LOGIC
//         const baseCount = Math.floor(totalStudents / sectionCount);
//         let remainder = totalStudents % sectionCount;

//         for (let index = 0; index < sectionCount; index++) {
//           const st = sections[index];

//           if (!st?.sectionId || !st?.staff_id) {
//             throw new Error(`Invalid section/staff data for subject ${subj.subject_id}`);
//           }

//           const studentCount =
//             baseCount + (remainder > 0 ? 1 : 0);

//           if (remainder > 0) remainder--;

//           await conn.execute(
//             `INSERT INTO CBCS_Section_Staff
//              (cbcs_subject_id, sectionId, staffId, student_count)
//              VALUES (?, ?, ?, ?)`,
//             [cbcsSubjectId, st.sectionId, st.staff_id, studentCount]
//           );
//         }
//       }

//       await conn.commit();

//       return res.json({
//         success: true,
//         message: 'CBCS created successfully',
//         cbcs_id: cbcsId
//       });

//     } catch (err) {
//       await conn.rollback();
//       throw err;
//     } finally {
//       conn.release();
//     }

//   } catch (err) {
//     console.error('createCbcs error:', err);
//     res.status(500).json({
//       success: false,
//       error: err.message
//     });
//   }
// };


export const getAllCbcs = async (req, res) => {
  try {
    const conn = await pool.getConnection();

    try {
      const [rows] = await conn.execute(`
        SELECT 
          c.cbcs_id,
          c.batchId,
          b.batch,
          c.Deptid,
          d.DeptName,
          c.semesterId,
          s.semesterNumber,
          c.total_students,
          c.complete,
          c.isActive,
          c.allocation_excel_path,
          c.createdBy,
          u.userName AS createdByName,
          c.createdDate,
          c.updatedBy,
          c.updatedDate
        FROM CBCS c
        LEFT JOIN department d ON c.Deptid = d.Deptid
        LEFT JOIN batch b ON c.batchId = b.batchId
        LEFT JOIN semester s ON c.semesterId = s.semesterId
        LEFT JOIN users u ON c.createdBy = u.Userid
        ORDER BY c.cbcs_id DESC
      `);

      return res.json({
        success: true,
        total: rows.length,
        data: rows
      });

    } finally {
      conn.release();
    }

  } catch (err) {
    console.error('getAllCbcs error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};


// Get particular CBCS by ID
export const getCbcsById = async (req, res) => {
  try {
    const { id } = req.params; // cbcs_id from URL
    const conn = await pool.getConnection();

    // Query CBCS details
    const [cbcsRows] = await conn.query(
      `SELECT c.*, 
              d.DeptName, 
              b.batch, 
              c.semesterId,
              s.semesterNumber
       FROM CBCS c
       JOIN department d ON c.Deptid = d.Deptid
       JOIN batch b ON c.batchId = b.batchId
       JOIN semester s ON s.semesterId = c.semesterId
       WHERE c.cbcs_id = ?`,
      [id]
    );
    if (cbcsRows.length === 0) {
      return res.status(404).json({ message: "CBCS not found" });
    }
    const cbcs = cbcsRows[0];

    // Query subjects under this CBCS
    const [subjectRows] = await conn.query(
      `SELECT cs.*, 
              c.courseTitle, 
              c.courseCode 
       FROM CBCS_Subject cs
       LEFT JOIN course c ON cs.courseId = c.courseId
       WHERE cs.cbcs_id = ?`,
      [id]
    );

    // Query section-staff mapping
    // const [sectionStaffRows] = await conn.query(
    //   `SELECT css.*, 
    //           sec.sectionName, 
    //           u.username AS staffName 
    //    FROM CBCS_Section_Staff css
    //    LEFT JOIN Section sec ON css.sectionId = sec.sectionId
    //    LEFT JOIN users u ON css.staffId = u.Userid
    //    WHERE css.cbcs_subject_id IN (
    //       SELECT cbcs_subject_id FROM CBCS_Subject WHERE cbcs_id = ?
    //    )`,
    //   [id]
    // );

    cbcs.subjects = subjectRows;
    //cbcs.sectionStaff = sectionStaffRows;

    res.json({ success: true,cbcs });

    conn.release();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error retrieving CBCS", error });
  }
};


// =============================================
// 1. Student fetches available subjects + sections (working perfectly)
// =============================================
export const getStudentCbcsSelection = async (req, res) => {
  try {
    const { regno, batchId, deptId, semesterId } = req.query;

    if (!regno || !batchId || !deptId || !semesterId) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required params: regno, batchId, deptId, semesterId" 
      });
    }

    const conn = await pool.getConnection();
    try {
      const [cbcsRows] = await conn.execute(
        `SELECT c.*, d.DeptName, b.batch, s.semesterNumber
         FROM CBCS c
         JOIN department d ON d.Deptid = c.Deptid
         JOIN batch b ON b.batchId = c.batchId
         JOIN semester s ON s.semesterId = c.semesterId
         WHERE c.batchId = ? AND c.Deptid = ? AND c.semesterId = ?
           AND c.isActive = 'YES'`,
        [batchId, deptId, semesterId]
      );
      console.log(cbcsRows);

      if (cbcsRows.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: "No active CBCS found for your batch/department/semester" 
        });
      }

      const cbcs = cbcsRows[0];
      const cbcsId = cbcs.cbcs_id;

      const [subjects] = await conn.execute(
        `SELECT cs.cbcs_subject_id, cs.cbcs_id,
                cs.courseId, cs.courseCode, cs.courseTitle,
                cs.category, cs.type, cs.credits,
                cs.bucketName
         FROM cbcs_subject cs
         LEFT JOIN StudentElectiveSelection ses
           ON ses.selectedCourseId = cs.courseId
           AND ses.regno = ?
         WHERE cs.cbcs_id = ?
           AND (
             cs.bucketName = 'Core'
             OR ses.selectionId IS NOT NULL
           )`,
        [regno, cbcsId]
      );
      //console.log(subjects);

      const [staffRows] = await conn.execute(
        `SELECT 
            sc.courseId,
            sc.sectionId,
            sec.sectionName,
            u.Userid AS staffId,
            u.userName AS staffName
         FROM StaffCourse sc
         JOIN Section sec ON sec.sectionId = sc.sectionId
         JOIN users u ON u.Userid = sc.Userid
         WHERE sc.courseId IN (
           SELECT cs.courseId FROM CBCS_Subject cs WHERE cs.cbcs_id = ?
         )`,
        [cbcsId]
      );

      const courseStaffMap = {};
      staffRows.forEach(row => {
        if (!courseStaffMap[row.courseId]) courseStaffMap[row.courseId] = [];
        courseStaffMap[row.courseId].push({
          sectionId: row.sectionId,
          sectionName: row.sectionName,
          staffId: row.staffId,
          staffName: row.staffName
        });
      });

      const finalSubjects = subjects.map(sub => ({
        ...sub,
        staffs: courseStaffMap[sub.courseId] || []
      }));

      return res.json({
        success: true,
        cbcs: {
          ...cbcs,
          subjects: finalSubjects
        }
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("getStudentCbcsSelection error:", err);
    res.status(500).json({ success: false, error: "Server error while fetching subjects" });
  }
};


// Helper for background finalization
const runBackgroundFinalization = (cbcs_id, createdBy = 1) => {
  console.log(`[BG-FINALIZE] Starting background finalization for CBCS ${cbcs_id}`);
  finalizeAndOptimizeAllocation(cbcs_id, createdBy)
    .then(() => console.log(`[BG-FINALIZE] SUCCESS for CBCS ${cbcs_id}`))
    .catch(err => console.error(`[BG-FINALIZE] FAILED for CBCS ${cbcs_id}:`, err));
};

// =============================================
// Student submits choices - ONE TIME ONLY
// =============================================
export const submitStudentCourseSelection = async (req, res) => {
  const { regno, cbcs_id, selections } = req.body;

  if (!regno || !cbcs_id || !Array.isArray(selections) || selections.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: "Invalid data: regno, cbcs_id, and selections array required" 
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Prevent concurrent submissions from same student+cbcs
    const [[{ lock_acquired }]] = await conn.execute(
      `SELECT GET_LOCK(CONCAT('submit_cbcs_', ?, '_', ?), 10) AS lock_acquired`,
      [regno, cbcs_id]
    );

    if (lock_acquired !== 1) {
      return res.status(429).json({ 
        success: false, 
        error: "Submission is being processed. Please wait a moment and try again." 
      });
    }

    // Check if already submitted
    const [existing] = await conn.execute(
      `SELECT 1 FROM student_temp_choice 
       WHERE regno = ? AND cbcs_id = ? LIMIT 1`,
      [regno, cbcs_id]
    );

    if (existing.length > 0) {
      throw new Error("You have already submitted your choices. Submission is final.");
    }

    // Insert all choices
    for (let i = 0; i < selections.length; i++) {
      const sel = selections[i];

      if (!sel.courseId || !sel.sectionId || !sel.staffId) {
        throw new Error(`Invalid selection at index ${i}`);
      }

      await conn.execute(
        `INSERT INTO student_temp_choice
         (regno, cbcs_id, courseId, preferred_sectionId, preferred_staffId, preference_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [regno, cbcs_id, sel.courseId, sel.sectionId, sel.staffId, i + 1]
      );
    }

    // Check if this was the last submission
    const [[cbcsInfo]] = await conn.execute(
      `SELECT total_students AS expected, complete
       FROM CBCS 
       WHERE cbcs_id = ?`,
      [cbcs_id]
    );

    if (cbcsInfo.complete !== 'YES') {
      const expected = Number(cbcsInfo.expected) || 0;
      if (expected > 0) {
        const [[{ submitted }]] = await conn.execute(
          `SELECT COUNT(DISTINCT regno) AS submitted
           FROM student_temp_choice
           WHERE cbcs_id = ?`,
          [cbcs_id]
        );

        console.log(`CBCS ${cbcs_id} progress: ${submitted}/${expected} students`);

        // If last submission → queue finalization in background
        if (submitted >= expected) {
          console.log(`[LAST SUBMISSION] Queuing background finalization for CBCS ${cbcs_id}`);
          setImmediate(() => runBackgroundFinalization(cbcs_id, 1));
        }
      }
    }

    await conn.commit();

    return res.json({
      success: true,
      message: "Choices submitted successfully. You cannot change them anymore."
    });

  } catch (err) {
    await conn.rollback();
    console.error("submitStudentCourseSelection error:", err);
    res.status(400).json({ 
      success: false, 
      error: err.message || "Failed to submit choices" 
    });
  } finally {
    // Release lock
    try {
      await conn.execute(
        `SELECT RELEASE_LOCK(CONCAT('submit_cbcs_', ?, '_', ?))`,
        [regno, cbcs_id]
      );
    } catch {}
    conn.release();
  }
};

// =============================================
// Final allocation & optimization (now background only)
// =============================================
export const finalizeAndOptimizeAllocation = async (cbcs_id, createdBy = 1) => {
  const conn = await pool.getConnection();
  try {
    // Increase lock wait timeout for long operations
    await conn.execute("SET SESSION innodb_lock_wait_timeout = 120"); // 2 minutes

    await conn.beginTransaction();

    console.log(`[FINALIZE] Started for CBCS ${cbcs_id}`);

    const [subjects] = await conn.execute(
      `SELECT cs.cbcs_subject_id, cs.courseId
       FROM CBCS_Subject cs WHERE cbcs_id = ?`,
      [cbcs_id]
    );

    for (const subj of subjects) {
      const courseId = subj.courseId;

      await conn.execute(`DELETE FROM studentcourse WHERE courseId = ?`, [courseId]);

      const [preferences] = await conn.execute(
        `SELECT regno, preferred_sectionId AS sectionId, preferred_staffId AS staffId
         FROM student_temp_choice
         WHERE cbcs_id = ? AND courseId = ?
         ORDER BY preference_order ASC`,
        [cbcs_id, courseId]
      );

      if (preferences.length === 0) {
        console.log(`[FINALIZE] No preferences for course ${courseId}`);
        continue;
      }

      const [sections] = await conn.execute(
        `SELECT sectionId, staffId, student_count AS max_capacity
         FROM CBCS_Section_Staff WHERE cbcs_subject_id = ?`,
        [subj.cbcs_subject_id]
      );

      const allocations = new Map();
      sections.forEach(s => {
        allocations.set(s.sectionId, {
          staffId: s.staffId,
          max: Number(s.max_capacity),
          current: 0,
          students: []
        });
      });

      // First pass: assign preferred section if capacity allows
      for (const pref of preferences) {
        const target = allocations.get(pref.sectionId);
        if (target && target.current < target.max) {
          target.current++;
          target.students.push(pref.regno);
          continue;
        }

        // Find section with most remaining capacity
        let best = null;
        let bestSpace = -1;
        for (const data of allocations.values()) {
          const space = data.max - data.current;
          if (space > bestSpace) {
            bestSpace = space;
            best = data;
          }
        }

        if (best && bestSpace > 0) {
          best.current++;
          best.students.push(pref.regno);
        }
      }

      // Second pass: balance excess
      for (const [sectionId, data] of allocations) {
        while (data.current > data.max && data.students.length > 0) {
          const student = data.students.pop();
          data.current--;

          let target = null;
          let maxSpace = -1;
          for (const tData of allocations.values()) {
            if (tData === data) continue;
            const space = tData.max - tData.current;
            if (space > maxSpace) {
              maxSpace = space;
              target = tData;
            }
          }

          if (target && maxSpace > 0) {
            target.current++;
            target.students.push(student);
          } else {
            data.students.push(student);
            data.current++;
            break;
          }
        }
      }

      // Save final allocation - FIXED: correct column count
      for (const [sectionId, data] of allocations) {
        for (const regno of data.students) {
          await conn.execute(
            `INSERT INTO studentcourse 
             (regno, courseId, sectionId, createdBy, createdDate)
             VALUES (?, ?, ?, ?, NOW())`,
            [regno, courseId, sectionId, createdBy]
          );
        }
      }
    }

    // Mark CBCS as completed
    await conn.execute(
      `UPDATE CBCS SET complete = 'YES', updatedBy = ?, updatedDate = NOW()
       WHERE cbcs_id = ?`,
      [createdBy, cbcs_id]
    );

    await conn.commit();
    console.log(`[FINALIZE] Successfully completed allocation for CBCS ${cbcs_id}`);

  } catch (err) {
    await conn.rollback();
    console.error(`[FINALIZE] Error for CBCS ${cbcs_id}:`, err);
    throw err;
  } finally {
    conn.release();
  }
};

// =============================================
// Your existing downloadCbcsExcel function (unchanged)
// =============================================


// // =============================================
// // 2. Student submits choices - ONE TIME ONLY
// // + Automatically triggers finalization if this was the last submission
// // =============================================


// export const submitStudentCourseSelection = async (req, res) => {
//   const { regno, cbcs_id, selections } = req.body;

//   if (!regno || !cbcs_id || !Array.isArray(selections) || selections.length === 0) {
//     return res.status(400).json({ 
//       success: false, 
//       error: "Invalid data: regno, cbcs_id, and selections array required" 
//     });
//   }

//   const conn = await pool.getConnection();
//   try {
//     await conn.beginTransaction();

//     // Prevent resubmission
//     const [existing] = await conn.execute(
//       `SELECT 1 FROM student_temp_choice 
//        WHERE regno = ? AND cbcs_id = ? LIMIT 1`,
//       [regno, cbcs_id]
//     );

//     if (existing.length > 0) {
//       return res.status(403).json({
//         success: false,
//         error: "You have already submitted your choices. Submission is final."
//       });
//     }

//     // Insert all choices
//     for (let i = 0; i < selections.length; i++) {
//       const sel = selections[i];

//       if (!sel.courseId || !sel.sectionId || !sel.staffId) {
//         throw new Error(`Invalid selection at index ${i}: missing course/section/staff`);
//       }

//       await conn.execute(
//         `INSERT INTO student_temp_choice
//          (regno, cbcs_id, courseId, preferred_sectionId, preferred_staffId, preference_order)
//          VALUES (?, ?, ?, ?, ?, ?)`,
//         [regno, cbcs_id, sel.courseId, sel.sectionId, sel.staffId, i + 1]
//       );
//     }

//     // Check if this submission completed all students
//     const [[cbcsInfo]] = await conn.execute(
//       `SELECT total_students AS expected, complete
//        FROM CBCS 
//        WHERE cbcs_id = ?`,
//       [cbcs_id]
//     );

//     if (cbcsInfo.complete === 'YES') {
//       await conn.commit();
//       return res.json({
//         success: true,
//         message: "Choices submitted successfully (CBCS already finalized)"
//       });
//     }

//     const expected = cbcsInfo.expected || 0;

//     if (expected > 0) {
//       const [[{ submitted }]] = await conn.execute(
//         `SELECT COUNT(DISTINCT regno) AS submitted
//          FROM student_temp_choice
//          WHERE cbcs_id = ?`,
//         [cbcs_id]
//       );

//       console.log(`After submission - CBCS ${cbcs_id}: ${submitted}/${expected} students`);

//       // If all students have submitted → immediately finalize
//       if (submitted >= expected) {
//         console.log(`[AUTO-FINALIZE] All students submitted! Starting finalization for CBCS ${cbcs_id}`);
//         await finalizeAndOptimizeAllocation(cbcs_id, 1); // 1 = system/admin user ID
//       }
//     }

//     await conn.commit();

//     return res.json({
//       success: true,
//       message: "Choices submitted successfully. You cannot change them anymore."
//     });
//   } catch (err) {
//     await conn.rollback();
//     console.error("submitStudentCourseSelection error:", err);
//     res.status(500).json({ success: false, error: err.message });
//   } finally {
//     conn.release();
//   }
// };

// // =============================================
// // 3. Final allocation & optimization (called automatically when ready)
// // =============================================
// export const finalizeAndOptimizeAllocation = async (cbcs_id, createdBy = 1) => {
//   const conn = await pool.getConnection();
//   try {
//     await conn.beginTransaction();

//     // Get all subjects in this CBCS
//     const [subjects] = await conn.execute(
//       `SELECT cs.cbcs_subject_id, cs.courseId
//        FROM CBCS_Subject cs WHERE cbcs_id = ?`,
//       [cbcs_id]
//     );

//     for (const subj of subjects) {
//       const courseId = subj.courseId;

//       // Clear previous final allocation
//       await conn.execute(`DELETE FROM studentcourse WHERE courseId = ?`, [courseId]);

//       // Get student preferences ordered by preference
//       const [preferences] = await conn.execute(
//         `SELECT regno, preferred_sectionId AS sectionId, preferred_staffId AS staffId
//          FROM student_temp_choice
//          WHERE cbcs_id = ? AND courseId = ?
//          ORDER BY preference_order ASC`,
//         [cbcs_id, courseId]
//       );

//       if (preferences.length === 0) continue;

//       // Get sections with max capacity
//       const [sections] = await conn.execute(
//         `SELECT sectionId, staffId, student_count AS max_capacity
//          FROM CBCS_Section_Staff WHERE cbcs_subject_id = ?`,
//         [subj.cbcs_subject_id]
//       );

//       const allocations = new Map();
//       sections.forEach(s => {
//         allocations.set(s.sectionId, {
//           staffId: s.staffId,
//           max: Number(s.max_capacity),
//           current: 0,
//           students: []
//         });
//       });

//       // First pass: assign preferred section if capacity allows
//       for (const pref of preferences) {
//         const target = allocations.get(pref.sectionId);
//         if (target && target.current < target.max) {
//           target.current++;
//           target.students.push(pref.regno);
//           continue;
//         }

//         // Find section with most remaining capacity
//         let best = null;
//         let bestSpace = -1;
//         for (const data of allocations.values()) {
//           const space = data.max - data.current;
//           if (space > bestSpace) {
//             bestSpace = space;
//             best = data;
//           }
//         }

//         if (best && bestSpace > 0) {
//           best.current++;
//           best.students.push(pref.regno);
//         }
//       }

//       // Second pass: balance excess (move from overloaded to underloaded)
//       for (const [sectionId, data] of allocations) {
//         while (data.current > data.max && data.students.length > 0) {
//           const student = data.students.pop();
//           data.current--;

//           let target = null;
//           let maxSpace = -1;
//           for (const tData of allocations.values()) {
//             if (tData === data) continue;
//             const space = tData.max - tData.current;
//             if (space > maxSpace) {
//               maxSpace = space;
//               target = tData;
//             }
//           }

//           if (target && maxSpace > 0) {
//             target.current++;
//             target.students.push(student);
//           } else {
//             // No space → put back (this student remains unallocated)
//             data.students.push(student);
//             data.current++;
//             break;
//           }
//         }
//       }

//       // Save final allocation to studentcourse
//       for (const [sectionId, data] of allocations) {
//         for (const regno of data.students) {
//           await conn.execute(
//             `INSERT INTO studentcourse 
//              (regno, courseId, sectionId, createdBy, createdDate)
//              VALUES (?, ?, ?, ?, NOW())`,
//             [regno, courseId, sectionId, createdBy]
//           );
//         }
//       }
//     }

//     // Mark CBCS as completed
//     await conn.execute(
//       `UPDATE CBCS SET complete = 'YES', updatedBy = ?, updatedDate = NOW()
//        WHERE cbcs_id = ?`,
//       [createdBy, cbcs_id]
//     );

//     await conn.commit();
//     console.log(`[FINALIZE] Successfully completed allocation for CBCS ${cbcs_id}`);
//   } catch (err) {
//     await conn.rollback();
//     console.error(`[FINALIZE] Error for CBCS ${cbcs_id}:`, err);
//   } finally {
//     conn.release();
//   }
// };

// controllers/cbcsController.js
export const downloadCbcsExcel = async (req, res) => {
  const { cbcs_id } = req.params;

  if (!cbcs_id) {
    return res.status(400).json({ success: false, error: "cbcs_id is required" });
  }

  const conn = await pool.getConnection();
  try {
    // 1. Verify CBCS exists
    const [[cbcs]] = await conn.execute(
      `SELECT * FROM CBCS WHERE cbcs_id = ?`,
      [cbcs_id]
    );

    if (!cbcs) {
      return res.status(404).json({ success: false, error: "CBCS not found" });
    }

    // 2. Create new Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CBCS System';
    workbook.created = new Date();

    // Color palette
    const colors = {
      titleBg: 'FFFFFF00',     // Yellow
      staffBg: 'FFDDEBF7',     // Light blue
      headerBg: 'FFFF7F66',    // Orange
      border: 'FFD9D9D9'
    };

    // 3. Get all subjects in this CBCS
    const [subjects] = await conn.execute(
      `SELECT cs.*, c.courseCode, c.courseTitle
       FROM CBCS_Subject cs
       JOIN Course c ON c.courseId = cs.courseId
       WHERE cs.cbcs_id = ?
       ORDER BY c.courseCode`,
      [cbcs_id]
    );

    for (const subject of subjects) {
      const sheet = workbook.addWorksheet(subject.courseCode || String(subject.courseId));

      // Get sections/staff for this subject
      const [sections] = await conn.execute(
        `SELECT css.*, u.userName AS staffName
         FROM CBCS_Section_Staff css
         JOIN users u ON u.Userid = css.staffId
         WHERE css.cbcs_subject_id = ?
         ORDER BY css.sectionId`,
        [subject.cbcs_subject_id]
      );

      const sectionCount = sections.length;
      if (sectionCount === 0) continue;

      const totalColumns = sectionCount * 2;

      // ─── TITLE ROW ───────────────────────────────────────────────────────
      const titleRow = sheet.addRow([`Subject: ${subject.courseId} - ${subject.courseTitle}`]);
      
      // Merge exactly across all used columns
      sheet.mergeCells(1, 1, 1, totalColumns);
      
      const titleCell = titleRow.getCell(1);
      titleCell.font = { bold: true, size: 14, color: { argb: 'FF000000' } };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: colors.titleBg }
      };
      titleCell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        indent: 1
      };

      // ─── STAFF NAME ROW ──────────────────────────────────────────────────
      const staffRow = sheet.addRow([]);
      let col = 1;
      sections.forEach(sec => {
        const cell = staffRow.getCell(col);
        cell.value = `staffId:${sec.staffId} | ${sec.staffName || 'Not Assigned'}`;
        cell.font = { bold: true, size: 11 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: colors.staffBg }
        };
        cell.alignment = {
          horizontal: 'center',
          vertical: 'middle'
        };

        sheet.mergeCells(2, col, 2, col + 1);
        col += 2;
      });

      // ─── HEADER ROW ──────────────────────────────────────────────────────
      const headerRow = sheet.addRow([]);
      col = 1;
      sections.forEach(() => {
        // Regno
        const regnoCell = headerRow.getCell(col);
        regnoCell.value = 'Regno';
        regnoCell.font = { bold: true };
        regnoCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: colors.headerBg }
        };
        regnoCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // Student's Name
        const nameCell = headerRow.getCell(col + 1);
        nameCell.value = "Student's Name";
        nameCell.font = { bold: true };
        nameCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: colors.headerBg }
        };
        nameCell.alignment = { horizontal: 'center', vertical: 'middle' };

        col += 2;
      });

      // Freeze top 3 rows
      sheet.views = [{ state: 'frozen', ySplit: 3 }];

      // ─── STUDENTS DATA ───────────────────────────────────────────────────
      const [students] = await conn.execute(
        `SELECT 
           sc.regno, 
           u.userName AS studentName,
           sc.sectionId
         FROM studentcourse sc
         JOIN student_details sd ON sd.regno = sc.regno
         JOIN users u ON u.Userid = sd.Userid
         WHERE sc.courseId = ?
         ORDER BY sc.sectionId, sc.regno`,
        [subject.courseId]
      );

      // Group students by section
      const studentsBySection = new Map();
      sections.forEach(s => studentsBySection.set(s.sectionId, []));
      students.forEach(st => {
        const sectionStudents = studentsBySection.get(st.sectionId);
        if (sectionStudents) sectionStudents.push(st);
      });

      // Find max rows needed
      const maxRows = Math.max(...[...studentsBySection.values()].map(arr => arr.length), 0);

      // Fill student data
      for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
        const dataRow = sheet.addRow([]);
        col = 1;

        sections.forEach(sec => {
          const student = studentsBySection.get(sec.sectionId)?.[rowIdx];
          if (student) {
            dataRow.getCell(col).value = student.regno;
            dataRow.getCell(col + 1).value = student.studentName || '—';
          }
          col += 2;
        });
      }

      // ─── COLUMN WIDTHS ───────────────────────────────────────────────────
      col = 1;
      sections.forEach(() => {
        sheet.getColumn(col).width = 14;     // Regno
        sheet.getColumn(col + 1).width = 36; // Student's Name
        col += 2;
      });

      // Optional: Add thin borders to header area
      for (let r = 1; r <= 3; r++) {
        for (let c = 1; c <= totalColumns; c++) {
          sheet.getCell(r, c).border = {
            top:    { style: 'thin' },
            left:   { style: 'thin' },
            bottom: { style: 'thin' },
            right:  { style: 'thin' }
          };
        }
      }
    }

    // 4. Save and send file
    const tempDir = path.join(process.cwd(), 'temp', 'cbcs');

    try {
      await fs.mkdir(tempDir, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }

    const fileName = `CBCS_Allocation_${cbcs_id}.xlsx`;
    const filePath = path.join(tempDir, fileName);

    await workbook.xlsx.writeFile(filePath);

    res.download(filePath, fileName, async (err) => {
      if (err) {
        console.error("Download error:", err);
      }
      try {
        await fs.unlink(filePath);
      } catch (cleanupErr) {
        console.error("Cleanup failed:", cleanupErr);
      }
    });

  } catch (err) {
    console.error("downloadCbcsExcel error:", err);
    res.status(500).json({ success: false, error: "Failed to generate Excel" });
  } finally {
    conn.release();
  }
};

export const manualFinalizeCbcs = async (req, res) => {
  try {
    const { id } = req.params; 

    if (!id) {
      return res.status(400).json({ success: false, error: "CBCS ID is required" });
    }

    console.log(`[MANUAL TRIGGER] Request received for CBCS ID: ${id}`);

    
    await finalizeAndOptimizeAllocation(id, 1); 

    return res.json({ 
      success: true, 
      message: `Allocation finalized successfully for CBCS ${id}` 
    });

  } catch (err) {
    console.error("Manual Finalize Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
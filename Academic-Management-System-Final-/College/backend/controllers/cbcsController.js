// controllers/cbcsController.js
import db from '../models/index.js';
import { Op } from 'sequelize';
import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import path from 'path';

const { 
  sequelize, CBCS, CBCSSubject, CBCSSectionStaff, Course, 
  Section, StaffCourse, User, ElectiveBucket, ElectiveBucketCourse,
  StudentElectiveSelection, StudentDetails, StudentCourse, studentTempChoice,
  Department, Batch, Semester
} = db;

/**
 * GET COURSES BY BATCH DEPT SEMESTER
 */
export const getCoursesByBatchDeptSemester = async (req, res) => {
  try {
    const { departmentId, batchId, semesterId } = req.query;

    if (!departmentId || !batchId || !semesterId) {
      return res.status(400).json({ error: "departmentId, batchId and semesterId are required" });
    }

    // 1. Fetch Courses with Bucket Mapping
    const allCourses = await Course.findAll({
      where: { semesterId, isActive: 'YES' },
      include: [{
        model: ElectiveBucketCourse,
        include: [{ model: ElectiveBucket, where: { semesterId } }]
      }]
    });

    // 2. Fetch Sections and Staff
    const sections = await Section.findAll({
      where: { isActive: 'YES' },
      include: [{
        model: StaffCourse,
        include: [{ model: User, attributes: ['userId', 'userName', 'userMail', 'roleId'] }]
      }]
    });

    // 3. Get elective student counts
    const electiveCounts = await StudentElectiveSelection.findAll({
      attributes: ['selectedCourseId', [sequelize.fn('COUNT', sequelize.col('selectionId')), 'studentCount']],
      where: { status: { [Op.in]: ['pending', 'allocated'] } },
      group: ['selectedCourseId'],
      raw: true
    });

    const countsMap = new Map(electiveCounts.map(c => [c.selectedCourseId, parseInt(c.studentCount)]));

    // 4. Group data for Frontend
    const groupedCourses = {};

    allCourses.forEach(course => {
      // Find bucket info from include
      const bucketMapping = course.ElectiveBucketCourses?.[0]?.ElectiveBucket;
      const key = bucketMapping 
        ? `Elective Bucket ${bucketMapping.bucketNumber} - ${bucketMapping.bucketName}`
        : "Core";

      if (!groupedCourses[key]) groupedCourses[key] = [];

      // Find sections for this specific course
      const courseSections = sections
        .filter(s => s.courseId === course.courseId)
        .map(s => ({
          sectionId: s.sectionId,
          sectionName: s.sectionName,
          staff: s.StaffCourses?.map(sc => ({
            Userid: sc.User?.userId,
            userName: sc.User?.userName,
            email: sc.User?.userMail
          })) || []
        }));

      groupedCourses[key].push({
        ...course.get({ plain: true }),
        total_students: bucketMapping ? (countsMap.get(course.courseId) || 0) : 120,
        sections: courseSections
      });
    });

    return res.json({ success: true, courses: groupedCourses });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * CREATE CBCS
 */
export const createCbcs = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { departmentId, batchId, semesterId, createdBy, subjects, total_students, type } = req.body;

    const dept = await Department.findByPk(departmentId, { transaction: t });
    const batch = await Batch.findByPk(batchId, { transaction: t });
    const semester = await Semester.findByPk(semesterId, { transaction: t });

    if (!dept) throw new Error(`Invalid department id: ${departmentId}`);
    if (!batch || batch.isActive !== 'YES') throw new Error(`Invalid/inactive batch id: ${batchId}`);
    if (!semester || semester.isActive !== 'YES') throw new Error(`Invalid/inactive semester id: ${semesterId}`);

    if (Number(semester.batchId) !== Number(batch.batchId)) {
      throw new Error(`Semester ${semesterId} does not belong to batch ${batchId}`);
    }

    // Batch.branch must correspond to the selected department.
    const batchBranch = String(batch.branch || '').trim().toUpperCase();
    const deptAcr = String(dept.departmentAcr || '').trim().toUpperCase();
    const deptName = String(dept.departmentName || '').trim().toUpperCase();
    if (batchBranch !== deptAcr && batchBranch !== deptName) {
      throw new Error(`Batch ${batchId} does not belong to department ${departmentId}`);
    }

    const cbcs = await CBCS.create({
      batchId, departmentId, semesterId, 
      total_students: total_students || 0, 
      type: type || 'FCFS', 
      createdBy
    }, { transaction: t });

    for (const subj of subjects) {
      const course = await Course.findByPk(subj.subject_id, { transaction: t });
      
      const cbcsSubj = await CBCSSubject.create({
        cbcs_id: cbcs.cbcs_id,
        courseId: course.courseId,
        courseCode: course.courseCode,
        courseTitle: course.courseTitle,
        category: course.category,
        type: course.type,
        credits: course.credits,
        bucketName: subj.bucketName || 'Core'
      }, { transaction: t });

      const totalStudents = Number(subj.total_students) || Number(total_students) || 120;
      const staffs = subj.staffs || [];
      const sectionCount = staffs.length;

      if (sectionCount === 0) throw new Error(`No sections found for subject ${course.courseCode}`);

      const baseCount = Math.floor(totalStudents / sectionCount);
      let remainder = totalStudents % sectionCount;

      for (let i = 0; i < sectionCount; i++) {
        const studentCount = baseCount + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;

        await CBCSSectionStaff.create({
          cbcs_subject_id: cbcsSubj.cbcs_subject_id,
          sectionId: staffs[i].sectionId,
          staffId: staffs[i].staff_id,
          student_count: studentCount
        }, { transaction: t });
      }
    }

    await t.commit();
    res.json({ success: true, message: 'CBCS created successfully', cbcs_id: cbcs.cbcs_id });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET ALL CBCS
 */
export const getAllCbcs = async (req, res) => {
  try {
    const rows = await CBCS.findAll({
      include: [
        { model: Department, attributes: ['departmentName'] },
        { model: Batch, attributes: ['batch'] },
        { model: Semester, attributes: ['semesterNumber'] },
        { model: CBCSSubject, attributes: ['courseCode', 'courseTitle'] }
      ],
      order: [['cbcs_id', 'DESC']]
    });

    const data = rows.map((row) => {
      const plain = row.get({ plain: true });
      return {
        cbcs_id: plain.cbcs_id,
        departmentId: plain.departmentId,
        batchId: plain.batchId,
        semesterId: plain.semesterId,
        complete: plain.complete,
        isActive: plain.isActive,
        total_students: plain.total_students,
        createdBy: plain.createdBy,
        updatedBy: plain.updatedBy,
        createdDate: plain.createdAt || plain.createdDate,
        updatedDate: plain.updatedAt || plain.updatedDate,
        DeptName: plain.Department?.departmentName || 'N/A',
        batch: plain.Batch?.batch || 'N/A',
        semesterNumber: plain.Semester?.semesterNumber ?? null,
        courseNames: (plain.CBCSSubjects || []).map((s) => s.courseTitle).filter(Boolean),
        courseCodes: (plain.CBCSSubjects || []).map((s) => s.courseCode).filter(Boolean),
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET CBCS BY ID
 */
export const getCbcsById = async (req, res) => {
  try {
    const { id } = req.params;
    const cbcs = await CBCS.findByPk(id, {
      include: [
        { model: Department },
        { model: Batch },
        { model: Semester },
        { 
          model: CBCSSubject,
          include: [{ model: Course, attributes: ['courseTitle', 'courseCode'] }]
        }
      ]
    });
    if (!cbcs) return res.status(404).json({ message: "CBCS not found" });
    res.json({ success: true, cbcs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * STUDENT SIDE: GET SELECTION OPTIONS
 */
export const getStudentCbcsSelection = async (req, res) => {
  try {
    const { regno, batchId, deptId, semesterId } = req.query;

    const cbcs = await CBCS.findOne({
      where: { batchId, departmentId: deptId, semesterId },
      include: [{ model: Department }, { model: Batch }, { model: Semester }]
    });

    if (!cbcs) return res.status(404).json({ success: false, error: "No active CBCS found" });

    // Logic to only show Core or Electives specifically selected by this student
    const subjects = await CBCSSubject.findAll({
      where: { cbcs_id: cbcs.cbcs_id }
    });

    // Note: We filter subjects manually here to check StudentElectiveSelection logic
    const finalSubjects = [];
    for (const sub of subjects) {
      if (sub.bucketName !== 'Core') {
        const elected = await StudentElectiveSelection.findOne({
          where: { regno, selectedCourseId: sub.courseId }
        });
        if (!elected) continue;
      }

      // Fetch Staff for these subjects
      const staffAssignments = await StaffCourse.findAll({
        where: { courseId: sub.courseId },
        include: [
          { model: Section, attributes: ['sectionName'] },
          { model: User, attributes: ['userName'] }
        ]
      });

      finalSubjects.push({
        ...sub.get({ plain: true }),
        staffs: staffAssignments.map(sa => ({
          sectionId: sa.sectionId,
          sectionName: sa.Section?.sectionName,
          staffId: sa.Userid,
          staffName: sa.User?.userName
        }))
      });
    }

    res.json({ success: true, cbcs: { ...cbcs.get({ plain: true }), subjects: finalSubjects } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * SUBMIT STUDENT CHOICES
 */
export const submitStudentCourseSelection = async (req, res) => {
  const { regno, cbcs_id, selections } = req.body;
  const t = await sequelize.transaction();

  try {
    const alreadySubmitted = await studentTempChoice.findOne({ where: { regno, cbcs_id } });
    if (alreadySubmitted) throw new Error("Choices already submitted.");

    for (let i = 0; i < selections.length; i++) {
      const sel = selections[i];
      await studentTempChoice.create({
        regno,
        cbcs_id,
        courseId: sel.courseId,
        preferred_sectionId: sel.sectionId,
        preferred_staffId: sel.staffId,
        preference_order: i + 1
      }, { transaction: t });
    }

    const cbcsInfo = await CBCS.findByPk(cbcs_id, { transaction: t });
    const submittedCount = await studentTempChoice.count({
      where: { cbcs_id },
      distinct: true,
      col: 'regno',
      transaction: t
    });

    await t.commit();

    // Trigger background finalization if this was the last student
    if (cbcsInfo.complete !== 'YES' && submittedCount >= cbcsInfo.total_students) {
      setImmediate(() => finalizeAndOptimizeAllocation(cbcs_id, 1));
    }

    res.json({ success: true, message: "Choices submitted successfully." });
  } catch (err) {
    await t.rollback();
    res.status(400).json({ success: false, error: err.message });
  }
};

/**
 * FINAL ALLOCATION LOGIC (Background Process)
 */
export const finalizeAndOptimizeAllocation = async (cbcs_id, createdBy = 1) => {
  const t = await sequelize.transaction();
  try {
    const subjects = await CBCSSubject.findAll({ where: { cbcs_id }, transaction: t });

    for (const subj of subjects) {
      // 1. Clear existing
      await StudentCourse.destroy({ where: { courseId: subj.courseId }, transaction: t });

      // 2. Get preferences
      const preferences = await studentTempChoice.findAll({
        where: { cbcs_id, courseId: subj.courseId },
        order: [['preference_order', 'ASC']],
        transaction: t
      });

      // 3. Get section capacities
      const sections = await CBCSSectionStaff.findAll({ 
        where: { cbcs_subject_id: subj.cbcs_subject_id },
        transaction: t 
      });

      const allocations = new Map();
      sections.forEach(s => {
        allocations.set(s.sectionId, { max: s.student_count, current: 0, students: [] });
      });

      // 4. Allocation algorithm (Same logic as raw SQL)
      for (const pref of preferences) {
        const target = allocations.get(pref.preferred_sectionId);
        if (target && target.current < target.max) {
          target.current++;
          target.students.push(pref.regno);
          continue;
        }
        
        // Find best fallback section
        let bestSectionId = null;
        let bestSpace = -1;
        for (const [id, data] of allocations) {
          const space = data.max - data.current;
          if (space > bestSpace) {
            bestSpace = space;
            bestSectionId = id;
          }
        }

        if (bestSectionId) {
          const fallback = allocations.get(bestSectionId);
          fallback.current++;
          fallback.students.push(pref.regno);
        }
      }

      // 5. Bulk Create StudentCourse entries
      const studentCourseData = [];
      for (const [sectionId, data] of allocations) {
        data.students.forEach(regno => {
          studentCourseData.push({
            regno,
            courseId: subj.courseId,
            sectionId,
            createdBy: 'System'
          });
        });
      }
      await StudentCourse.bulkCreate(studentCourseData, { transaction: t });
    }

    await CBCS.update({ complete: 'YES', updatedBy: createdBy }, { where: { cbcs_id }, transaction: t });
    await t.commit();
    console.log(`[FINALIZE] Success for CBCS ${cbcs_id}`);
  } catch (err) {
    await t.rollback();
    console.error(`[FINALIZE] Error:`, err);
  }
};

/**
 * DOWNLOAD EXCEL
 */
export const downloadCbcsExcel = async (req, res) => {
  const { cbcs_id } = req.params;
  if (!cbcs_id) {
    return res.status(400).json({ success: false, error: "cbcs_id is required" });
  }

  try {
    const cbcs = await CBCS.findByPk(cbcs_id);
    if (!cbcs) {
      return res.status(404).json({ success: false, error: "CBCS not found" });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CBCS System";
    workbook.created = new Date();

    const colors = {
      titleBg: "FFFFFF00",  // Yellow
      staffBg: "FFDDEBF7",  // Light blue
      headerBg: "FFFF7F66", // Orange
    };

    const subjects = await sequelize.query(
      `SELECT cs.cbcs_subject_id, cs.courseId, cs.courseCode, cs.courseTitle, c.courseCode AS courseCodeReal, c.courseTitle AS courseTitleReal
       FROM CBCS_Subject cs
       JOIN Course c ON c.courseId = cs.courseId
       WHERE cs.cbcs_id = :cbcsId
       ORDER BY c.courseCode`,
      {
        replacements: { cbcsId: cbcs_id },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    for (const subject of subjects) {
      const sheetNameRaw = subject.courseCodeReal || subject.courseCode || String(subject.courseId);
      const sheet = workbook.addWorksheet(String(sheetNameRaw).slice(0, 31));

      const sections = await sequelize.query(
        `SELECT css.sectionId, css.staffId, u.userName AS staffName, u.userNumber AS staffNumber
         FROM CBCS_Section_Staff css
         LEFT JOIN users u ON u.userId = css.staffId
         WHERE css.cbcs_subject_id = :cbcsSubjectId
         ORDER BY css.sectionId`,
        {
          replacements: { cbcsSubjectId: subject.cbcs_subject_id },
          type: sequelize.QueryTypes.SELECT,
        }
      );

      const sectionCount = sections.length;
      if (sectionCount === 0) continue;
      const totalColumns = sectionCount * 2;

      // Title row
      const titleText = `Subject: ${subject.courseCodeReal || subject.courseCode || subject.courseId} - ${subject.courseTitleReal || subject.courseTitle || ""}`;
      const titleRow = sheet.addRow([titleText]);
      sheet.mergeCells(1, 1, 1, totalColumns);
      const titleCell = titleRow.getCell(1);
      titleCell.font = { bold: true, size: 14, color: { argb: "FF000000" } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.titleBg } };
      titleCell.alignment = { horizontal: "center", vertical: "middle", indent: 1 };

      // Staff row
      const staffRow = sheet.addRow([]);
      let col = 1;
      sections.forEach((sec) => {
        const cell = staffRow.getCell(col);
        cell.value = `staffNumber:${sec.staffNumber || "-"} | ${sec.staffName || "Not Assigned"}`;
        cell.font = { bold: true, size: 11 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.staffBg } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        sheet.mergeCells(2, col, 2, col + 1);
        col += 2;
      });

      // Header row
      const headerRow = sheet.addRow([]);
      col = 1;
      sections.forEach(() => {
        const regnoCell = headerRow.getCell(col);
        regnoCell.value = "Regno";
        regnoCell.font = { bold: true };
        regnoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.headerBg } };
        regnoCell.alignment = { horizontal: "center", vertical: "middle" };

        const nameCell = headerRow.getCell(col + 1);
        nameCell.value = "Student's Name";
        nameCell.font = { bold: true };
        nameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.headerBg } };
        nameCell.alignment = { horizontal: "center", vertical: "middle" };

        col += 2;
      });

      sheet.views = [{ state: "frozen", ySplit: 3 }];

      const students = await sequelize.query(
        `SELECT
           sc.regno,
           COALESCE(u.userName, sd.studentName) AS studentName,
           sc.sectionId
         FROM StudentCourse sc
         JOIN student_details sd ON sd.registerNumber = sc.regno
         LEFT JOIN users u ON u.userNumber = sd.registerNumber
         WHERE sc.courseId = :courseId
         ORDER BY sc.sectionId, sc.regno`,
        {
          replacements: { courseId: subject.courseId },
          type: sequelize.QueryTypes.SELECT,
        }
      );

      const studentsBySection = new Map();
      sections.forEach((s) => studentsBySection.set(s.sectionId, []));
      students.forEach((st) => {
        const bucket = studentsBySection.get(st.sectionId);
        if (bucket) bucket.push(st);
      });

      const maxRows = Math.max(...[...studentsBySection.values()].map((arr) => arr.length), 0);

      for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
        const dataRow = sheet.addRow([]);
        col = 1;
        sections.forEach((sec) => {
          const student = studentsBySection.get(sec.sectionId)?.[rowIdx];
          if (student) {
            dataRow.getCell(col).value = student.regno;
            dataRow.getCell(col + 1).value = student.studentName || "—";
          }
          col += 2;
        });
      }

      // Column widths
      col = 1;
      sections.forEach(() => {
        sheet.getColumn(col).width = 14;
        sheet.getColumn(col + 1).width = 36;
        col += 2;
      });

      // Border top region (rows 1..3)
      for (let r = 1; r <= 3; r++) {
        for (let c = 1; c <= totalColumns; c++) {
          sheet.getCell(r, c).border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        }
      }
    }

    const tempDir = path.join(process.cwd(), "temp", "cbcs");
    await fs.mkdir(tempDir, { recursive: true });

    const fileName = `CBCS_Allocation_${cbcs_id}.xlsx`;
    const filePath = path.join(tempDir, fileName);
    await workbook.xlsx.writeFile(filePath);

    return res.download(filePath, fileName, async (err) => {
      if (err) console.error("Download error:", err);
      try {
        await fs.unlink(filePath);
      } catch (cleanupErr) {
        console.error("Cleanup failed:", cleanupErr);
      }
    });
  } catch (err) {
    console.error("downloadCbcsExcel error:", err);
    return res.status(500).json({ success: false, error: "Failed to generate Excel" });
  }
};

export const manualFinalizeCbcs = async (req, res) => {
  try {
    await finalizeAndOptimizeAllocation(req.params.id, 1);
    res.json({ success: true, message: "Finalized" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


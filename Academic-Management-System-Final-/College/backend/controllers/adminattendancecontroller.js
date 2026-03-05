// attendancecontroller.js
import { Op } from 'sequelize';
import db from '../models/index.js';
import { sendAbsentAttendanceEmails } from '../services/attendanceNotificationService.js';

const { 
  sequelize, 
  Timetable, 
  Course, 
  Section, 
  Department, 
  Semester, 
  Batch, 
  StaffCourse,
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

async function getInternalAdminUser(authUser) {
  if (!authUser) throw new Error("Unauthorized");

  if (authUser.userId) {
    const user = await User.findByPk(authUser.userId);
    if (user) return user;
  }

  if (authUser.id) {
    const user = await User.findByPk(authUser.id);
    if (user) return user;
  }

  if (authUser.userNumber) {
    const user = await User.findOne({ where: { userNumber: authUser.userNumber } });
    if (user) return user;
  }

  throw new Error("Admin user not found");
}

/**
 * GET TIMETABLE ADMIN
 * Replaces the complex JOIN query with Sequelize include logic
 */
export async function getTimetableAdmin(req, res, next) {
  try {
    const { startDate, endDate, degree, batch, branch, departmentId, semesterId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ status: "error", message: "Start and end dates required" });
    }
    if (!degree || !batch || !branch || !departmentId || !semesterId) {
      return res.status(400).json({
        status: "error",
        message: "Degree, batch, branch, departmentId, and semesterId are required",
      });
    }

    const periods = await Timetable.findAll({
      where: {
        departmentId: departmentId,
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
            departmentId: p.departmentId,
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
    const { date = new Date().toISOString().split("T")[0], departmentId: queryDeptId, semesterId: querySemesterId, batch: queryBatch } = req.query;
    const authDeptId = req.user.departmentId || null;
    const safeSectionId = Number.isNaN(parseInt(sectionId, 10)) ? null : parseInt(sectionId, 10);
    const normalizedDeptId = parseInt(queryDeptId, 10);
    const normalizedSemesterId = parseInt(querySemesterId, 10);

    const course = await Course.findByPk(courseId);
    if (!course) {
      return res.status(404).json({ status: "error", message: "Course not found" });
    }

    const isElective = ["OEC", "PEC"].includes((course.category || "").trim().toUpperCase());
    const requestedCourseId = parseInt(courseId, 10);
    const effectiveDeptId = Number.isNaN(normalizedDeptId) ? authDeptId : normalizedDeptId;
    const effectiveSemesterId = Number.isNaN(normalizedSemesterId) ? course.semesterId : normalizedSemesterId;
    let targetCourseIds = [requestedCourseId];

    if (isElective) {
      const relatedCourses = await Course.findAll({
        attributes: ["courseId"],
        where: {
          isActive: 'YES',
          semesterId: course.semesterId,
          [Op.or]: [
            { courseCode: course.courseCode },
            { courseTitle: course.courseTitle }
          ]
        }
      });
      const relatedIds = relatedCourses.map((c) => c.courseId);
      targetCourseIds = [...new Set([requestedCourseId, ...relatedIds])];
    }

    let studentData = [];
    const sectionStaffMap = new Map();

    const buildSectionStaffMap = async (courseIds, sectionIdFilter = null) => {
      if (!Array.isArray(courseIds) || courseIds.length === 0) return;

      const allocations = await StaffCourse.findAll({
        where: {
          courseId: { [Op.in]: courseIds },
          ...(sectionIdFilter ? { sectionId: sectionIdFilter } : {}),
        },
        include: [
          { model: User, required: false, attributes: ["userName"] },
        ],
        attributes: ["courseId", "sectionId", "Userid"],
      });

      for (const row of allocations) {
        const key = `${row.courseId}-${row.sectionId}`;
        if (!sectionStaffMap.has(key)) {
          sectionStaffMap.set(key, row.User?.userName || `Staff ${row.Userid}`);
        }
      }
    };

    if (isElective) {
      await buildSectionStaffMap(targetCourseIds, safeSectionId || null);

      const students = await StudentCourse.findAll({
        where: {
          courseId: { [Op.in]: targetCourseIds },
          ...(safeSectionId ? { sectionId: safeSectionId } : {})
        },
        include: [
          {
            model: StudentDetails,
            required: true,
            on: { regno: sequelize.where(sequelize.col('StudentCourse.regno'), '=', sequelize.col('StudentDetail.registerNumber')) },
            where: {
              ...(effectiveDeptId ? { departmentId: effectiveDeptId } : {}),
              ...(effectiveSemesterId ? { semester: effectiveSemesterId } : {}),
              ...(queryBatch ? { batch: queryBatch } : {})
            },
            attributes: ['registerNumber', 'studentName']
          },
          {
            model: Section,
            required: false,
            attributes: ['sectionName']
          }
        ],
        order: [[sequelize.col('StudentDetail.registerNumber'), 'ASC']]
      });

      studentData = await Promise.all(students.map(async (sc) => {
        const attendance = await PeriodAttendance.findOne({
          where: {
            regno: sc.regno,
            courseId: sc.courseId,
            sectionId: sc.sectionId,
            dayOfWeek: dayOfWeek,
            periodNumber: periodNumber,
            attendanceDate: date
          }
        });

        return {
          rollnumber: sc.regno,
          name: sc.StudentDetail?.studentName || 'Unknown',
          status: attendance ? attendance.status : '',
          sectionId: sc.sectionId,
          sectionName: sc.Section?.sectionName,
          courseId: sc.courseId,
          staffName: sectionStaffMap.get(`${sc.courseId}-${sc.sectionId}`) || "Not Assigned"
        };
      }));
    } else {
      await buildSectionStaffMap([requestedCourseId], safeSectionId || null);
      const enrollments = await StudentCourse.findAll({
        where: {
          courseId: requestedCourseId,
          ...(safeSectionId ? { sectionId: safeSectionId } : {})
        },
        include: [
          {
            model: StudentDetails,
            required: true,
            on: { regno: sequelize.where(sequelize.col('StudentCourse.regno'), '=', sequelize.col('StudentDetail.registerNumber')) },
            where: {
              ...(effectiveDeptId ? { departmentId: effectiveDeptId } : {}),
              ...(effectiveSemesterId ? { semester: effectiveSemesterId } : {}),
              ...(queryBatch ? { batch: queryBatch } : {})
            },
            attributes: ["registerNumber", "studentName", "section"]
          },
          {
            model: Section,
            required: false,
            attributes: ["sectionId", "sectionName"]
          }
        ],
        order: [[sequelize.col('StudentDetail.registerNumber'), 'ASC']]
      });

      studentData = await Promise.all(enrollments.map(async (enrollment) => {
        const attendance = await PeriodAttendance.findOne({
          where: {
            regno: enrollment.regno,
            courseId: requestedCourseId,
            ...(enrollment.sectionId ? { sectionId: enrollment.sectionId } : {}),
            dayOfWeek: dayOfWeek,
            periodNumber: periodNumber,
            attendanceDate: date
          }
        });

        return {
          rollnumber: enrollment.regno,
          name: enrollment.StudentDetail?.studentName || "Unknown",
          status: attendance ? attendance.status : "",
          sectionId: enrollment.sectionId || safeSectionId || null,
          sectionName: enrollment.Section?.sectionName || enrollment.StudentDetail?.section || null,
          courseId: requestedCourseId,
          staffName:
            sectionStaffMap.get(
              `${requestedCourseId}-${enrollment.sectionId || safeSectionId || ""}`
            ) || "Not Assigned"
        };
      }));
    }

    res.json({
      status: "success",
      data: studentData,
      meta: { isElective, mappedCourses: targetCourseIds }
    });
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
    const { courseId, sectionId, dayOfWeek, periodNumber } = req.params;
    const { date, attendances, fullDay = false, departmentId: bodyDeptId, semesterId: bodySemesterId } = req.body;
    const adminUser = await getInternalAdminUser(req.user);
    const adminUserId = adminUser.userId;
    const deptId = adminUser.departmentId || 1;
    const safeSectionId = Number.isNaN(parseInt(sectionId, 10)) ? null : parseInt(sectionId, 10);

    if (!Array.isArray(attendances) || attendances.length === 0) {
      await t.rollback();
      return res.status(400).json({ status: "error", message: "No attendance data provided" });
    }

    const requestedCourseId = parseInt(courseId, 10);
    const requestedCourseInfo = await Course.findOne({
      where: { courseId: requestedCourseId },
      include: [{ model: Semester, required: true }]
    });

    if (!requestedCourseInfo) {
      throw new Error("Course not found or invalid semester information");
    }
    const requestedIsElective = ["OEC", "PEC"].includes((requestedCourseInfo.category || "").trim().toUpperCase());

    const normalizedDeptId = parseInt(bodyDeptId, 10);
    let effectiveDeptId = Number.isNaN(normalizedDeptId) ? adminUser.departmentId : normalizedDeptId;

    if (!effectiveDeptId) {
      const slot = await Timetable.findOne({
        where: {
          courseId: requestedCourseId,
          dayOfWeek: dayOfWeek,
          periodNumber: periodNumber,
          isActive: "YES",
          ...(safeSectionId ? { sectionId: safeSectionId } : {})
        },
        attributes: ["departmentId"]
      });
      effectiveDeptId = slot?.departmentId || null;
    }

    if (effectiveDeptId) {
      const deptExists = await Department.findByPk(effectiveDeptId);
      if (!deptExists) {
        throw new Error(`Invalid departmentId ${effectiveDeptId}. Department not found.`);
      }
    } else {
      throw new Error("Unable to resolve departmentId for attendance save. Please select a valid department.");
    }

    const normalizedSemesterId = parseInt(bodySemesterId, 10);
    const effectiveSemesterId = Number.isNaN(normalizedSemesterId)
      ? requestedCourseInfo.semesterId
      : normalizedSemesterId;

    let fullDaySlots = [];
    if (fullDay) {
      fullDaySlots = await Timetable.findAll({
        where: {
          departmentId: effectiveDeptId,
          semesterId: effectiveSemesterId,
          dayOfWeek: dayOfWeek,
          isActive: "YES",
          courseId: { [Op.ne]: null }
        },
        attributes: ["courseId", "sectionId", "periodNumber"],
        include: [{
          model: Course,
          required: false,
          attributes: ["courseId", "category"]
        }],
        order: [["periodNumber", "ASC"]]
      });

      if (fullDaySlots.length === 0) {
        throw new Error(`No timetable slots found for ${dayOfWeek} in selected department/semester`);
      }
    }

    const slotCourseIds = fullDay ? fullDaySlots.map((slot) => parseInt(slot.courseId, 10)) : [];

    const uniqueAttendanceCourseIds = [
      ...new Set(
        attendances
          .map((att) => parseInt(att.courseId, 10))
          .filter((id) => !Number.isNaN(id))
      ),
      ...slotCourseIds,
      requestedCourseId
    ];

    const courseRows = await Course.findAll({
      where: { courseId: { [Op.in]: uniqueAttendanceCourseIds } },
      include: [{ model: Semester, required: true }]
    });

    const semesterNumberByCourseId = new Map(
      courseRows.map((c) => [c.courseId, c.Semester?.semesterNumber])
    );

    const processedStudents = [];
    const skippedStudents = [];
    const absentEntries = [];

    for (const att of attendances) {
      if (!att.rollnumber || !["P", "A", "OD"].includes(att.status)) {
        skippedStudents.push({ rollnumber: att.rollnumber, reason: "Invalid status" });
        continue;
      }

      const attendanceCourseId = parseInt(att.courseId, 10);
      const effectiveCourseId = Number.isNaN(attendanceCourseId)
        ? requestedCourseId
        : attendanceCourseId;

      if (fullDay) {
        const studentCourses = await StudentCourse.findAll({
          where: {
            regno: att.rollnumber,
            courseId: { [Op.in]: slotCourseIds }
          }
        });

        let upsertedCount = 0;
        for (const slot of fullDaySlots) {
          const matchedCourse = studentCourses.find((sc) => {
            const sectionMatches = slot.sectionId ? sc.sectionId === slot.sectionId : true;
            return sc.courseId === slot.courseId && sectionMatches;
          });
          const slotCategory = (slot.Course?.category || "").trim().toUpperCase();
          const slotIsElective = ["OEC", "PEC"].includes(slotCategory);

          const resolvedCourseId = matchedCourse ? matchedCourse.courseId : slot.courseId;
          const resolvedSectionId = matchedCourse
            ? matchedCourse.sectionId
            : (slot.sectionId || safeSectionId);

          if (!matchedCourse && slotIsElective) continue;
          if (!resolvedSectionId) continue;

          await PeriodAttendance.upsert({
            regno: att.rollnumber,
            staffId: adminUserId,
            courseId: resolvedCourseId,
            sectionId: resolvedSectionId,
            semesterNumber: semesterNumberByCourseId.get(resolvedCourseId) || requestedCourseInfo.Semester.semesterNumber,
            dayOfWeek: dayOfWeek,
            periodNumber: slot.periodNumber,
            attendanceDate: date,
            status: att.status,
            departmentId: effectiveDeptId,
            updatedBy: "admin"
          }, { transaction: t });

          if (att.status === "A") {
            absentEntries.push({
              rollnumber: att.rollnumber,
              status: att.status,
              courseId: resolvedCourseId,
              sectionId: resolvedSectionId,
              periodNumber: Number(slot.periodNumber),
              date,
            });
          }
          upsertedCount += 1;
        }

        if (upsertedCount === 0) {
          skippedStudents.push({ rollnumber: att.rollnumber, reason: "No matching section/course for day slots" });
          continue;
        }

        processedStudents.push({ rollnumber: att.rollnumber, status: att.status, periodsUpdated: upsertedCount });
      } else {
        const studentCourse = await StudentCourse.findOne({
          where: { regno: att.rollnumber, courseId: effectiveCourseId }
        });

        if (!studentCourse && requestedIsElective) {
          skippedStudents.push({ rollnumber: att.rollnumber, reason: "Not enrolled" });
          continue;
        }
        let resolvedSectionId = studentCourse?.sectionId || safeSectionId;
        if (!resolvedSectionId) {
          // Core-course fallback: derive section from student profile section name.
          const studentProfile = await StudentDetails.findOne({
            where: { registerNumber: att.rollnumber },
            attributes: ["section"]
          });

          const sectionName = (studentProfile?.section || "").trim().toLowerCase();
          if (sectionName) {
            const sectionRows = await Section.findAll({
              where: { courseId: effectiveCourseId },
              attributes: ["sectionId", "sectionName"]
            });
            const match = sectionRows.find(
              (row) => (row.sectionName || "").trim().toLowerCase() === sectionName
            );
            resolvedSectionId = match?.sectionId || null;
          }
        }

        if (!resolvedSectionId) {
          // Timetable fallback for this exact slot.
          const slot = await Timetable.findOne({
            where: {
              courseId: effectiveCourseId,
              dayOfWeek: dayOfWeek,
              periodNumber: periodNumber,
              departmentId: effectiveDeptId,
              semesterId: effectiveSemesterId,
              isActive: "YES",
              sectionId: { [Op.ne]: null }
            },
            attributes: ["sectionId"]
          });
          resolvedSectionId = slot?.sectionId || null;
        }

        if (!resolvedSectionId) {
          // Last fallback: first active section for the course.
          const firstSection = await Section.findOne({
            where: {
              courseId: effectiveCourseId,
              isActive: "YES"
            },
            attributes: ["sectionId"],
            order: [["sectionId", "ASC"]]
          });
          resolvedSectionId = firstSection?.sectionId || null;
        }

        if (!resolvedSectionId) {
          const existsSectionAtAll = await Section.count({
            where: { courseId: effectiveCourseId }
          });
          if (!existsSectionAtAll) {
            skippedStudents.push({ rollnumber: att.rollnumber, reason: "No sections configured for course" });
            continue;
          }
        }

        if (!resolvedSectionId) {
          skippedStudents.push({ rollnumber: att.rollnumber, reason: "Section not found" });
          continue;
        }

        // Sequelize Upsert (Insert or Update on Duplicate Key)
        // Note: Requires a composite unique index in your database on
        // (regno, courseId, periodNumber, attendanceDate)
        await PeriodAttendance.upsert({
          regno: att.rollnumber,
          staffId: adminUserId,
          courseId: effectiveCourseId,
          sectionId: resolvedSectionId,
          semesterNumber: semesterNumberByCourseId.get(effectiveCourseId) || requestedCourseInfo.Semester.semesterNumber,
          dayOfWeek: dayOfWeek,
          periodNumber: periodNumber,
          attendanceDate: date,
          status: att.status,
          departmentId: effectiveDeptId,
          updatedBy: "admin"
        }, { transaction: t });

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
        processedStudents.push({ rollnumber: att.rollnumber, status: att.status });
      }
    }

    await t.commit();
    sendAbsentAttendanceEmails({
      absentEntries,
      markedByName: adminUser.userName || "Admin",
      markedByEmail: adminUser.userMail || "",
    }).catch((emailErr) => {
      console.error("Absent email notification failed:", emailErr.message);
    });

    const skippedReasons = skippedStudents.reduce((acc, row) => {
      const key = row.reason || "Unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    res.json({
      status: "success",
      message: fullDay
        ? `Updated ${processedStudents.length} students for full-day periods.`
        : `Updated ${processedStudents.length} records.`,
      data: {
        processedCount: processedStudents.length,
        skippedCount: skippedStudents.length,
        skippedReasons,
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
  const { batch, semesterId, departmentId } = req.query;

  try {
    const students = await StudentDetails.findAll({
      where: {
        departmentId: departmentId,
        batch: batch,
        semester: semesterId
      },
      attributes: [
        ['registerNumber', 'rollnumber'],
        ['studentName', 'name'],
        ['section', 'section']
      ],
      order: [['registerNumber', 'ASC']]
    });

    const formattedStudents = students.map(s => ({
      rollnumber: s.get('rollnumber'),
      name: s.get('name') || 'Unknown',
      section: s.get('section') || null
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
    const { startDate, students, departmentId, semesterId, batch } = req.body;
    const adminUser = await getInternalAdminUser(req.user);
    const adminUserId = adminUser.userId;

    if (!students || students.length === 0) {
      await t.rollback();
      return res.status(400).json({ status: "error", message: "No students selected" });
    }

    const dayOfWeek = new Date(startDate)
      .toLocaleDateString("en-US", { weekday: "short" })
      .toUpperCase();

    // Finding timetable slots for the specific group
    const timetableSlots = await Timetable.findAll({
      where: {
        departmentId: departmentId,
        dayOfWeek: dayOfWeek,
        semesterId: semesterId,
        isActive: 'YES',
        courseId: { [Op.ne]: null }
      },
      include: [{
        model: Course,
        required: false,
        attributes: ['courseId', 'category']
      }]
    });

    if (timetableSlots.length === 0) {
      await t.rollback();
      return res.status(404).json({
        status: "error",
        message: `No classes found in timetable for Batch ${batch}, Dept ${departmentId} on ${dayOfWeek}.`,
      });
    }

    const sectionCache = new Map();

    for (const student of students) {
      for (const slot of timetableSlots) {
        let resolvedSectionId = slot.sectionId || null;
        if (!resolvedSectionId && student.section) {
          const cacheKey = `${slot.courseId}::${student.section}`;
          if (!sectionCache.has(cacheKey)) {
            const sec = await Section.findOne({
              where: { courseId: slot.courseId, sectionName: student.section },
              attributes: ['sectionId']
            });
            sectionCache.set(cacheKey, sec?.sectionId || null);
          }
          resolvedSectionId = sectionCache.get(cacheKey);
        }

        if (!resolvedSectionId) resolvedSectionId = 1;

        await PeriodAttendance.upsert({
          regno: student.rollnumber,
          staffId: adminUserId,
          courseId: slot.courseId,
          sectionId: resolvedSectionId,
          semesterNumber: semesterId,
          dayOfWeek: dayOfWeek,
          periodNumber: slot.periodNumber,
          attendanceDate: startDate,
          status: "OD",
          departmentId: departmentId,
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
    const { date, departmentId, semesterId } = req.query;

    if (!dayOfWeek || !periodNumber || !date || !departmentId || !semesterId) {
      return res.status(400).json({ 
        status: "error", 
        message: "Missing required params: dayOfWeek, periodNumber, date, departmentId, semesterId" 
      });
    }

    const students = await StudentDetails.findAll({
      where: {
        departmentId: departmentId,
        semester: semesterId
      },
      attributes: ['registerNumber', 'studentName'],
      include: [
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
        name: s.studentName || 'Unknown',
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


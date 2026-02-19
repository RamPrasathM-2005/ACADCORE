import db from "../models/index.js";
import catchAsync from "../utils/catchAsync.js";
import { Op } from "sequelize";

const {
  sequelize,
  User,
  StudentDetails,
  Department,
  Batch,
  StudentCourse,
  Course,
  Section,
  StaffCourse,
  StudentElectiveSelection,
  Semester
} = db;

export const searchStudents = catchAsync(async (req, res) => {
  const { branch, batch, semesterNumber } = req.query;

  // 1. Fetch Students
  const users = await User.findAll({
    where: { status: 'Active', roleId: 1 },
    attributes: ['userId', 'userName', 'userNumber'],
    include: [{
      model: StudentDetails,
      as: 'studentProfile',
      required: true,
      where: {
        pending: true,
        ...(batch && { batch }),
        ...(semesterNumber && { semester: semesterNumber })
      },
      include: [
        {
          model: Department,
          as: 'department',
          where: branch ? { Deptacronym: branch } : {},
          attributes: ['Deptacronym']
        },
        {
          model: StudentCourse,
          include: [
            { model: Course, attributes: ['courseCode'] },
            { model: Section, attributes: ['sectionName'] }
          ]
        },
        {
          model: StudentElectiveSelection,
          where: { status: 'allocated' },
          required: false
        }
      ]
    }]
  });

  // 2. Fetch Courses and Flatten Sections into "batches"
  const rawCourses = await Course.findAll({
    where: { isActive: 'YES' },
    include: [
      {
        model: Semester,
        where: { isActive: 'YES', ...(semesterNumber && { semesterNumber }) },
        include: [{ model: Batch, where: { isActive: 'YES', ...(batch && { batch }) } }]
      },
      {
        model: Section,
        where: { isActive: 'YES' }, // Only show active sections
        include: [{
          model: StaffCourse,
          include: [{ model: User, attributes: ['userName'] }]
        }]
      }
    ]
  });

  // TRANSFORM DATA FOR FRONTEND
  
  // 3. Format Students: Include staffId in enrolledCourses so dropdown selects correctly
  const formattedStudents = await Promise.all(users.map(async (u) => {
    const s = u.studentProfile;
    
    const enrolledCourses = await Promise.all((s.StudentCourses || []).map(async (sc) => {
      // Find the staff assigned to this specific student's section
      const staffAlloc = await StaffCourse.findOne({
        where: { courseId: sc.courseId, sectionId: sc.sectionId },
        attributes: ['Userid']
      });

      return {
        courseId: sc.courseId,
        courseCode: sc.Course?.courseCode,
        sectionId: sc.sectionId,
        sectionName: sc.Section?.sectionName,
        staffId: staffAlloc ? staffAlloc.Userid : null // This allows dropdown to show selected staff
      };
    }));

    return {
      rollnumber: u.userNumber,
      name: u.userName,
      batch: s.batch,
      semester: `Semester ${s.semester}`,
      enrolledCourses,
      selectedElectiveIds: (s.StudentElectiveSelections || []).map(ses => String(ses.selectedCourseId))
    };
  }));

  // 4. Format Courses: Flatten "Sections" into "batches" for the React Map
  const formattedCourses = rawCourses.map(course => {
    const courseJson = course.toJSON();
    return {
      ...courseJson,
      // Map "Sections" to "batches" as expected by ManageStudents.js
      batches: (courseJson.Sections || []).map(section => {
        const staffItem = section.StaffCourses?.[0]; // Get first assigned staff
        return {
          sectionId: section.sectionId,
          sectionName: section.sectionName,
          staffId: staffItem ? staffItem.Userid : null,
          staffName: staffItem?.User?.userName || "Not Assigned",
          capacity: section.capacity
        };
      })
    };
  });

  res.status(200).json({
    status: 'success',
    studentsData: formattedStudents,
    coursesData: formattedCourses
  });
});

export const enrollStudentInCourse = catchAsync(async (req, res) => {
  const { rollnumber, courseId, sectionName, Userid } = req.body;
  const adminName = req.user?.userName || 'admin';

  const transaction = await sequelize.transaction();

  try {
    const section = await Section.findOne({
      where: { courseId, sectionName, isActive: 'YES' },
      transaction
    });
    if (!section) throw new Error("Section not found for this course");

    // Upsert Enrollment
    const [enrollment, created] = await StudentCourse.findOrCreate({
      where: { regno: rollnumber, courseId },
      defaults: {
        sectionId: section.sectionId,
        createdBy: adminName,
        updatedBy: adminName
      },
      transaction
    });

    if (!created) {
      await enrollment.update({ sectionId: section.sectionId, updatedBy: adminName }, { transaction });
    }

    // Optional Staff Mapping
    if (Userid) {
      await StaffCourse.findOrCreate({
        where: { Userid, courseId, sectionId: section.sectionId },
        defaults: { Deptid: req.user.departmentId || 1, createdBy: adminName },
        transaction
      });
    }

    await transaction.commit();
    res.status(201).json({ status: "success", message: "Enrollment updated" });
  } catch (err) {
    await transaction.rollback();
    res.status(400).json({ status: "failure", message: err.message });
  }
});

export const unenrollStudentFromCourse = catchAsync(async (req, res) => {
  const { rollnumber, courseId } = req.body;
  const deleted = await StudentCourse.destroy({
    where: { regno: rollnumber, courseId }
  });
  if (!deleted) return res.status(404).json({ status: "failure", message: "Enrollment record not found" });
  res.status(200).json({ status: "success", message: "Student unenrolled" });
});

export const updateStudentBatch = catchAsync(async (req, res) => {
  const { rollnumber } = req.params;
  const { batch, semesterNumber } = req.body;

  const [updated] = await StudentDetails.update(
    { batch, semester: semesterNumber },
    { where: { registerNumber: rollnumber } }
  );

  if (updated === 0) return res.status(404).json({ status: "failure", message: "Student not found" });
  res.status(200).json({ status: "success", message: "Batch and Semester updated" });
});

export const getAvailableCoursesForBatch = catchAsync(async (req, res) => {
  const { batch, semesterNumber } = req.params;

  const courses = await Course.findAll({
    where: { isActive: 'YES' },
    attributes: {
      include: [
        [
          sequelize.literal(`(
            SELECT COUNT(*) 
            FROM StudentCourse 
            WHERE StudentCourse.courseId = Course.courseId
          )`),
          'enrolledCount'
        ]
      ]
    },
    include: [
      { 
        model: Semester, 
        where: { semesterNumber, isActive: 'YES' },
        include: [{ model: Batch, where: { batch: batch } }]
      },
      { 
        model: Section, 
        include: [{ model: StaffCourse, include: [{ model: User, attributes: ['userName'] }] }] 
      }
    ]
  });

  res.status(200).json({ status: "success", data: courses });
});

export const getAvailableCourses = catchAsync(async (req, res) => {
    const { semesterNumber } = req.params;
    const courses = await Course.findAll({
        include: [{ model: Semester, where: { semesterNumber, isActive: 'YES' } }],
        where: { isActive: 'YES' }
    });
    res.status(200).json({ status: "success", data: courses });
});
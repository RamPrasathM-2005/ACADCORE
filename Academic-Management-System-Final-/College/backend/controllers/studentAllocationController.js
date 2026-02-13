// controllers/studentAllocationController.js
import db from "../models/index.js";
import catchAsync from "../utils/catchAsync.js";
import { Op } from "sequelize";

const {
  sequelize,
  User,
  StudentDetails,
  DepartmentAcademic,
  Batch,
  StudentCourse,
  Course,
  Section,
  StaffCourse,
  StudentElectiveSelection,
  Semester,
  ElectiveBucket
} = db;

export const searchStudents = catchAsync(async (req, res) => {
  const { degree, branch, batch, semesterNumber } = req.query;

  // 1. Fetch Students with deep associations
  const students = await StudentDetails.findAll({
    where: {
      pending: true, // Matches "pending = 1" from original
      ...(batch && { batch }),
      ...(semesterNumber && { semester: semesterNumber })
    },
    include: [
      {
        model: User,
        as: 'userAccount',
        where: { status: 'Active' },
        attributes: ['userId', 'userName']
      },
      {
        model: DepartmentAcademic,
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
        required: false,
        attributes: ['selectedCourseId']
      }
    ]
  });

  // 2. Fetch Available Courses for the batch/semester to provide context to the UI
  const availableCourses = await Course.findAll({
    where: { isActive: 'YES' },
    include: [
      {
        model: Semester,
        where: { 
            isActive: 'YES',
            ...(semesterNumber && { semesterNumber })
        },
        include: [{ 
            model: Batch, 
            where: { 
                isActive: 'YES',
                ...(degree && { degree }),
                ...(branch && { branch }),
                ...(batch && { batch })
            } 
        }]
      },
      {
        model: Section,
        where: { isActive: 'YES' },
        include: [{
          model: StaffCourse,
          include: [{ model: User, attributes: ['userName'] }]
        }]
      }
    ]
  });

  // 3. Format the data for the frontend
  const formattedStudents = students.map(s => ({
    rollnumber: s.registerNumber,
    name: s.userAccount?.userName,
    batch: s.batch,
    semester: `Semester ${s.semester}`,
    enrolledCourses: s.StudentCourses.map(sc => ({
      courseId: sc.courseId,
      courseCode: sc.Course?.courseCode,
      sectionId: sc.sectionId,
      sectionName: sc.Section?.sectionName,
    })),
    selectedElectiveIds: s.StudentElectiveSelections.map(ses => String(ses.selectedCourseId))
  }));

  res.status(200).json({
    status: 'success',
    studentsData: formattedStudents,
    coursesData: availableCourses
  });
});

export const getAvailableCourses = catchAsync(async (req, res) => {
  const { semesterNumber } = req.params;
  const user = req.user; // From auth middleware

  const whereCondition = { isActive: 'YES' };
  
  // Logic for students: Filter by their Elective Selections
  if (user.role === 'student') {
    const student = await StudentDetails.findOne({ where: { [Op.or]: [{ registerNumber: user.userNumber }, { studentId: user.id }] } });
    const selections = await StudentElectiveSelection.findAll({
      where: { regno: student.registerNumber, status: 'allocated' },
      attributes: ['selectedCourseId']
    });
    const selectedIds = selections.map(s => s.selectedCourseId);

    whereCondition[Op.and] = [
      {
        [Op.or]: [
          { category: { [Op.notIn]: ['PEC', 'OEC'] } },
          { courseId: { [Op.in]: selectedIds } }
        ]
      }
    ];
  }

  const courses = await Course.findAll({
    where: whereCondition,
    include: [
      { model: Semester, where: { semesterNumber } },
      { model: Section, where: { isActive: 'YES' } }
    ]
  });

  res.status(200).json({ status: "success", data: courses });
});

export const enrollStudentInCourse = catchAsync(async (req, res) => {
  const { rollnumber, courseId, sectionName, Userid } = req.body;
  const userName = req.user?.userName || 'admin';

  const transaction = await sequelize.transaction();

  try {
    // 1. Fetch Section
    const section = await Section.findOne({
      where: { courseId, sectionName, isActive: 'YES' },
      transaction
    });
    if (!section) throw new Error("Section not found");

    // 2. Handle Enrollment (Upsert)
    const [enrollment, created] = await StudentCourse.findOrCreate({
      where: { regno: rollnumber, courseId },
      defaults: {
        sectionId: section.sectionId,
        createdBy: userName,
        updatedBy: userName
      },
      transaction
    });

    if (!created && enrollment.sectionId !== section.sectionId) {
      await enrollment.update({ sectionId: section.sectionId, updatedBy: userName }, { transaction });
    }

    // 3. Optional: Map Staff if provided
    if (Userid) {
      const staff = await User.findByPk(Userid, { transaction });
      if (staff) {
        await StaffCourse.findOrCreate({
          where: { Userid, courseId, sectionId: section.sectionId },
          defaults: { Deptid: staff.departmentId, createdBy: userName },
          transaction
        });
      }
    }

    await transaction.commit();
    res.status(201).json({ status: "success", message: "Enrollment processed" });
  } catch (err) {
    await transaction.rollback();
    res.status(400).json({ status: "failure", message: err.message });
  }
});

export const updateStudentBatch = catchAsync(async (req, res) => {
  const { rollnumber } = req.params;
  const { batch, semesterNumber } = req.body;
  const userName = req.user?.userName || 'admin';

  const [updated] = await StudentDetails.update(
    { batch, semester: semesterNumber, updatedBy: userName },
    { where: { registerNumber: rollnumber } }
  );

  if (updated === 0) return res.status(404).json({ status: "failure", message: "Student not found" });
  res.status(200).json({ status: "success", message: "Batch updated" });
});

export const getAvailableCoursesForBatch = catchAsync(async (req, res) => {
  const { batchId, semesterNumber } = req.params;

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
        where: { batchId, semesterNumber, isActive: 'YES' } 
      },
      { 
        model: Section, 
        where: { isActive: 'YES' },
        include: [{
            model: StaffCourse,
            include: [{ model: User, attributes: ['userName'] }]
        }]
      }
    ]
  });

  res.status(200).json({ status: "success", data: courses });
});

export const unenrollStudentFromCourse = catchAsync(async (req, res) => {
  const { rollnumber, courseId } = req.body;

  const deleted = await StudentCourse.destroy({
    where: { regno: rollnumber, courseId }
  });

  if (!deleted) return res.status(404).json({ status: "failure", message: "Enrollment not found" });
  res.status(200).json({ status: "success", message: "Student unenrolled" });
});
import db from "../models/index.js";
import catchAsync from "../utils/catchAsync.js";
import { Op } from "sequelize";

const {
  StudentDetails,
  StudentCourse,
  Course,
  Semester,
  Batch,
  Regulation,
  Department,
} = db;

export const getStudentCourseMatrix = catchAsync(async (req, res) => {
  const { dept, batch, semester, search } = req.query;

  if (!dept || !batch || !semester) {
    return res.status(400).json({
      status: "failure",
      message: "dept, batch, and semester are required",
    });
  }

  const deptId = parseInt(dept, 10);
  const semesterNumber = parseInt(semester, 10);
  const batchValue = String(batch);

  const deptRecord = await Department.findByPk(deptId, {
    attributes: ["departmentId", "Deptacronym", "Deptname"],
  });

  if (!deptRecord) {
    return res.status(400).json({ status: "failure", message: "Invalid department" });
  }

  // 1) Courses offered in the given semester + batch + department branch
  const courses = await Course.findAll({
    where: { isActive: "YES" },
    attributes: ["courseId", "courseCode", "courseTitle"],
    include: [
      {
        model: Semester,
        required: true,
        where: { semesterNumber },
        attributes: [],
        include: [
          {
            model: Batch,
            required: true,
            where: {
              branch: deptRecord.Deptacronym,
              batch: batchValue,
            },
            attributes: [],
            include: [
              {
                model: Regulation,
                required: false,
                where: { departmentId: deptId },
                attributes: [],
              },
            ],
          },
        ],
      },
    ],
    order: [["courseCode", "ASC"]],
  });

  const courseIds = courses.map((c) => c.courseId);

  // 2) Students for the given filters
  const studentWhere = {
    departmentId: deptId,
    batch: parseInt(batch, 10),
    semester: String(semesterNumber),
  };

  if (search) {
    const term = String(search).trim();
    if (term) {
      studentWhere[Op.or] = [
        { registerNumber: { [Op.like]: `%${term}%` } },
        { studentName: { [Op.like]: `%${term}%` } },
      ];
    }
  }

  const students = await StudentDetails.findAll({
    where: studentWhere,
    attributes: ["registerNumber", "studentName"],
    order: [["registerNumber", "ASC"]],
  });

  const regnos = students.map((s) => s.registerNumber);

  // 3) Enrollments for those students and courses
  const enrollments =
    regnos.length > 0 && courseIds.length > 0
      ? await StudentCourse.findAll({
          where: {
            regno: { [Op.in]: regnos },
            courseId: { [Op.in]: courseIds },
          },
          attributes: ["regno", "courseId"],
        })
      : [];

  res.status(200).json({
    status: "success",
    data: {
      courses,
      students: students.map((s) => ({
        regno: s.registerNumber,
        name: s.studentName,
      })),
      enrollments,
    },
  });
});



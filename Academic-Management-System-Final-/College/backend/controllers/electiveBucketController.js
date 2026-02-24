import db from "../models/index.js";
import catchAsync from "../utils/catchAsync.js";
import { Op } from "sequelize";

const {
  sequelize,
  ElectiveBucket,
  ElectiveBucketCourse,
  Course,
  Semester,
  Batch,
  RegulationCourse,
  VerticalCourse,
  Vertical,
} = db;

export const getElectiveBuckets = catchAsync(async (req, res) => {
  const { semesterId } = req.params;

  const buckets = await ElectiveBucket.findAll({
    where: { semesterId },
    attributes: ["bucketId", "bucketNumber", "bucketName"],
    include: [
      {
        model: ElectiveBucketCourse,
        include: [
          {
            model: Course,
            where: { isActive: "YES" },
            required: false,
            attributes: ["courseCode", "courseTitle"],
            include: [
              {
                model: Semester,
                attributes: ["semesterNumber"],
                include: [
                  {
                    model: Batch,
                    attributes: ["regulationId"],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  // Since the original SQL used complex LEFT JOINS on RegulationCourse/Vertical, 
  // we perform a map to clean up the data structure and handle the vertical lookups
  const formattedBuckets = await Promise.all(
    buckets.map(async (bucket) => {
      const bucketJson = bucket.toJSON();
      const courses = await Promise.all(
        (bucketJson.ElectiveBucketCourses || []).map(async (ebc) => {
          const course = ebc.Course;
          if (!course) return null;

          // Manual lookup for Vertical info to mimic the complex original SQL join
          const verticalInfo = await VerticalCourse.findOne({
            include: [
              {
                model: RegulationCourse,
                where: {
                  courseCode: course.courseCode,
                  semesterNumber: course.Semester.semesterNumber,
                  regulationId: course.Semester.Batch.regulationId,
                },
              },
              { model: Vertical },
            ],
          });

          return {
            courseCode: course.courseCode,
            courseTitle: course.courseTitle,
            verticalId: verticalInfo?.verticalId || null,
            verticalName: verticalInfo?.Vertical?.verticalName || null,
          };
        })
      );

      return {
        bucketId: bucketJson.bucketId,
        bucketNumber: bucketJson.bucketNumber,
        bucketName: bucketJson.bucketName,
        courses: courses.filter((c) => c !== null),
      };
    })
  );

  res.status(200).json({ status: "success", data: formattedBuckets });
});

export const createElectiveBucket = catchAsync(async (req, res) => {
  const { semesterId } = req.params;

  // 1. Verify semester exists
  const semExists = await Semester.findByPk(semesterId);
  if (!semExists) {
    return res.status(404).json({ status: "error", message: "Semester not found" });
  }

  // 2. Auto-increment bucket number
  const maxNum = await ElectiveBucket.max("bucketNumber", { where: { semesterId } });
  const bucketNumber = (maxNum || 0) + 1;

  const bucket = await ElectiveBucket.create({
    semesterId,
    bucketNumber,
    bucketName: `Elective Bucket ${bucketNumber}`,
    createdBy: req.user.userId, // Matches your Sequelize User model (userId)
  });

  res.status(201).json({
    status: "success",
    bucketId: bucket.bucketId,
    bucketNumber,
  });
});

export const updateElectiveBucketName = catchAsync(async (req, res) => {
  const { bucketId } = req.params;
  const { bucketName } = req.body;

  if (!bucketName || !bucketName.trim()) {
    return res.status(400).json({ status: "failure", message: "Bucket name cannot be empty" });
  }

  const [updated] = await ElectiveBucket.update(
    { bucketName: bucketName.trim() },
    { where: { bucketId } }
  );

  if (updated === 0) {
    return res.status(404).json({ status: "failure", message: "Bucket not found" });
  }

  res.status(200).json({ status: "success", message: "Bucket name updated successfully" });
});

export const addCoursesToBucket = catchAsync(async (req, res) => {
  const { bucketId } = req.params;
  const { courseCodes } = req.body;

  if (!Array.isArray(courseCodes) || courseCodes.length === 0) {
    return res.status(400).json({ status: "failure", message: "courseCodes must be a non-empty array" });
  }

  const transaction = await sequelize.transaction();
  try {
    const bucket = await ElectiveBucket.findByPk(bucketId, {
      include: [
        {
          model: Semester,
          attributes: ["semesterId", "semesterNumber"],
          include: [{ model: Batch, attributes: ["batchId", "regulationId"] }],
        },
      ],
      transaction,
    });

    if (!bucket) {
      throw new Error(`Bucket with ID ${bucketId} not found`);
    }
    if (!bucket.Semester || !bucket.Semester.Batch?.regulationId) {
      throw new Error(`Invalid semester/batch mapping for bucket ${bucketId}`);
    }

    const bucketSemesterId = bucket.semesterId;
    const bucketSemesterNumber = bucket.Semester.semesterNumber;
    const regulationId = bucket.Semester.Batch.regulationId;

    const errors = [];
    const addedCourses = [];

    for (const inputCode of courseCodes) {
      const courseCode = String(inputCode || "").trim();
      if (!courseCode) continue;

      // 1. Try to find active course already available in this semester
      let course = await Course.findOne({
        where: {
          courseCode,
          semesterId: bucketSemesterId,
          isActive: "YES",
        },
        transaction,
      });

      if (!course) {
        // 2. If missing, derive from RegulationCourse for this regulation and semester
        const regCourse = await RegulationCourse.findOne({
          where: {
            regulationId,
            courseCode,
            category: { [Op.in]: ["PEC", "OEC"] },
            isActive: "YES",
            [Op.or]: [
              { semesterNumber: bucketSemesterNumber }, // semester-specific elective
              { semesterNumber: null }, // global elective
            ],
          },
          order: [
            [sequelize.literal(`CASE WHEN semesterNumber = ${Number(bucketSemesterNumber)} THEN 0 ELSE 1 END`), "ASC"],
          ],
          transaction,
        });

        if (!regCourse) {
          errors.push(`Course ${courseCode} not found in regulation electives for this semester.`);
          continue;
        }

        const [createdOrFound] = await Course.findOrCreate({
          where: { courseCode: regCourse.courseCode, semesterId: bucketSemesterId },
          defaults: {
            courseTitle: regCourse.courseTitle,
            category: regCourse.category,
            type: regCourse.type,
            lectureHours: regCourse.lectureHours,
            tutorialHours: regCourse.tutorialHours,
            practicalHours: regCourse.practicalHours,
            experientialHours: regCourse.experientialHours,
            totalContactPeriods: regCourse.totalContactPeriods,
            credits: regCourse.credits,
            minMark: regCourse.minMark,
            maxMark: regCourse.maxMark,
            createdBy: req.user?.userName || "system-auto",
            updatedBy: req.user?.userName || "system-auto",
          },
          transaction,
        });
        course = createdOrFound;
      }

      // 3. Check if assigned to another bucket in this semester
      const otherBucket = await ElectiveBucketCourse.findOne({
        where: { bucketId: { [Op.ne]: bucketId } },
        include: [{
          model: Course,
          where: { courseCode, semesterId: bucketSemesterId }
        }],
        transaction
      });

      if (otherBucket) {
        errors.push(`Course ${courseCode} is already assigned to another bucket.`);
        continue;
      }

      // 4. Add to bucket (findOrCreate to prevent duplicates)
      await ElectiveBucketCourse.findOrCreate({
        where: { bucketId: Number(bucketId), courseId: course.courseId },
        transaction,
      });

      addedCourses.push(courseCode);
    }

    await transaction.commit();
    res.status(200).json({
      status: "success",
      addedCount: addedCourses.length,
      addedCourses,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ status: "failure", message: err.message });
  }
});

export const removeCourseFromBucket = catchAsync(async (req, res) => {
  const { bucketId, courseCode } = req.params;

  const course = await Course.findOne({ where: { courseCode } });
  if (!course) {
    return res.status(404).json({ status: "failure", message: "Course not found" });
  }

  const deleted = await ElectiveBucketCourse.destroy({
    where: { bucketId, courseId: course.courseId }
  });

  if (!deleted) {
    return res.status(404).json({ status: "failure", message: "Course not found in bucket" });
  }

  res.status(200).json({ status: "success", message: "Course removed from bucket" });
});

export const deleteElectiveBucket = catchAsync(async (req, res) => {
  const { bucketId } = req.params;

  // If you set up onDelete: 'CASCADE' in associations, you only need to destroy the bucket
  // Otherwise, Sequelize handles the children if you use hooks: true
  const deleted = await ElectiveBucket.destroy({ where: { bucketId } });

  if (!deleted) {
    return res.status(404).json({ status: "failure", message: "Bucket not found" });
  }

  res.status(200).json({ status: "success", message: "Bucket deleted successfully" });
});

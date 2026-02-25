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
  User,
  StudentDetails,
  Department,
  StudentElectiveSelection,
} = db;

const getCurrentUserId = (req) => req.user?.id || req.user?.userId;
const RESELECTION_KEY = "electiveReselectionRequests";

const readReselectionRequests = (messages) => {
  if (!messages || typeof messages !== "object") return [];
  const list = messages[RESELECTION_KEY];
  return Array.isArray(list) ? list : [];
};

const writeReselectionRequests = async (student, requests, updatedBy = null) => {
  const currentMessages = (student.messages && typeof student.messages === "object") ? student.messages : {};
  const nextMessages = { ...currentMessages };
  if (Array.isArray(requests) && requests.length > 0) {
    nextMessages[RESELECTION_KEY] = requests;
  } else {
    delete nextMessages[RESELECTION_KEY];
  }
  await StudentDetails.update(
    {
      messages: nextMessages,
      ...(updatedBy ? { updatedBy } : {}),
    },
    { where: { studentId: student.studentId } }
  );
  await student.reload();
};

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

export const requestElectiveReselection = catchAsync(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  const { semesterId, reason } = req.body;
  if (!semesterId) {
    return res.status(400).json({ status: "failure", message: "semesterId is required" });
  }

  const user = await User.findByPk(userId, { include: [{ model: StudentDetails, as: "studentProfile" }] });
  if (!user?.studentProfile) {
    return res.status(404).json({ status: "failure", message: "Student profile not found" });
  }

  const regno = user.studentProfile.registerNumber;
  const allocated = await StudentElectiveSelection.findAll({
    where: { regno, status: "allocated" },
    include: [{ model: ElectiveBucket, attributes: ["semesterId"] }]
  });
  const hasFinalized = allocated.some((s) => Number(s.ElectiveBucket?.semesterId) === Number(semesterId));
  if (!hasFinalized) {
    return res.status(400).json({ status: "failure", message: "No finalized elective submission found for this semester" });
  }

  const requests = readReselectionRequests(user.studentProfile.messages);
  const latest = [...requests]
    .filter((r) => Number(r.semesterId) === Number(semesterId))
    .sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0))[0];

  if (latest && ["pending", "approved"].includes(latest.status)) {
    return res.status(400).json({ status: "failure", message: "A reselection request is already in progress for this semester" });
  }

  const request = {
    requestId: "ERS-" + Date.now() + "-" + Math.floor(Math.random() * 1000000),
    semesterId: Number(semesterId),
    reason: (reason || "").trim() || null,
    status: "pending",
    open: false,
    requestedAt: new Date().toISOString(),
    processedAt: null,
    processedBy: null,
    adminRemarks: null
  };

  requests.push(request);
  await writeReselectionRequests(user.studentProfile, requests, userId);

  res.status(200).json({ status: "success", message: "Reselection request submitted", data: request });
});

export const getElectiveReselectionRequestsForAdmin = catchAsync(async (req, res) => {
  const { status } = req.query;

  const students = await StudentDetails.findAll({
    include: [
      { model: Department, as: "department", attributes: ["Deptname", "Deptacronym"] },
      { model: User, as: "user", attributes: ["userId", "userName", "userMail"] }
    ],
    attributes: ["studentId", "studentName", "registerNumber", "semester", "batch", "messages"]
  });

  const rows = [];
  for (const s of students) {
    const requests = readReselectionRequests(s.messages);
    for (const r of requests) {
      rows.push({
        requestId: r.requestId,
        status: r.status,
        open: !!r.open,
        semesterId: r.semesterId,
        reason: r.reason,
        requestedAt: r.requestedAt,
        processedAt: r.processedAt,
        processedBy: r.processedBy,
        adminRemarks: r.adminRemarks,
        student: {
          studentId: s.studentId,
          registerNumber: s.registerNumber,
          studentName: s.studentName,
          batch: s.batch,
          semester: s.semester,
          department: s.department?.Deptname || null,
          departmentAcronym: s.department?.Deptacronym || null,
          email: s.user?.userMail || null
        }
      });
    }
  }

  const dedupedMap = new Map();
  const statusPriority = {
    approved: 4,
    completed: 3,
    rejected: 2,
    pending: 1
  };
  for (const row of rows) {
    const normalizedRequestId = String(row.requestId || "").trim();
    const key = `${row.student.registerNumber}:${normalizedRequestId}`;
    const prev = dedupedMap.get(key);
    if (!prev) {
      dedupedMap.set(key, { ...row, requestId: normalizedRequestId });
      continue;
    }

    const prevStatusScore = statusPriority[String(prev.status || "").toLowerCase()] || 0;
    const curStatusScore = statusPriority[String(row.status || "").toLowerCase()] || 0;
    const prevProcTs = new Date(prev.processedAt || 0).getTime();
    const curProcTs = new Date(row.processedAt || 0).getTime();
    const prevReqTs = new Date(prev.requestedAt || 0).getTime();
    const curReqTs = new Date(row.requestedAt || 0).getTime();

    const shouldReplace =
      curStatusScore > prevStatusScore ||
      (curStatusScore === prevStatusScore && curProcTs > prevProcTs) ||
      (curStatusScore === prevStatusScore && curProcTs === prevProcTs && curReqTs >= prevReqTs);

    if (shouldReplace) {
      dedupedMap.set(key, { ...row, requestId: normalizedRequestId });
    }
  }

  const dedupedRows = Array.from(dedupedMap.values());
  const filtered = (status && status !== "all")
    ? dedupedRows.filter((r) => r.status === status)
    : dedupedRows;

  filtered.sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0));
  res.status(200).json({ status: "success", data: filtered });
});

export const handleElectiveReselectionRequest = catchAsync(async (req, res) => {
  const adminUserId = getCurrentUserId(req);
  if (!adminUserId) {
    return res.status(401).json({ status: "failure", message: "User not authenticated" });
  }

  const { regno, requestId } = req.params;
  const normalizedParamRequestId = String(requestId || "").trim();
  const { action, remarks } = req.body;
  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ status: "failure", message: "action must be approve or reject" });
  }

  const student = await StudentDetails.findOne({ where: { registerNumber: regno } });
  if (!student) {
    return res.status(404).json({ status: "failure", message: "Student not found" });
  }

  const requests = readReselectionRequests(student.messages);
  const matchingIndexes = requests
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => String(r.requestId || "").trim() === normalizedParamRequestId)
    .map(({ i }) => i);

  if (matchingIndexes.length === 0) {
    return res.status(404).json({ status: "failure", message: "Request not found" });
  }
  const pendingIndexes = matchingIndexes.filter((i) => requests[i].status === "pending");
  if (pendingIndexes.length === 0) {
    return res.status(400).json({ status: "failure", message: "Only pending requests can be processed" });
  }

  for (const idx of pendingIndexes) {
    requests[idx] = {
      ...requests[idx],
      status: action === "approve" ? "approved" : "rejected",
      open: action === "approve",
      processedAt: new Date().toISOString(),
      processedBy: adminUserId,
      adminRemarks: (remarks || "").trim() || null
    };
  }

  await writeReselectionRequests(student, requests, adminUserId);

  const persistedRequests = readReselectionRequests(student.messages);
  const persistedUpdated = persistedRequests.find(
    (r) => String(r.requestId || "").trim() === normalizedParamRequestId
  );
  if (!persistedUpdated || persistedUpdated.status !== (action === "approve" ? "approved" : "rejected")) {
    return res.status(500).json({
      status: "failure",
      message: "Request action could not be persisted to database"
    });
  }

  const updatedRequest = persistedUpdated;
  res.status(200).json({
    status: "success",
    message: action === "approve"
      ? "Reselection approved. Student can now reselect for this semester."
      : "Reselection request rejected.",
    data: updatedRequest
  });
});

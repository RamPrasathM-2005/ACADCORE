import models from '../models/index.js';
const { 
  sequelize, Course, Semester, Batch, Regulation, 
  CourseRequest, StaffCourse, User, Section, Department, AppSetting
} = models;
import { Op } from 'sequelize';
import catchAsync from '../utils/catchAsync.js';

const COURSE_REQUEST_WINDOW_KEY = 'COURSE_REQUEST_WINDOW_OPEN';

const isAdminRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  return normalized === 'admin' || normalized === 'super admin' || normalized === 'superadmin';
};

const getCourseRequestWindowState = async () => {
  try {
    const row = await AppSetting.findByPk(COURSE_REQUEST_WINDOW_KEY, {
      attributes: ['key', 'value']
    });
    // Default is locked unless explicitly opened by admin.
    return row?.value === 'true';
  } catch (err) {
    // If settings table is unavailable, stay safe by treating window as locked.
    return false;
  }
};

// Helper to normalize JWT payload vs DB fields.
const getUserContext = async (req) => {
  const userId = req.user?.userId || req.user?.id || null;
  if (!userId) return { userId: null, departmentId: null, userNumber: null };

  let departmentId = req.user?.departmentId ?? null;
  let userNumber = req.user?.userNumber ?? null;

  if (departmentId && userNumber) {
    return { userId, departmentId, userNumber };
  }

  const user = await User.findByPk(userId, {
    attributes: ['userId', 'departmentId', 'userNumber']
  });

  return {
    userId,
    departmentId: departmentId ?? user?.departmentId ?? null,
    userNumber: userNumber ?? user?.userNumber ?? String(userId)
  };
};

// 1. Get Available Courses
export const getAvailableCoursesForStaff = catchAsync(async (req, res) => {
  const { semester, branch, batch, type, dept } = req.query;
  
  const { userId, departmentId: staffDeptId } = await getUserContext(req);
  if (!userId) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }
  const deptId = dept ? parseInt(dept) : staffDeptId;
  if (!deptId) {
    return res.status(400).json({ status: 'error', message: 'Staff department not found' });
  }

  const deptRecord = await Department.findByPk(deptId, {
    attributes: ['departmentId', 'Deptacronym']
  });
  if (!deptRecord) {
    return res.status(400).json({ status: 'error', message: 'Invalid department' });
  }
  const branchFilter = branch || deptRecord.Deptacronym;

  const courses = await Course.findAll({
    where: {
      isActive: 'YES',
      // CHANGE 2: 'Userid' is the column in StaffCourse model, 'userId' is the value
      courseId: {
        [Op.notIn]: sequelize.literal(`(SELECT courseId FROM StaffCourse WHERE Userid = ${userId})`)
      },
      ...(type && { type })
    },
    include: [{
      model: Semester,
      required: true,
      where: semester ? { semesterNumber: parseInt(semester) } : {},
      include: [{
        model: Batch,
        required: true,
        where: {
          ...(branchFilter && { branch: branchFilter }),
          ...(batch && { batch })
        },
        include: [{
          model: Regulation,
          required: false,
          // CHANGE 3: Regulation model uses 'departmentId', User uses 'departmentId'
          where: { departmentId: deptId } 
        }]
      }]
    }],
    order: [['courseCode', 'ASC']]
  });

  res.json({ status: 'success', data: courses });
});

// 2. Get All Courses with Status Labels
export const getAllCoursesForStaff = catchAsync(async (req, res) => {
  const { semester, branch, batch, type, dept } = req.query;
  const { userId, departmentId: staffDeptId } = await getUserContext(req);
  if (!userId) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }
  const deptId = dept ? parseInt(dept) : staffDeptId;
  if (!deptId) {
    return res.status(400).json({ status: 'error', message: 'Staff department not found' });
  }

  const deptRecord = await Department.findByPk(deptId, {
    attributes: ['departmentId', 'Deptacronym']
  });
  if (!deptRecord) {
    return res.status(400).json({ status: 'error', message: 'Invalid department' });
  }
  const branchFilter = branch || deptRecord.Deptacronym;

  const courses = await Course.findAll({
    attributes: {
      include: [
        [
          // CHANGE 4: Updated SQL literals to use proper camelCase 'userId' value
          sequelize.literal(`(
            CASE 
              WHEN EXISTS (SELECT 1 FROM StaffCourse sc WHERE sc.courseId = Course.courseId AND sc.Userid = ${userId}) THEN 'ALLOCATED'
              WHEN EXISTS (SELECT 1 FROM CourseRequest cr WHERE cr.courseId = Course.courseId AND cr.staffId = ${userId} AND cr.status = 'PENDING') THEN 'PENDING'
              WHEN EXISTS (SELECT 1 FROM CourseRequest cr WHERE cr.courseId = Course.courseId AND cr.staffId = ${userId} AND cr.status = 'REJECTED') THEN 'REJECTED'
              ELSE 'AVAILABLE'
            END
          )`), 'status'
        ],
        [
          sequelize.literal(`(
            CASE 
              WHEN EXISTS (SELECT 1 FROM StaffCourse sc WHERE sc.courseId = Course.courseId AND sc.Userid = ${userId}) THEN 
                (SELECT sc2.staffCourseId FROM StaffCourse sc2 WHERE sc2.courseId = Course.courseId AND sc2.Userid = ${userId} LIMIT 1)
              WHEN EXISTS (SELECT 1 FROM CourseRequest cr WHERE cr.courseId = Course.courseId AND cr.staffId = ${userId} AND cr.status = 'PENDING') THEN 
                (SELECT cr2.requestId FROM CourseRequest cr2 WHERE cr2.courseId = Course.courseId AND cr2.staffId = ${userId} AND cr2.status = 'PENDING' LIMIT 1)
              WHEN EXISTS (SELECT 1 FROM CourseRequest cr WHERE cr.courseId = Course.courseId AND cr.staffId = ${userId} AND cr.status = 'REJECTED') THEN 
                (SELECT cr2.requestId FROM CourseRequest cr2 WHERE cr2.courseId = Course.courseId AND cr2.staffId = ${userId} AND cr2.status = 'REJECTED' LIMIT 1)
              ELSE NULL 
            END
          )`), 'actionId'
        ]
      ]
    },
    where: {
      isActive: 'YES',
      ...(type && { type })
    },
    include: [{
      model: Semester,
      required: true,
      where: semester ? { semesterNumber: parseInt(semester) } : {},
      include: [{
        model: Batch,
        required: true,
        where: {
          ...(branchFilter && { branch: branchFilter }),
          ...(batch && { batch })
        },
        include: [{
          model: Regulation,
          required: false,
          where: { departmentId: deptId }
        }]
      }]
    }],
    order: [['courseCode', 'ASC']]
  });

  res.json({ status: 'success', data: courses });
});

// 3. Send Course Request
export const sendCourseRequest = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const { userId, departmentId: staffDeptId, userNumber } = await getUserContext(req);
  if (!userId) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }
  if (!staffDeptId) {
    return res.status(400).json({ status: 'error', message: 'Staff department not found' });
  }

  const isWindowOpen = await getCourseRequestWindowState();
  if (!isWindowOpen) {
    return res.status(423).json({
      status: 'error',
      message: 'Course request is currently locked by admin. Please try after it is enabled.'
    });
  }

  const course = await Course.findByPk(courseId, {
    include: [{
      model: Semester,
      include: [{ model: Batch, include: [Regulation] }]
    }]
  });

  // CHANGE 5: Verify Regulation.departmentId matches User.departmentId
  if (!course || course.Semester.Batch.Regulation.departmentId !== staffDeptId) {
    return res.status(403).json({ status: 'error', message: 'Cannot request course outside your department' });
  }

  const existing = await CourseRequest.findOne({ where: { staffId: userId, courseId } });
  if (existing) {
    if (existing.status === 'PENDING') return res.status(400).json({ status: 'error', message: 'Request already pending' });
    if (existing.status === 'ACCEPTED') return res.status(400).json({ status: 'error', message: 'Already assigned to this course' });
    await existing.destroy();
  }

  await CourseRequest.create({
    staffId: userId,
    courseId,
    createdBy: userNumber // Using userNumber (cset01) for audit
  });

  res.json({ status: 'success', message: 'Request sent successfully' });
});

// 4. Cancel Pending Request
export const cancelCourseRequest = catchAsync(async (req, res) => {
  const { requestId } = req.params;
  const { userId } = await getUserContext(req);
  if (!userId) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }

  const deleted = await CourseRequest.destroy({
    where: { requestId, staffId: userId, status: 'PENDING' }
  });

  if (!deleted) return res.status(404).json({ status: 'error', message: 'Pending request not found' });
  res.json({ status: 'success', message: 'Request cancelled successfully' });
});

// 5. Recent Request History
export const getRecentRequestHistory = catchAsync(async (req, res) => {
  const { userId } = await getUserContext(req);
  if (!userId) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }
  const history = await CourseRequest.findAll({
    where: { staffId: userId },
    include: [{
      model: Course,
      include: [{ model: Semester, include: [Batch] }]
    }],
    order: [['requestedAt', 'DESC']],
    limit: 5
  });
  res.json({ status: 'success', data: history });
});

// 6. Resend Rejected Request
export const resendRejectedRequest = catchAsync(async (req, res) => {
  const { requestId } = req.params;
  const { userId, userNumber } = await getUserContext(req);
  if (!userId) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }

  const isWindowOpen = await getCourseRequestWindowState();
  if (!isWindowOpen) {
    return res.status(423).json({
      status: 'error',
      message: 'Course request is currently locked by admin. Please try after it is enabled.'
    });
  }

  const request = await CourseRequest.findOne({
    where: { requestId, staffId: userId, status: 'REJECTED' }
  });

  if (!request) return res.status(404).json({ status: 'error', message: 'Rejected request not found' });

  await request.update({
    status: 'PENDING',
    rejectedAt: null,
    updatedBy: userNumber
  });

  res.json({ status: 'success', message: 'Request resent successfully' });
});

// 7. Get Pending Requests (For Admin)
export const getPendingRequestsForAdmin = catchAsync(async (req, res) => {
  const { semester, branch, dept, batch, type } = req.query;

  const requests = await CourseRequest.findAll({
    where: { status: 'PENDING' },
    include: [
      { model: User, attributes: ['userId', 'userName', 'userMail', 'userNumber'] },
      { 
        model: Course, 
        where: type ? { type } : {},
        include: [{ 
          model: Semester, 
          where: semester ? { semesterNumber: semester } : {},
          include: [{ 
            model: Batch,
            where: {
              ...(branch && { branch }),
              ...(batch && { batch })
            },
            include: [{ 
              model: Regulation, 
              // Filter by Department ID if provided
              where: dept ? { departmentId: dept } : {},
              include: [Department] 
            }]
          }]
        }]
      }
    ],
    attributes: {
      include: [
        [sequelize.literal(`(SELECT COUNT(*) FROM StaffCourse WHERE courseId = Course.courseId)`), 'assignedCount'],
        [sequelize.literal(`(SELECT COUNT(*) FROM Section WHERE courseId = Course.courseId AND isActive = 'YES')`), 'sectionCount']
      ]
    },
    order: [['requestedAt', 'DESC']]
  });

  res.json({ status: 'success', data: requests });
});

// 8. Accept Course Request
export const acceptCourseRequest = catchAsync(async (req, res) => {
  const { requestId } = req.params;
  const { userNumber } = await getUserContext(req);

  await sequelize.transaction(async (t) => {
    const request = await CourseRequest.findOne({
      where: { requestId, status: 'PENDING' },
      transaction: t
    });

    if (!request) throw new Error('Pending request not found');

    const courseId = request.courseId;
    const staffId = request.staffId; // This is actually the userId

    // Find available sections (not yet in StaffCourse for this course)
    const availableSection = await Section.findOne({
      where: {
        courseId,
        isActive: 'YES',
        sectionId: {
          [Op.notIn]: sequelize.literal(`(SELECT sectionId FROM StaffCourse WHERE courseId = ${courseId})`)
        }
      },
      transaction: t
    });

    if (!availableSection) throw new Error('No available sections left for this course.');

    // 1. Accept this request
    await request.update({
      status: 'ACCEPTED',
      approvedAt: new Date(),
      updatedBy: userNumber
    }, { transaction: t });

    // 2. Insert into StaffCourse
    // Get staff's department ID from User table to fill departmentId
    const staffUser = await User.findByPk(staffId, { transaction: t });
    
    await StaffCourse.create({
      Userid: staffId, // Mapping userId to Userid
      courseId,
      sectionId: availableSection.sectionId,
      departmentId: staffUser.departmentId, // Mapping departmentId to departmentId
      createdBy: userNumber
    }, { transaction: t });

    // 3. Auto-reject others if course is now full
    const remainingSections = await Section.count({
      where: {
        courseId,
        isActive: 'YES',
        sectionId: { [Op.notIn]: sequelize.literal(`(SELECT sectionId FROM StaffCourse WHERE courseId = ${courseId})`) }
      },
      transaction: t
    });

    if (remainingSections === 0) {
      await CourseRequest.update({
        status: 'REJECTED',
        rejectedAt: new Date(),
        updatedBy: userNumber
      }, {
        where: { courseId, status: 'PENDING', requestId: { [Op.ne]: requestId } },
        transaction: t
      });
    }
  });

  res.json({ status: 'success', message: 'Request accepted and staff assigned to section' });
});

// 9. Reject Course Request
export const rejectCourseRequest = catchAsync(async (req, res) => {
  const { requestId } = req.params;
  const { userNumber } = await getUserContext(req);

  const updated = await CourseRequest.update({
    status: 'REJECTED',
    rejectedAt: new Date(),
    updatedBy: userNumber
  }, {
    where: { requestId, status: 'PENDING' }
  });

  if (updated[0] === 0) return res.status(404).json({ status: 'error', message: 'Pending request not found' });
  res.json({ status: 'success', message: 'Request rejected' });
});

// 10. Leave Course
export const leaveCourse = catchAsync(async (req, res) => {
  const { staffCourseId } = req.params;
  const { userId, userNumber } = await getUserContext(req);
  if (!userId) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }

  await sequelize.transaction(async (t) => {
    // CHANGE 6: Matching 'Userid' column with 'userId' value
    const assignment = await StaffCourse.findOne({
      where: { staffCourseId, Userid: userId },
      transaction: t
    });

    if (!assignment) throw new Error('Assignment not found');

    // Mark Request as WITHDRAWN
    await CourseRequest.update({
      status: 'WITHDRAWN',
      withdrawnAt: new Date(),
      updatedBy: userNumber
    }, {
      where: { staffId: userId, courseId: assignment.courseId, status: 'ACCEPTED' },
      transaction: t
    });

    // Delete Assignment
    await assignment.destroy({ transaction: t });
  });

  res.json({ status: 'success', message: 'Left course successfully' });
});

// 11. My Requests
export const getMyRequests = catchAsync(async (req, res) => {
  const { userId } = await getUserContext(req);
  if (!userId) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }

  const requests = await CourseRequest.findAll({
    where: { staffId: userId, status: { [Op.in]: ['PENDING', 'ACCEPTED', 'REJECTED'] } },
    include: [{
      model: Course,
      include: [{ model: Semester, include: [Batch] }]
    }],
    attributes: {
      include: [
        [
          sequelize.literal(`(
            CASE 
              WHEN status = 'ACCEPTED' THEN (SELECT sc.staffCourseId FROM StaffCourse sc WHERE sc.courseId = Course.courseId AND sc.Userid = ${userId} LIMIT 1)
              ELSE requestId 
            END
          )`), 'actionId'
        ]
      ]
    },
    order: [['requestedAt', 'DESC']]
  });

  res.json({ status: 'success', data: requests });
});

// 12. Notifications
export const getNotifications = catchAsync(async (req, res) => {
  const { userId } = await getUserContext(req);
  if (!userId) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }
  const notifications = await CourseRequest.findAll({
    where: {
      staffId: userId,
      status: { [Op.in]: ['ACCEPTED', 'REJECTED'] }
    },
    include: [{ model: Course, attributes: ['courseTitle', 'courseCode'] }],
    attributes: [
      'requestId', 'status',
      [sequelize.fn('COALESCE', sequelize.col('approvedAt'), sequelize.col('rejectedAt')), 'timestamp']
    ],
    order: [[sequelize.literal('timestamp'), 'DESC']],
    limit: 10
  });

  res.json({ status: 'success', data: notifications });
});

// 13. Get course request window status
export const getCourseRequestWindowStatus = catchAsync(async (req, res) => {
  const isOpen = await getCourseRequestWindowState();
  res.json({ status: 'success', data: { isOpen } });
});

// 14. Admin toggles course request window
export const setCourseRequestWindowStatus = catchAsync(async (req, res) => {
  if (!isAdminRole(req.user?.role)) {
    return res.status(403).json({ status: 'error', message: 'Only admin can change request lock status' });
  }

  const { isOpen } = req.body || {};
  if (typeof isOpen !== 'boolean') {
    return res.status(400).json({ status: 'error', message: 'isOpen (boolean) is required' });
  }

  const actor = req.user?.userNumber || req.user?.id || req.user?.userId || 'admin';
  await AppSetting.upsert({
    key: COURSE_REQUEST_WINDOW_KEY,
    value: isOpen ? 'true' : 'false',
    createdBy: String(actor),
    updatedBy: String(actor),
  });

  res.json({
    status: 'success',
    message: isOpen ? 'Course request unlocked for staff' : 'Course request locked for staff',
    data: { isOpen }
  });
});


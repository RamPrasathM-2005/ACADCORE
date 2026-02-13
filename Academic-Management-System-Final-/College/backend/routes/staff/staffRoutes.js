import express from 'express';
import {
  getCoursePartitions,
  saveCoursePartitions,
  updateCoursePartitions,
  getCOsForCourse,
  getToolsForCO,
  createTool,
  saveToolsForCO,
  updateTool,
  deleteTool,
  getStudentMarksForTool,
  saveStudentMarksForTool,
  importMarksForTool,
  exportCoWiseCsv,
  exportCourseWiseCsv,
  getStudentsForCourse,
  getMyCourses,
  getStudentsForSection,
  updateStudentCOMarkByCoId,
  getStudentCOMarks
} from '../../controllers/markController.js';

import {
  getAvailableCoursesForStaff,
  sendCourseRequest,
  cancelCourseRequest,
  leaveCourse,
  getMyRequests,
  getPendingRequestsForAdmin,
  acceptCourseRequest,
  rejectCourseRequest,
  getAllCoursesForStaff,
  getRecentRequestHistory,
  resendRejectedRequest,
  getNotifications,
} from '../../controllers/requestCourseController.js';

// FIXED IMPORT: Changed 'protect' to 'requireAuth'
import { requireAuth } from '../../middleware/requireAuth.js';
import upload from '../../Uploads/upload.js';

const router = express.Router();

/* =========================
📌 Marks & Course Management
========================= */
router.get('/courses', requireAuth, getMyCourses);
router.get('/partitions/:courseCode', requireAuth, getCoursePartitions);
router.post('/partitions/:courseCode', requireAuth, saveCoursePartitions);
router.put('/partitions/:courseCode', requireAuth, updateCoursePartitions);
router.get('/cos/:courseCode', requireAuth, getCOsForCourse);
router.get('/tools/:coId', requireAuth, getToolsForCO);
router.post('/tools/:coId', requireAuth, createTool);
router.post('/tools/:coId/save', requireAuth, saveToolsForCO);
router.put('/tools/:toolId', requireAuth, updateTool);
router.delete('/tools/:toolId', requireAuth, deleteTool);
router.put('/marks/co/:regno/:coId', requireAuth, updateStudentCOMarkByCoId);
router.get('/marks/:toolId', requireAuth, getStudentMarksForTool);
router.post('/marks/:toolId', requireAuth, saveStudentMarksForTool);
router.post('/marks/:toolId/import', requireAuth, upload.single('file'), importMarksForTool);
router.get('/export/co/:coId', requireAuth, exportCoWiseCsv);
router.get('/export/course/:courseCode', requireAuth, exportCourseWiseCsv);
router.get('/students/:courseCode', requireAuth, getStudentsForCourse);
router.get('/students/:courseCode/section/:sectionId', requireAuth, getStudentsForSection);
router.get('/marks/co/:courseCode', requireAuth, getStudentCOMarks);

/* =========================
📌 Course Requests & Staff Actions
========================= */
router.get('/available-courses', requireAuth, getAvailableCoursesForStaff);
router.get('/all-courses', requireAuth, getAllCoursesForStaff); 
router.get('/my-requests', requireAuth, getMyRequests);
router.get('/recent-history', requireAuth, getRecentRequestHistory); 
router.post('/request/:courseId', requireAuth, sendCourseRequest);
router.delete('/request/:requestId', requireAuth, cancelCourseRequest);
router.post('/resend/:requestId', requireAuth, resendRejectedRequest); 
router.delete('/leave/:staffCourseId', requireAuth, leaveCourse);
router.get('/pending-requests', requireAuth, getPendingRequestsForAdmin);
router.post('/accept/:requestId', requireAuth, acceptCourseRequest);
router.post('/reject/:requestId', requireAuth, rejectCourseRequest);
router.get('/notifications', requireAuth, getNotifications);

export default router;
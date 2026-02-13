import express from "express";
import {
  getBatches,
  getDepartments,
  getSemesters,
  getSubjectWiseAttendance,
  getUnmarkedAttendanceReport
} from "../../controllers/attendanceReportController.js";

// FIXED IMPORT: Changed 'protect' to 'requireAuth'
import { requireAuth } from "../../middleware/requireAuth.js";

const router = express.Router();

// FIXED: Protect all routes using requireAuth
router.use(requireAuth);

// Attendance report-specific routes
router.get("/batches", getBatches);
router.get("/departments/:batchId", getDepartments);
router.get("/semesters/:batchId/:departmentId", getSemesters);
router.get(
  "/subject-wise/:degree/:batchId/:departmentId/:semesterId",
  getSubjectWiseAttendance
);
router.get("/unmarked/:batchId/:semesterId", getUnmarkedAttendanceReport);

export default router;
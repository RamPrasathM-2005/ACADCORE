// adminAttendanceRoutes.js - Updated with consistent param names (:courseId for POST)
import express from "express";
import {
  getTimetableAdmin,
  getStudentsForPeriodAdmin,
  markAttendanceAdmin,
  markFullDayOD,
  getStudentsBySemester,
  getStudentsByDeptAndSem,
} from "../../controllers/adminattendancecontroller.js";

// FIXED IMPORT: Changed 'protect' to 'requireAuth'
import { requireAuth } from "../../middleware/requireAuth.js";

const router = express.Router();

// FIXED: Protect all routes using requireAuth middleware
router.use(requireAuth);

// Admin-specific routes
router.get("/timetable", getTimetableAdmin);

router.get(
  "/students/:courseId/all/:dayOfWeek/:periodNumber",
  getStudentsForPeriodAdmin
);

router.get(
  "/department-view/:dayOfWeek/:periodNumber", 
  getStudentsByDeptAndSem
);

router.get("/students-list",  getStudentsBySemester);
router.post("/mark-full-day-od",  markFullDayOD);
router.post(
  "/mark/:courseId/:sectionId/:dayOfWeek/:periodNumber",
  markAttendanceAdmin
);

export default router;
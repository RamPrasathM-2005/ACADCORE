// Updated staffattendanceroutes.js
import express from "express";
import {
  getTimetable,
  getStudentsForPeriod,
  markAttendance,
  getSkippedStudents,
} from "../../controllers/attendanceController.js";

// FIXED IMPORT: Changed 'protect' to 'requireAuth'
import { requireAuth } from "../../middleware/requireAuth.js";

const router = express.Router();

// FIXED: Protect all routes using requireAuth
router.use(requireAuth);

router.get("/timetable", getTimetable);
router.get(
  "/students/:courseId/:sectionId/:dayOfWeek/:periodNumber",
  getStudentsForPeriod
);
router.get(
  "/skipped/:courseId/:sectionId/:dayOfWeek/:periodNumber",
  getSkippedStudents
);
router.post(
  "/mark/:courseId/:sectionId/:dayOfWeek/:periodNumber",
  markAttendance
);

export default router;
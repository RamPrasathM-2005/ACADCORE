import express from "express";
import {
  getStudentDetails,
  getSemesters,
  getMandatoryCourses,
  getElectiveBuckets,
  allocateElectives,
  getStudentEnrolledCourses,
  getAttendanceSummary,
  getUserId,
  getElectiveSelections,
  getStudentAcademicIds
} from "../../controllers/studentpageController.js";

import {
  getNptelCourses,
  enrollNptel,
  getStudentNptelEnrollments,
  requestCreditTransfer,
  getOecPecProgress,
  studentNptelCreditDecision
} from "../../controllers/nptelStudentController.js";

import { getStudentGpaHistory } from "../../controllers/gradeController.js";

// FIXED IMPORT: Changed 'protect' to 'requireAuth'
import { requireAuth } from "../../middleware/requireAuth.js";

const router = express.Router();

// Base API: http://localhost:4000/api/student

// FIXED: Use requireAuth for all routes in this router
router.use(requireAuth); 

// Get authenticated user's Userid
router.get("/userid", getUserId);

// Get student profile details
router.get("/details", getStudentDetails);

// Get semesters for student's batch
router.get("/semesters", getSemesters);

// Course selection routes
router.get("/courses/mandatory", getMandatoryCourses);
router.get("/elective-buckets", getElectiveBuckets);
router.post("/allocate-electives", allocateElectives);

// Get enrolled courses (filtered by semester if provided)
router.get("/enrolled-courses", getStudentEnrolledCourses);

// Get attendance summary for a semester
router.get("/attendance-summary", getAttendanceSummary);

// FIXED: Changed protect to requireAuth
router.get('/elective-selections', requireAuth, getElectiveSelections);
router.get('/gpa-history', getStudentGpaHistory);
router.get('/academic-ids', getStudentAcademicIds);

/* =========================
📌 NPTEL Student Routes
========================= */
router.get("/nptel-courses", getNptelCourses);
router.post("/nptel-enroll", enrollNptel);
router.get("/nptel-enrollments", getStudentNptelEnrollments);
router.post("/nptel-credit-transfer", requestCreditTransfer);
router.get("/oec-pec-progress", getOecPecProgress);

// FIXED: Changed protect to requireAuth
router.post("/nptel-credit-decision", requireAuth, studentNptelCreditDecision);

export default router;
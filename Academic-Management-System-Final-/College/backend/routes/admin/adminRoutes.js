// Modified adminroutes.js
import express from "express";
import {
  addSemester,
  deleteSemester,
  getAllSemesters,
  getSemester,
  updateSemester,
  getSemestersByBatchBranch,
} from "../../controllers/semesterController.js";
import {
  addCourse,
  getAllCourse,
  getCourseBySemester,
  updateCourse,
  deleteCourse,
  importCourses,
} from "../../controllers/subjectController.js";
import {
  allocateStaffToCourse,
  allocateCourseToStaff,
  updateStaffAllocation,
  getStaffAllocationsByCourse,
  getCourseAllocationsByStaff,
  deleteStaffAllocation,
  getUsers,
  getCourseAllocationsByStaffEnhanced,
  updateStaffCourseBatch,
} from "../../controllers/staffCourseController.js";
import {
  searchStudents,
  getAvailableCourses,
  enrollStudentInCourse,
  updateStudentBatch,
  getAvailableCoursesForBatch,
  unenrollStudentFromCourse,
} from "../../controllers/studentAllocationController.js";
import {
  getSectionsForCourse,
  addSectionsToCourse,
  updateSectionsForCourse,
  deleteSection,
  getSections,
} from "../../controllers/sectionController.js";
import {
  addStudent,
  getAllStudents,
  getStudentByRollNumber,
  updateStudent,
  deleteStudent,
  getStudentEnrolledCourses,
  getBranches,
  getSemesters,
  getBatches,
  getStudentsByCourseAndSection,
} from "../../controllers/studentController.js";
import {
  getAllBatches,
  getBatchById,
  createBatch,
  updateBatch,
  deleteBatch,
  getBatchByDetails,
} from "../../controllers/batchController.js";
import {
  getAllTimetableBatches,
  getAllTimetableDepartments,
  getTimetable,
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
  getTimetableByFilters,
  getElectiveBucketsBySemester,
  getCoursesInBucket,
} from "../../controllers/timetableController.js";
import { exportCourseWiseCsvAdmin, getConsolidatedMarks } from "../../controllers/markController.js";
import { getDepartments } from "../../controllers/departmentController.js";
import {
  getElectiveBuckets,
  createElectiveBucket,
  addCoursesToBucket,
  deleteElectiveBucket,
  removeCourseFromBucket,
  updateElectiveBucketName,
} from "../../controllers/electiveBucketController.js";
import {
  getAllRegulations,
  importRegulationCourses,
  createVertical,
  getVerticalsByRegulation,
  getAvailableCoursesForVertical,
  allocateCoursesToVertical,
  allocateRegulationToBatch,
  getCoursesByVertical, 
  getElectivesForSemester, 
} from "../../controllers/regulationController.js";

// FIXED IMPORT: Changed 'protect' to 'requireAuth'
import { requireAuth } from "../../middleware/requireAuth.js";

import { getStudentEnrollments } from "../../controllers/studentEnrollmentViewController.js";
import { getElectiveSelections } from "../../controllers/studentpageController.js";
import { getCOsForCourseAdmin, getStudentCOMarksAdmin, updateStudentCOMarkAdmin } from "../../controllers/markController.js";
import multer from 'multer';
import { uploadGrades, viewGPA, viewCGPA } from '../../controllers/gradeController.js';
import { getStudentsForGrade } from '../../controllers/gradeController.js';

import {
  addNptelCourse,
  bulkAddNptelCourses,
  getAllNptelCourses,
  updateNptelCourse,
  deleteNptelCourse,
  getPendingNptelTransfers,
  approveRejectTransfer
} from "../../controllers/nptelCourseController.js";

const upload = multer({ dest: 'tmp/' });
const router = express.Router();

/* =========================
📌 Semester Routes
========================= */
router.route("/semesters").post(requireAuth, addSemester).get(requireAuth, getAllSemesters);
router.get("/semesters/search", requireAuth, getSemester);
router.get("/semesters/by-batch-branch", requireAuth, getSemestersByBatchBranch);
router.route("/semesters/:semesterId").put(requireAuth, updateSemester).delete(requireAuth, deleteSemester);

/* =========================
📌 Course Routes
========================= */
router.route("/semesters/:semesterId/courses").post(requireAuth, addCourse).get(requireAuth, getCourseBySemester);
router.route("/courses").get(requireAuth, getAllCourse).post(requireAuth, importCourses);
router.route("/courses/:courseId").put(requireAuth, updateCourse).delete(requireAuth, deleteCourse);

/* =========================
📌 Staff-Course Allocation Routes
========================= */
router.get("/users", requireAuth, getUsers);
router.post("/courses/:courseId/staff", requireAuth, allocateStaffToCourse);
router.post("/staff/:Userid/courses", requireAuth, allocateCourseToStaff);
router.put("/staff-courses/:staffCourseId", requireAuth, updateStaffAllocation);
router.patch("/staff-courses/:staffCourseId", requireAuth, updateStaffCourseBatch);
router.get("/courses/:courseId/staff", requireAuth, getStaffAllocationsByCourse);
router.get("/staff/:Userid/courses", requireAuth, getCourseAllocationsByStaff);
router.delete("/staff-courses/:staffCourseId", requireAuth, deleteStaffAllocation);
router.get("/staff/:Userid/courses-enhanced", requireAuth, getCourseAllocationsByStaffEnhanced);

/* =========================
📌 Student Allocation Routes
========================= */
router.get("/students/search", requireAuth, searchStudents);
router.get("/courses/available/:semesterNumber", requireAuth, getAvailableCourses);
router.post("/students/enroll", requireAuth, enrollStudentInCourse);
router.put("/students/:rollNumber/batch", requireAuth, updateStudentBatch);
router.get("/courses/available/:batchId/:semesterNumber", requireAuth, getAvailableCoursesForBatch);
router.delete("/students/unenroll", requireAuth, unenrollStudentFromCourse);

/* =========================
📌 Section Routes
========================= */
router.get("/sections", requireAuth, getSections);
router.get("/courses/:courseId/sections", requireAuth, getSectionsForCourse);
router.post("/courses/:courseId/sections", requireAuth, addSectionsToCourse);
router.put("/courses/:courseId/sections", requireAuth, updateSectionsForCourse);
router.delete("/courses/:courseId/sections/:sectionName", requireAuth, deleteSection);

/* =========================
📌 Student Routes
========================= */
router.route("/students").post(requireAuth, addStudent).get(requireAuth, getAllStudents);
router.get("/students/branches", requireAuth, getBranches);
router.get("/students/semesters", requireAuth, getSemesters);
router.get("/students/batches", requireAuth, getBatches);
router.get("/students/enrolled-courses", requireAuth, getStudentsByCourseAndSection);
router.route("/students/:rollNumber").get(requireAuth, getStudentByRollNumber).put(requireAuth, updateStudent).delete(requireAuth, deleteStudent);
router.get("/students/:rollNumber/enrolled-courses", requireAuth, getStudentEnrolledCourses);

/* =========================
📌 Batch Routes
========================= */
router.get("/batches/find", requireAuth, getBatchByDetails);
router.route("/batches").get(requireAuth, getAllBatches).post(requireAuth, createBatch);
router.route("/batches/:batchId").get(requireAuth, getBatchById).put(requireAuth, updateBatch).delete(requireAuth, deleteBatch);

/* =========================
📌 Timetable Routes
========================= */
router.get("/timetable/batches", requireAuth, getAllTimetableBatches);
router.get("/timetable/departments", requireAuth, getAllTimetableDepartments);
router.get("/timetable/by-filters", requireAuth, getTimetableByFilters);
router.get("/timetable/semester/:semesterId", requireAuth, getTimetable);
router.post("/timetable/entry", requireAuth, createTimetableEntry);
router.put("/timetable/entry/:timetableId", requireAuth, updateTimetableEntry);
router.delete("/timetable/entry/:timetableId", requireAuth, deleteTimetableEntry);
router.get("/elective-buckets/:semesterId", requireAuth, getElectiveBucketsBySemester);
router.get("/bucket-courses/:bucketId", requireAuth, getCoursesInBucket);

/* =========================
📌 Elective Bucket Routes
========================= */
router.get("/semesters/:semesterId/buckets", requireAuth, getElectiveBuckets);
router.post("/semesters/:semesterId/buckets", requireAuth, createElectiveBucket);
router.put("/buckets/:bucketId", requireAuth, updateElectiveBucketName);
router.post("/buckets/:bucketId/courses", requireAuth, addCoursesToBucket);
router.delete("/buckets/:bucketId", requireAuth, deleteElectiveBucket);
router.delete("/buckets/:bucketId/courses/:courseId", requireAuth, removeCourseFromBucket);
router.get('/regulations/:regulationId/electives/:semesterNumber', requireAuth, getElectivesForSemester);

/* =========================
📌 Consolidated Marks Routes
========================= */
router.get("/consolidated-marks", requireAuth, getConsolidatedMarks);

/* =========================
📌 Regulation Routes
========================= */
router.route('/regulations').get(requireAuth, getAllRegulations);
router.route('/regulations/courses').post(requireAuth, importRegulationCourses);
router.route('/regulations/verticals').post(requireAuth, createVertical);
router.route('/regulations/:regulationId/verticals').get(requireAuth, getVerticalsByRegulation);
router.route('/regulations/:regulationId/courses/available').get(requireAuth, getAvailableCoursesForVertical);
router.route('/regulations/verticals/courses').post(requireAuth, allocateCoursesToVertical);
router.route('/regulations/verticals/:verticalId/courses').get(requireAuth, getCoursesByVertical);
router.route('/regulations/allocate-to-batch').post(requireAuth, allocateRegulationToBatch);

router.get("/enrollments/view", requireAuth, getStudentEnrollments);

router.get("/admin-marks/cos/:courseCode", requireAuth, getCOsForCourseAdmin);
router.get("/admin-marks/marks/co/:courseCode", requireAuth, getStudentCOMarksAdmin);
router.put("/admin-marks/marks/co/:regno/:coId", requireAuth, updateStudentCOMarkAdmin);
router.get('/export/course/:courseCode', requireAuth, exportCourseWiseCsvAdmin);

router.get("/elective-selections", requireAuth, getElectiveSelections);

router.post('/grades/import', requireAuth, upload.single('file'), uploadGrades);
router.get('/grades/gpa', requireAuth, viewGPA);
router.get('/grades/cgpa', requireAuth, viewCGPA);
router.get('/grades/students-grade', requireAuth, getStudentsForGrade);

/* =========================
📌 NPTEL Course Routes
========================= */
router.route("/nptel-courses")
  .post(requireAuth, addNptelCourse)
  .get(requireAuth, getAllNptelCourses);

router.route("/nptel-courses/bulk")
  .post(requireAuth, bulkAddNptelCourses);

router.route("/nptel-courses/:nptelCourseId")
  .put(requireAuth, updateNptelCourse)
  .delete(requireAuth, deleteNptelCourse);

router.get("/nptel-credit-transfers", requireAuth, getPendingNptelTransfers);
router.post("/nptel-credit-transfer-action", requireAuth, approveRejectTransfer);

export default router;
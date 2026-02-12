import express from 'express';
import { downloadCbcsExcel,getCoursesByBatchDeptSemester,createCbcs, getAllCbcs,getCbcsById,getStudentCbcsSelection,submitStudentCourseSelection, finalizeAndOptimizeAllocation, manualFinalizeCbcs } from '../controllers/cbcsController.js';

const router = express.Router();
router.get('/course', getCoursesByBatchDeptSemester);
router.post('/create',createCbcs);
router.get('/getcbcs', getAllCbcs);
router.get("/cbcs/:id", getCbcsById);
router.get("/student",getStudentCbcsSelection);
router.post("/submission",submitStudentCourseSelection);
router.get("/:cbcs_id/download-excel", downloadCbcsExcel);
// router.post('/:cbcs_id/finalize', finalizeAndOptimizeAllocation);
router.post('/:id/finalize', manualFinalizeCbcs);

export default router;
// controllers/semesterController.js
import db from "../models/index.js";
import catchAsync from "../utils/catchAsync.js";
import { Op } from "sequelize";

const { Semester, Batch, sequelize } = db;

// Utility: format YYYY-MM-DD safely
function formatDate(dateStr) {
  if (!dateStr) return null;
  return dateStr.length > 10 ? dateStr.substring(0, 10) : dateStr;
}

// Helper function to calculate difference in days
const calculateDaysDifference = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = end - start;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const addSemester = catchAsync(async (req, res) => {
  const { degree, batch, branch, semesterNumber, startDate, endDate } = req.body;
  const userName = req.user?.userName || req.user?.userMail || 'admin';

  // 1. Validation: required fields
  if (!batch || !branch || !degree || !semesterNumber || !startDate || !endDate) {
    return res.status(400).json({ status: "failure", message: "All fields are required" });
  }

  // 2. Date Validations
  const formattedStartDate = formatDate(startDate);
  const formattedEndDate = formatDate(endDate);

  if (formattedStartDate >= formattedEndDate) {
    return res.status(400).json({ status: "failure", message: "startDate must be before endDate" });
  }

  const daysDifference = calculateDaysDifference(formattedStartDate, formattedEndDate);
  if (daysDifference !== 90) {
    return res.status(400).json({ 
      status: "failure", 
      message: `The duration must be exactly 90 days, but got ${daysDifference} days` 
    });
  }

  // 3. Find the Batch
  const batchRecord = await Batch.findOne({
    where: { batch, branch, degree, isActive: 'YES' }
  });

  if (!batchRecord) {
    return res.status(404).json({ status: "failure", message: `Batch ${batch} - ${branch} not found` });
  }

  const batchId = batchRecord.batchId;

  // 4. Prevent duplicate semester
  const existing = await Semester.findOne({
    where: { batchId, semesterNumber }
  });

  if (existing) {
    return res.status(400).json({ status: "failure", message: "Semester already exists for this batch" });
  }

  // 5. Ensure sequential order
  if (semesterNumber > 1) {
    const previousCount = await Semester.count({
      where: { batchId }
    });
    if (previousCount !== semesterNumber - 1) {
      return res.status(400).json({
        status: "failure",
        message: `You must first create semesters 1 to ${semesterNumber - 1} for this batch`,
      });
    }
  }

  // 6. Insert semester
  const newSemester = await Semester.create({
    batchId,
    semesterNumber,
    startDate: formattedStartDate,
    endDate: formattedEndDate,
    createdBy: userName,
    updatedBy: userName
  });

  return res.status(201).json({
    status: "success",
    message: "Semester added successfully",
    semesterId: newSemester.semesterId,
  });
});

export const getSemester = catchAsync(async (req, res) => {
  const { batch, branch, degree, semesterNumber } = req.query;

  if (!batch || !branch || !degree || !semesterNumber) {
    return res.status(400).json({ status: "failure", message: "Missing required query parameters" });
  }

  const semester = await Semester.findOne({
    where: { semesterNumber, isActive: 'YES' },
    include: [{
      model: Batch,
      where: { batch, branch, degree, isActive: 'YES' },
      required: true
    }]
  });

  if (!semester) {
    return res.status(404).json({ status: "failure", message: "Semester not found" });
  }

  res.status(200).json({ status: "success", data: semester });
});

export const getAllSemesters = catchAsync(async (req, res) => {
  const semesters = await Semester.findAll({
    where: { isActive: 'YES' },
    include: [{
      model: Batch,
      where: { isActive: 'YES' },
      required: true
    }]
  });
  return res.status(200).json({ status: "success", data: semesters });
});

export const getSemestersByBatchBranch = catchAsync(async (req, res) => {
  const { batch, branch, degree } = req.query;

  if (!batch || !branch || !degree) {
    return res.status(400).json({ status: "failure", message: "batch, branch, and degree are required" });
  }

  const semesters = await Semester.findAll({
    where: { isActive: 'YES' },
    include: [{
      model: Batch,
      where: { batch, branch, degree, isActive: 'YES' },
      required: true
    }],
    order: [['semesterNumber', 'ASC']]
  });

  if (semesters.length === 0) {
    return res.status(404).json({ status: "failure", message: "No semesters found" });
  }

  res.status(200).json({ status: "success", data: semesters });
});

export const updateSemester = catchAsync(async (req, res) => {
  const { semesterId } = req.params;
  const { degree, batch, branch, semesterNumber, startDate, endDate, isActive } = req.body;
  const userName = req.user?.userName || req.user?.userMail || 'admin';

  // 1. Validate the Batch linked to the update request
  const batchRecord = await Batch.findOne({
    where: { batch, branch, degree, isActive: 'YES' }
  });

  if (!batchRecord) {
    return res.status(404).json({ status: "failure", message: "Linked batch not found" });
  }

  // 2. Perform Update
  const [updatedRows] = await Semester.update({
    batchId: batchRecord.batchId,
    semesterNumber,
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    isActive: isActive || 'YES',
    updatedBy: userName
  }, {
    where: { semesterId }
  });

  if (updatedRows === 0) {
    return res.status(404).json({ status: "failure", message: "Semester not found" });
  }

  res.status(200).json({
    status: "success",
    message: "Semester updated successfully",
  });
});

export const deleteSemester = catchAsync(async (req, res) => {
  const { semesterId } = req.params;

  const deleted = await Semester.destroy({
    where: { semesterId }
  });

  if (!deleted) {
    return res.status(404).json({ status: "failure", message: "Semester not found" });
  }

  res.status(200).json({
    status: "success",
    message: `Semester with id ${semesterId} deleted successfully`,
  });
});
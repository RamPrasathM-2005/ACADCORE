// controllers/batchController.js
import db from "../models/index.js";
import catchAsync from "../utils/catchAsync.js";
import { getOrSetCache, invalidateCachePrefixes, makeCacheKey, ttl } from "../utils/cache.js";

const { Batch, Department, sequelize } = db;
const markCache = (res) => (status) => res.set("X-Cache", status);

/**
 * GET ALL ACTIVE BATCHES
 */
export const getAllBatches = catchAsync(async (req, res) => {
  const key = makeCacheKey("batches:all", { query: req.query || {} });
  const rows = await getOrSetCache(
    key,
    () =>
      Batch.findAll({
        where: { isActive: "YES" },
      }),
    { ttlSeconds: ttl.medium, onStatus: markCache(res) }
  );
  res.status(200).json({ status: "success", data: rows });
});

/**
 * GET BATCH BY ID
 */
export const getBatchById = catchAsync(async (req, res) => {
  const { batchId } = req.params;

  const key = makeCacheKey("batches:byId", { batchId });
  const batch = await getOrSetCache(
    key,
    () =>
      Batch.findOne({
        where: { batchId, isActive: "YES" },
      }),
    { ttlSeconds: ttl.medium, onStatus: markCache(res) }
  );

  if (!batch) {
    return res.status(404).json({ 
      status: "failure", 
      message: `No active batch found with batchId ${batchId}` 
    });
  }

  res.status(200).json({ status: "success", data: batch });
});

/**
 * GET BATCH BY DETAILS (Query Params)
 */
export const getBatchByDetails = catchAsync(async (req, res) => {
  const { degree, branch, batch } = req.query;
  
  if (!degree || !branch || !batch) {
    return res.status(400).json({ 
      status: "failure", 
      message: "degree, branch, and batch are required query parameters" 
    });
  }

  const key = makeCacheKey("batches:byDetails", { degree, branch, batch });
  const row = await getOrSetCache(
    key,
    () =>
      Batch.findOne({
        where: { degree, branch, batch, isActive: "YES" },
      }),
    { ttlSeconds: ttl.medium, onStatus: markCache(res) }
  );

  if (!row) {
    return res.status(404).json({ 
      status: "failure", 
      message: `No active batch found with degree ${degree}, branch ${branch}, and batch ${batch}` 
    });
  }

  res.status(200).json({ status: "success", data: row });
});

/**
 * CREATE NEW BATCH
 */
export const createBatch = catchAsync(async (req, res) => {
  const { degree, branch, batch, batchYears, createdBy } = req.body;

  if (!degree || !branch || !batch || !batchYears || !createdBy) {
    return res.status(400).json({ 
      status: "failure", 
      message: "All fields (degree, branch, batch, batchYears, createdBy) are required" 
    });
  }

  // Use findOrCreate to handle the existence check and creation atomically
  const [newBatch, created] = await Batch.findOrCreate({
    where: { batch, degree, branch, isActive: 'YES' },
    defaults: {
      degree,
      branch,
      batch,
      batchYears,
      createdBy,
      isActive: 'YES'
    }
  });

  if (!created) {
    return res.status(400).json({ status: "failure", message: "Batch already exists" });
  }
  await invalidateCachePrefixes(["batches", "semesters", "departments", "attendanceReports", "filters"]);

  res.status(201).json({ 
    status: "success", 
    batchId: newBatch.batchId, 
    message: "Batch created successfully" 
  });
});

/**
 * UPDATE BATCH
 */
export const updateBatch = catchAsync(async (req, res) => {
  const { batchId } = req.params;
  const { degree, branch, batch, batchYears, isActive, updatedBy } = req.body;

  const existingBatch = await Batch.findOne({ where: { batchId, isActive: 'YES' } });

  if (!existingBatch) {
    return res.status(404).json({ 
      status: "failure", 
      message: `No active batch found with batchId ${batchId}` 
    });
  }

  // Sequelize update handles partial fields automatically
  await existingBatch.update({
    degree: degree || existingBatch.degree,
    branch: branch || existingBatch.branch,
    batch: batch || existingBatch.batch,
    batchYears: batchYears || existingBatch.batchYears,
    isActive: isActive || existingBatch.isActive,
    updatedBy: updatedBy || req.user?.userMail || 'admin'
  });
  await invalidateCachePrefixes(["batches", "semesters", "departments", "attendanceReports", "filters"]);

  res.status(200).json({ status: "success", message: "Batch updated successfully" });
});

/**
 * DELETE BATCH (Soft Delete)
 */
export const deleteBatch = catchAsync(async (req, res) => {
  const { batchId } = req.params;

  const existingBatch = await Batch.findOne({ where: { batchId, isActive: 'YES' } });

  if (!existingBatch) {
    return res.status(404).json({ 
      status: "failure", 
      message: `No active batch found with batchId ${batchId}` 
    });
  }

  await existingBatch.update({
    isActive: 'NO',
    updatedBy: req.user?.userMail || 'admin'
  });
  await invalidateCachePrefixes(["batches", "semesters", "departments", "attendanceReports", "filters"]);

  res.status(200).json({ status: "success", message: "Batch deleted successfully" });
});

/**
 * INTERNAL HELPER: getOrCreateBatch
 * Used by other controllers (like Regulation)
 */
export const getOrCreateBatch = async (Deptid, regulationYear, createdBy, updatedBy) => {
  const t = await sequelize.transaction();
  try {
    // Find if the batch exists for this department and year
    // Note: The original query used Deptid which wasn't in your Batch model snippet, 
    // but the branch name subquery suggests it matches the department acronym.
    
    const dept = await Department.findByPk(Deptid, { transaction: t });
    if (!dept) throw new Error("Department not found");

    const batchName = regulationYear.toString();

    let batch = await Batch.findOne({
      where: { 
        batch: batchName, 
        branch: dept.Deptacronym, 
        isActive: 'YES' 
      },
      transaction: t
    });

    if (batch) {
      await t.commit();
      return batch.batchId;
    }

    // Create a new batch if not found
    const startYear = parseInt(regulationYear);
    const batchYears = `${startYear}-${startYear + 4}`;

    batch = await Batch.create({
      degree: 'B.Tech',
      branch: dept.Deptacronym,
      batch: batchName,
      batchYears: batchYears,
      isActive: 'YES',
      createdBy: createdBy,
      updatedBy: updatedBy
    }, { transaction: t });

    await t.commit();
    await invalidateCachePrefixes(["batches", "semesters", "departments", "attendanceReports", "filters"]);
    return batch.batchId;
  } catch (err) {
    await t.rollback();
    throw new Error(`Error getting or creating batch: ${err.message}`);
  }
};

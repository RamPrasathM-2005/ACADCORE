// controllers/departmentController.js
import db from '../models/index.js';
import { getOrSetCache, invalidateCachePrefixes, makeCacheKey, ttl } from "../utils/cache.js";

// NOTE: If you renamed the define() name in your model to 'Department', use that.
// If you kept it as 'Department', change the variable below.
const Department = db.Department || db.Department;
const { Company } = db;
const markCache = (res) => (status) => res.set("X-Cache", status);

const serializeDepartment = (department) => {
  const plain = department?.toJSON ? department.toJSON() : department;
  if (!plain) return plain;
  return {
    ...plain,
    departmentName: plain.departmentName,
    departmentAcr: plain.departmentAcr,
    Deptname: plain.departmentName,
    Deptacronym: plain.departmentAcr,
    deptCode: plain.departmentAcr,
  };
};

/**
 * Helper: Normalize status string
 */
const normalizeStatus = (status) => {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'inactive') return 'Inactive';
  if (value === 'archived') return 'Archived';
  return 'Active';
};

/**
 * Helper: Format Sequelize Errors
 */
const formatSequelizeError = (error) => {
  if (!error) return 'Operation failed';
  if (error.name === 'SequelizeUniqueConstraintError') {
    return 'Department already exists';
  }
  if (error.name === 'SequelizeValidationError') {
    return error.errors?.map((e) => e.message).join(', ') || 'Validation error';
  }
  return error.message || 'Operation failed';
};

/**
 * GET /api/departments/simple
 */
export const getDepartments = async (req, res) => {
  try {
    const key = makeCacheKey("departments:simple", { query: req.query || {} });
    const rows = await getOrSetCache(
      key,
      () =>
        Department.findAll({
          attributes: ["departmentId", "departmentName", "departmentAcr"],
          where: { status: "Active" },
        }),
      { ttlSeconds: ttl.medium, onStatus: markCache(res) }
    );

    res.status(200).json({
      status: 'success',
      data: rows.map(serializeDepartment),
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ status: 'failure', message: error.message });
  }
};

/**
 * GET /api/departments
 */
export const getAllDepartments = async (req, res) => {
  try {
    const where = {};
    if (req.query.companyId) where.companyId = req.query.companyId;

    const key = makeCacheKey("departments:all", { where });
    const departments = await getOrSetCache(
      key,
      () =>
        Department.findAll({
          where,
          attributes: ["departmentId", "companyId", "departmentName", "departmentAcr", "status"],
          include: [
            {
              model: Company,
              as: "company",
              attributes: ["companyId", "companyName", "companyAcr"],
            },
          ],
        }),
      { ttlSeconds: ttl.medium, onStatus: markCache(res) }
    );
    res.json(departments.map(serializeDepartment));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch departments', details: error.message });
  }
};

/**
 * GET /api/departments/:id
 */
export const getDepartmentById = async (req, res) => {
  try {
    const key = makeCacheKey("departments:byId", { id: req.params.id });
    const department = await getOrSetCache(
      key,
      () =>
        Department.findByPk(req.params.id, {
          include: [{ model: Company, as: "company" }],
        }),
      { ttlSeconds: ttl.medium, onStatus: markCache(res) }
    );

    if (!department) return res.status(404).json({ error: 'Department not found' });
    res.status(200).json(serializeDepartment(department));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/departments
 * FIXED: Mapping incoming JSON to Database Columns
 */
export const createDepartment = async (req, res) => {
  try {
    const payload = {
      departmentId: req.body.departmentId,
      departmentName: req.body.departmentName,
      departmentAcr: req.body.departmentAcr,
      companyId: req.body.companyId,
      status: normalizeStatus(req.body?.status),
      createdBy: req.body.createdBy,
    };
    
    const department = await Department.create(payload);
    await invalidateCachePrefixes(["departments", "attendanceReports", "filters"]);
    res.status(201).json(serializeDepartment(department));
  } catch (error) {
    const statusCode = error.name?.startsWith('Sequelize') ? 400 : 500;
    res.status(statusCode).json({ error: formatSequelizeError(error) });
  }
};

/**
 * PUT /api/departments/:id
 */
export const updateDepartment = async (req, res) => {
  try {
    const payload = {
      ...(req.body.departmentName ? { departmentName: req.body.departmentName } : {}),
      ...(req.body.departmentAcr ? { departmentAcr: req.body.departmentAcr } : {}),
      ...(req.body.companyId ? { companyId: req.body.companyId } : {}),
      ...(req.body.status ? { status: normalizeStatus(req.body.status) } : {}),
      updatedBy: req.body.updatedBy
    };

    const [affectedCount] = await Department.update(payload, {
      where: { departmentId: req.params.id } 
    });

    if (affectedCount === 0) {
      return res.status(404).json({ error: 'No changes made or department not found' });
    }

    const updatedDepartment = await Department.findByPk(req.params.id);
    await invalidateCachePrefixes(["departments", "attendanceReports", "filters"]);
    res.status(200).json(serializeDepartment(updatedDepartment));
  } catch (error) {
    const statusCode = error.name?.startsWith('Sequelize') ? 400 : 500;
    res.status(statusCode).json({ error: formatSequelizeError(error) });
  }
};

/**
 * DELETE /api/departments/:id
 */
export const deleteDepartment = async (req, res) => {
  try {
    const department = await Department.findByPk(req.params.id);
    if (!department) return res.status(404).json({ message: 'Department not found' });

    await department.update({
      status: 'Inactive',
      updatedBy: req.body?.updatedBy || null,
    });
    await invalidateCachePrefixes(["departments", "attendanceReports", "filters"]);

    res.json({ message: 'Department marked as inactive successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

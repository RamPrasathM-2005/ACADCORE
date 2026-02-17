// controllers/departmentController.js
import db from '../models/index.js';

const { DepartmentAcademic, Company } = db;

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
    return 'Department already exists (Unique constraint violation)';
  }
  if (error.name === 'SequelizeValidationError') {
    return error.errors?.map((e) => e.message).join(', ') || 'Validation error';
  }
  if (error.name === 'SequelizeForeignKeyConstraintError') {
    return 'Invalid companyId reference';
  }
  return error.message || 'Operation failed';
};

/**
 * GET /api/departments/simple
 * Fetch basic academic columns
 */
export const getDepartments = async (req, res) => {
  try {
    const rows = await DepartmentAcademic.findAll({
      attributes: ['Deptid', 'Deptname', 'Deptacronym'],
      where: { status: 'Active' }
    });

    res.status(200).json({
      status: 'success',
      data: rows,
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ 
      status: 'failure', 
      message: 'Failed to fetch departments: ' + error.message 
    });
  }
};

/**
 * GET /api/departments
 * Full fetch with Corporate associations
 */
export const getAllDepartments = async (req, res) => {
  try {
    const where = {};
    if (req.query.companyId) where.companyId = req.query.companyId;

    const departments = await DepartmentAcademic.findAll({
      where,
      include: [
        { 
          model: Company, 
          as: 'company',
          attributes: ['companyId', 'companyName', 'companyAcr']
        }
      ]
    });
    res.json(departments);
  } catch (error) {
    console.error('[getAllDepartments] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch departments',
      details: error.message,
    });
  }
};

/**
 * GET /api/departments/:id
 */
export const getDepartmentById = async (req, res) => {
  try {
    const department = await DepartmentAcademic.findByPk(req.params.id, {
      include: [
        { model: Company, as: 'company' }
      ]
    });

    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }

    res.status(200).json(department);
  } catch (error) {
    console.error('[getDepartmentById] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch department',
      details: error.message,
    });
  }
};

/**
 * POST /api/departments
 */
export const createDepartment = async (req, res) => {
  try {
    const payload = {
      ...req.body,
      status: normalizeStatus(req.body?.status),
    };
    
    const department = await DepartmentAcademic.create(payload);
    res.status(201).json(department);
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
      ...req.body,
      ...(req.body?.status ? { status: normalizeStatus(req.body.status) } : {}),
    };

    const [affectedCount] = await DepartmentAcademic.update(payload, {
      where: { Deptid: req.params.id } // Primary Key is Deptid
    });

    if (affectedCount === 0) {
      return res.status(404).json({ error: 'Department not found or no changes' });
    }

    const updatedDepartment = await DepartmentAcademic.findByPk(req.params.id);
    res.status(200).json(updatedDepartment);
  } catch (error) {
    const statusCode = error.name?.startsWith('Sequelize') ? 400 : 500;
    res.status(statusCode).json({ error: formatSequelizeError(error) });
  }
};

/**
 * DELETE /api/departments/:id
 * Marks department as inactive
 */
export const deleteDepartment = async (req, res) => {
  try {
    const department = await DepartmentAcademic.findByPk(req.params.id);
    
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    await department.update({
      status: 'Inactive',
      updatedBy: req.body?.updatedBy || null,
    });

    res.json({ message: 'Department marked as inactive successfully' });
  } catch (error) {
    const statusCode = error.name?.startsWith('Sequelize') ? 400 : 500;
    res.status(statusCode).json({ error: formatSequelizeError(error) });
  }
};
// controllers/departmentController.js
import db from '../models/index.js';

const { DepartmentAcademic } = db;

export const getDepartments = async (req, res) => {
  try {
    // .findAll is the Sequelize equivalent of SELECT *
    const rows = await DepartmentAcademic.findAll({
      attributes: ['Deptid', 'Deptname', 'Deptacronym'], // Specific columns to fetch
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
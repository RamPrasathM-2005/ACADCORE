import { Op } from 'sequelize';
import db from '../models/index.js'; // Assuming your index.js exports the db object
const { 
  sequelize, 
  Regulation, 
  DepartmentAcademic, 
  Vertical, 
  RegulationCourse, 
  VerticalCourse, 
  Batch, 
  Semester, 
  Course 
} = db;

// Included branchMap as requested
export const branchMap = {
  CSE: { Deptid: 1, Deptname: "Computer Science Engineering" },
  IT: { Deptid: 4, Deptname: "Information Technology" },
  ECE: { Deptid: 2, Deptname: "Electronics & Communication" },
  MECH: { Deptid: 3, Deptname: "Mechanical Engineering" },
  CIVIL: { Deptid: 7, Deptname: "Civil Engineering" },
  EEE: { Deptid: 5, Deptname: "Electrical Engineering" },
};

const determineCourseType = (lectureHours, tutorialHours, practicalHours, experientialHours) => {
  if (experientialHours > 0) return 'EXPERIENTIAL LEARNING';
  if (practicalHours > 0) {
    if (lectureHours > 0 || tutorialHours > 0) return 'INTEGRATED';
    return 'PRACTICAL';
  }
  return 'THEORY';
};

export const getAllRegulations = async (req, res) => {
  try {
    const rows = await Regulation.findAll({
      where: { isActive: 'YES' },
      include: [{
        model: DepartmentAcademic,
        attributes: ['Deptacronym']
      }]
    });
    res.json({ status: 'success', data: rows });
  } catch (err) {
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};

export const getVerticalsByRegulation = async (req, res) => {
  const { regulationId } = req.params;
  try {
    const rows = await Vertical.findAll({
      where: { regulationId, isActive: 'YES' },
      attributes: ['verticalId', 'verticalName']
    });
    res.json({ status: 'success', data: rows });
  } catch (err) {
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};

export const createVertical = async (req, res) => {
  const { regulationId, verticalName } = req.body;
  const createdBy = req.user?.userName || 'admin';

  if (!regulationId || !verticalName) {
    return res.status(400).json({ status: 'failure', message: 'Regulation ID and vertical name are required' });
  }

  try {
    const vertical = await Vertical.create({
      regulationId,
      verticalName,
      createdBy,
      updatedBy: createdBy
    });
    res.json({ status: 'success', message: 'Vertical added successfully', data: vertical });
  } catch (err) {
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};

export const importRegulationCourses = async (req, res) => {
  const { regulationId, courses } = req.body;
  const createdBy = req.user?.userName || 'admin';

  if (!regulationId || !Array.isArray(courses) || courses.length === 0) {
    return res.status(400).json({ status: 'failure', message: 'Regulation ID and courses array are required' });
  }

  const transaction = await sequelize.transaction();
  try {
    const courseData = courses.map((course) => ({
      regulationId,
      semesterNumber: course.semesterNumber,
      courseCode: course.courseCode,
      courseTitle: course.courseTitle,
      category: course.category.toUpperCase(),
      type: determineCourseType(course.lectureHours, course.tutorialHours, course.practicalHours, course.experientialHours),
      lectureHours: course.lectureHours || 0,
      tutorialHours: course.tutorialHours || 0,
      practicalHours: course.practicalHours || 0,
      experientialHours: course.experientialHours || 0,
      totalContactPeriods: course.totalContactPeriods,
      credits: course.credits,
      minMark: course.minMark,
      maxMark: course.maxMark,
      createdBy,
      updatedBy: createdBy
    }));

    await RegulationCourse.bulkCreate(courseData, { transaction });
    await transaction.commit();
    res.json({ status: 'success', message: 'Courses added to regulation successfully' });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ status: 'failure', message: `Server error: ${err.message}` });
  }
};

export const allocateCoursesToVertical = async (req, res) => {
  const { verticalId, regCourseIds } = req.body;
  const createdBy = req.user?.userName || 'admin';

  const transaction = await sequelize.transaction();
  try {
    const mappingData = regCourseIds.map(regCourseId => ({
      verticalId,
      regCourseId,
      createdBy,
      updatedBy: createdBy
    }));

    await VerticalCourse.bulkCreate(mappingData, { transaction, ignoreDuplicates: true });
    await transaction.commit();
    res.json({ status: 'success', message: 'Courses allocated to vertical successfully' });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};

export const getAvailableCoursesForVertical = async (req, res) => {
  const { regulationId } = req.params;
  try {
    // Get IDs of courses already in verticals
    const allocatedCourses = await VerticalCourse.findAll({
      attributes: ['regCourseId']
    });
    const allocatedIds = allocatedCourses.map(c => c.regCourseId);

    const rows = await RegulationCourse.findAll({
      where: {
        regulationId,
        category: { [Op.in]: ['PEC', 'OEC'] },
        regCourseId: { [Op.notIn]: allocatedIds.length ? allocatedIds : [0] },
        isActive: 'YES'
      },
      attributes: [['regCourseId', 'courseId'], 'courseCode', 'courseTitle', 'category', 'semesterNumber']
    });
    res.json({ status: 'success', data: rows });
  } catch (err) {
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};

export const allocateRegulationToBatch = async (req, res) => {
  const { batchId, regulationId } = req.body;
  const createdBy = req.user?.userName || 'admin';

  const transaction = await sequelize.transaction();
  try {
    const batch = await Batch.findOne({ where: { batchId, isActive: 'YES' }, transaction });
    if (!batch) throw new Error('Batch not found or inactive');

    const deptInfo = branchMap[batch.branch];
    if (!deptInfo) throw new Error(`Invalid branch: ${batch.branch}`);

    const regulation = await Regulation.findOne({ where: { regulationId, isActive: 'YES' }, transaction });
    if (!regulation) throw new Error('Regulation not found');
    if (regulation.Deptid !== deptInfo.Deptid) {
      throw new Error(`Regulation department mismatch for branch ${batch.branch}`);
    }

    // 1. Update Batch
    await batch.update({ regulationId, updatedBy: createdBy }, { transaction });

    // 2. Ensure 8 Semesters exist
    for (let i = 1; i <= 8; i++) {
      await Semester.findOrCreate({
        where: { batchId, semesterNumber: i },
        defaults: {
          startDate: new Date(),
          endDate: new Date(new Date().setMonth(new Date().getMonth() + 6)),
          createdBy,
          updatedBy: createdBy
        },
        transaction
      });
    }

    const semesters = await Semester.findAll({ where: { batchId }, transaction });
    const semesterMap = semesters.reduce((acc, sem) => {
      acc[sem.semesterNumber] = sem.semesterId;
      return acc;
    }, {});

    // 3. Copy Courses
    const regCourses = await RegulationCourse.findAll({ where: { regulationId, isActive: 'YES' }, transaction });
    
    for (const rc of regCourses) {
      const semId = semesterMap[rc.semesterNumber];
      if (semId) {
        await Course.findOrCreate({
          where: { courseCode: rc.courseCode, semesterId: semId },
          defaults: {
            courseTitle: rc.courseTitle,
            category: rc.category,
            type: rc.type,
            lectureHours: rc.lectureHours,
            tutorialHours: rc.tutorialHours,
            practicalHours: rc.practicalHours,
            experientialHours: rc.experientialHours,
            totalContactPeriods: rc.totalContactPeriods,
            credits: rc.credits,
            minMark: rc.minMark,
            maxMark: rc.maxMark,
            createdBy,
            updatedBy: createdBy
          },
          transaction
        });
      }
    }

    await transaction.commit();
    res.json({ status: 'success', message: 'Regulation allocated and courses synchronized' });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ status: 'failure', message: err.message });
  }
};

export const getElectivesForSemester = async (req, res) => {
  const { regulationId, semesterNumber } = req.params;
  try {
    const rows = await RegulationCourse.findAll({
      where: {
        regulationId,
        semesterNumber,
        category: { [Op.in]: ['PEC', 'OEC'] },
        isActive: 'YES'
      },
      include: [{
        model: VerticalCourse,
        include: [{ model: Vertical, attributes: ['verticalName'] }]
      }],
      order: [['courseCode', 'ASC']]
    });

    res.json({ status: 'success', data: rows });
  } catch (err) {
    res.status(500).json({ status: 'failure', message: err.message });
  }
};

// Add this to your regulationController.js
export const getCoursesByVertical = async (req, res) => {
  const { verticalId } = req.params;
  const { semesterNumber } = req.query;

  try {
    const whereCondition = {
      isActive: 'YES',
      category: { [Op.in]: ['PEC', 'OEC'] }
    };

    // If semesterNumber is provided in query, add it to filter
    if (semesterNumber) {
      whereCondition.semesterNumber = semesterNumber;
    }

    const rows = await RegulationCourse.findAll({
      where: whereCondition,
      include: [{
        model: VerticalCourse,
        where: { verticalId },
        attributes: [], // We don't need fields from the mapping table
        required: true  // This makes it an INNER JOIN
      }],
      attributes: [
        ['regCourseId', 'courseId'], 
        'courseCode', 
        'courseTitle', 
        'category', 
        'semesterNumber'
      ]
    });

    res.json({ status: 'success', data: rows });
  } catch (err) {
    console.error('Error fetching courses by vertical:', err);
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};
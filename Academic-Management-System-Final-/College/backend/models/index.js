// models/index.js (or wherever you initialize models)
const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
  host: process.env.DB_HOST,
  dialect: 'mysql',
  logging: false,
});

// Load all models
const models = {};
const modelFiles = [
  // HR models (from previous)
  'user', 'company', 'department', 'designation', 'employeeGrade', 'employee', 'role', 'bus', 'biometricDevice',
  'attendance', 'biometricPunch', 'shiftType', 'shiftAssignment', 'holidayPlan', 'holiday', 'leaveType',
  'leavePolicy', 'leaveAllocation', 'leaveRequest', 'leaveApproval', 'formula', 'salaryComponent',
  'employeeSalaryComponent', 'employeeSalaryMaster', 'salaryGeneration', 'salaryGenerationDetail',
  'salaryRevisionHistory', 'employeeLoan',

  // Academic models (new/converted)
  'departmentAcademic', // Renamed to avoid conflict with HR Department
  'regulation', 'batch', 'semester', 'course', 'regulationCourse', 'vertical', 'verticalCourse',
  'section', 'studentCourse', 'staffCourse', 'courseOutcome', 'coTool', 'studentCoTool', 'timetable',
  'dayAttendance', 'periodAttendance', 'coursePartitions', 'coType', 'toolDetails', 'electiveBucket',
  'electiveBucketCourse', 'studentCoMarks', 'studentElectiveSelection', 'nptelCourse',
  'studentNptelEnrollment', 'nptelCreditTransfer', 'gradePoint', 'studentGrade', 'studentSemesterGPA',
  'courseRequest', 'cbcs', 'cbcsSubject', 'cbcsSectionStaff', 'studentcourseChoices', 'studentTempChoice',
  'studentDetails', // Student table
];

modelFiles.forEach(file => {
  const model = require(`./${file}`)(sequelize, DataTypes);
  models[model.name] = model;
});

// Associate models
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// Sync (use migrations in production)
if (process.env.NODE_ENV !== 'production') {
  sequelize.sync({ alter: true }).then(() => console.log('DB Synced'));
}

module.exports = { sequelize, ...models };
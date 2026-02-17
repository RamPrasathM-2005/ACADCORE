// models/index.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { DataTypes } from 'sequelize';
import sequelize from '../db.js'; 

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = {};

const files = fs.readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== path.basename(__filename) &&
      file.slice(-3) === '.js'
    );
  });

for (const file of files) {
  try {
    const filePath = path.join(__dirname, file);
    const importedModel = require(filePath);
    const modelDef = importedModel.default ? importedModel.default : importedModel;
    
    if (typeof modelDef === 'function') {
      const model = modelDef(sequelize, DataTypes);
      db[model.name] = model;
      console.log(`Successfully Loaded Model: ${model.name}`); // Debug Line
    }
  } catch (err) {
    console.error(`❌ Error loading model file ${file}:`, err.message);
  }
}

// Run associations
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = sequelize.constructor;

export const initDatabase = async () => {
  try {
    console.log("⏳ Cleaning and rebuilding database...");
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');

    // Use force: true ONCE to delete the corrupted companies table
    await sequelize.sync({ alter: true }); 
    
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log("✅ Database rebuilt successfully");
    return true;
  } catch (error) {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    console.error("❌ Database Init Error:", error);
    throw error; 
  }
};

export default db;

// Named exports for your components
export const {
  Company, Department, User, Employee, StudentDetails, DepartmentAcademic,
  Regulation, Batch, Semester, Course, RegulationCourse, Vertical,
  VerticalCourse, Section, StudentCourse, StaffCourse, CourseOutcome,
  COTool, StudentCOTool, Timetable, DayAttendance, PeriodAttendance,
  CoursePartitions, COType, ToolDetails, ElectiveBucket,
  ElectiveBucketCourse, StudentCoMarks, StudentElectiveSelection,
  NptelCourse, StudentNptelEnrollment, NptelCreditTransfer,
  GradePoint, StudentGrade, StudentSemesterGPA, CourseRequest,
  CBCS, CBCSSubject, CBCSSectionStaff, studentcourseChoices,
  studentTempChoice
} = db;
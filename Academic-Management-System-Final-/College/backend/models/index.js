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
    // 1. Check if we really need to sync
    // Set this to false if you are NOT changing database columns right now
    const checkStructure = true; 

    if (checkStructure) {
      console.log("⏳ Checking database structure (this may take a moment)...");
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
      
      // Use alter: true only when developing. 
      // If the structure is stable, remove this line to make startup instant.
      await sequelize.sync({ alter: true }); 
      
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
      console.log("✅ Database Structure Verified");
    } else {
      console.log("⏩ Skipping structure check (Fast Start)");
      await sequelize.authenticate(); // Just check if DB is alive
      console.log("✅ Database Connected");
    }

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
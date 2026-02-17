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
      console.log(`Successfully Loaded Model: ${model.name}`);
    }
  } catch (err) {
    console.error(`Error loading model file ${file}:`, err.message);
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
  const syncMode = (process.env.DB_SYNC_MODE || 'none').toLowerCase();
  const shouldSync = syncMode === 'alter' || syncMode === 'force';

  try {
    if (shouldSync) {
      console.log(`Checking database structure using sync mode: ${syncMode}`);
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
      await sequelize.sync(syncMode === 'force' ? { force: true } : { alter: true });
      console.log('Database structure verified');
    } else {
      console.log('Skipping schema sync (fast startup). Set DB_SYNC_MODE=alter when needed.');
      await sequelize.authenticate();
      console.log('Database connected');
    }

    return true;
  } catch (error) {
    console.error('Database init error:', error);
    throw error; 
  } finally {
    if (shouldSync) {
      try {
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
      } catch (restoreError) {
        console.error('Failed to re-enable FOREIGN_KEY_CHECKS:', restoreError);
      }
    }
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

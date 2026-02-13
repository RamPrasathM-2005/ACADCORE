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

// Read all files in the current directory
const files = fs.readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== path.basename(__filename) &&
      file.slice(-3) === '.js'
    );
  });

for (const file of files) {
  const filePath = path.join(__dirname, file);
  const importedModel = require(filePath);
  
  const modelDef = importedModel.default ? importedModel.default : importedModel;
  
  if (typeof modelDef === 'function') {
    const model = modelDef(sequelize, DataTypes);
    db[model.name] = model;
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

// We export the function but DO NOT call it here
export const initDatabase = async () => {
  try {
    console.log("⏳ Initializing database structure...");

    // 1. Disable Foreign Key checks to stop Deadlocks
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');

    // 2. Use force: true to fix the current Batch table corruption
    // Note: Once the server runs successfully once, you should change this to alter: false
    await sequelize.sync({ alter: true}); 
    console.log("✅ Database structure built from scratch");

    // 3. Re-enable Foreign Key checks
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

    // 4. Seed static data
    const GradePoint = sequelize.models.GradePoint; 
    if (GradePoint) {
      await GradePoint.bulkCreate([
        { grade: 'O', point: 10 }, { grade: 'A+', point: 9 },
        { grade: 'A', point: 8 }, { grade: 'B+', point: 7 },
        { grade: 'B', point: 6 }, { grade: 'U', point: 0 },
      ], { ignoreDuplicates: true });
    }

    const Dept = sequelize.models.DepartmentAcademic;
    if (Dept) {
       await Dept.bulkCreate([
        { Deptid: 1, Deptname: 'Computer Science Engineering', Deptacronym: 'CSE' },
        { Deptid: 2, Deptname: 'Electronics & Communication', Deptacronym: 'ECE' },
        { Deptid: 3, Deptname: 'Mechanical Engineering', Deptacronym: 'MECH' },
        { Deptid: 4, Deptname: 'Information Technology', Deptacronym: 'IT' },
        { Deptid: 5, Deptname: 'Electrical Engineering', Deptacronym: 'EEE' },
        { Deptid: 6, Deptname: 'Artificial Intelligence and Data Science', Deptacronym: 'AIDS' },
        { Deptid: 7, Deptname: 'Civil Engineering', Deptacronym: 'CIVIL' },
      ], { ignoreDuplicates: true });
    }

    console.log("✅ Seeding completed successfully");
    return true;
  } catch (error) {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    console.error("❌ Database Init Error:", error);
    throw error; 
  }
};

export default db;

// Destructure and export models
export const {
  User, Employee, StudentDetails, DepartmentAcademic, Regulation,
  Batch, Semester, Course, RegulationCourse, Vertical, VerticalCourse,
  Section, StudentCourse, StaffCourse, CourseOutcome, COTool,
  StudentCOTool, Timetable, DayAttendance, PeriodAttendance,
  CoursePartitions, COType, ToolDetails, ElectiveBucket,
  ElectiveBucketCourse, StudentCoMarks, StudentElectiveSelection,
  NptelCourse, StudentNptelEnrollment, NptelCreditTransfer,
  GradePoint, StudentGrade, StudentSemesterGPA, CourseRequest,
  CBCS, CBCSSubject, CBCSSectionStaff, studentcourseChoices,
  studentTempChoice, StudentCOMarks
} = db;
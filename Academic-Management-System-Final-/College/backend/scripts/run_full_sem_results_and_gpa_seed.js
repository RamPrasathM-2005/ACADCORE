import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', 'config.env') });

const DB = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  multipleStatements: true,
};

const GRADE_POINTS = { O: 10, 'A+': 9, A: 8, 'B+': 7, B: 6, C: 5, U: 0 };
const r2 = (n) => Number(Number(n).toFixed(2));

const buildSemesterPerformance = (latestGradeRows) => {
  const bySem = new Map();

  for (const row of latestGradeRows) {
    const semNo = Number(row.semesterNumber);
    const semId = Number(row.semesterId);
    const credits = Number(row.credits || 0);
    if (!semNo || !semId || credits <= 0) continue;

    if (!bySem.has(semNo)) {
      bySem.set(semNo, {
        semesterNumber: semNo,
        semesterId: semId,
        semPoints: 0,
        semEarnedCredits: 0,
        semTotalCredits: 0,
        hasOutstandingFail: false,
      });
    }

    const sem = bySem.get(semNo);
    sem.semTotalCredits += credits;

    const gp = Object.prototype.hasOwnProperty.call(GRADE_POINTS, row.grade)
      ? GRADE_POINTS[row.grade]
      : 0;
    sem.semPoints += gp * credits;

    if (row.grade !== 'U') sem.semEarnedCredits += credits;
    if (row.grade === 'U') sem.hasOutstandingFail = true;
  }

  const semesters = [...bySem.values()].sort((a, b) => a.semesterNumber - b.semesterNumber);

  let cumulativePoints = 0;
  let cumulativeEarnedCredits = 0;
  let cumulativeTotalCredits = 0;
  let hasAnyOutstandingFail = false;
  let lastValidCgpa = null;

  for (const sem of semesters) {
    const gpa = sem.semTotalCredits > 0 ? r2(sem.semPoints / sem.semTotalCredits) : null;

    cumulativePoints += sem.semPoints;
    cumulativeEarnedCredits += sem.semEarnedCredits;
    cumulativeTotalCredits += sem.semTotalCredits;
    hasAnyOutstandingFail = hasAnyOutstandingFail || sem.hasOutstandingFail;

    let cgpa = null;
    let cgpaFrozen = false;

    if (sem.semesterNumber > 1) {
      if (hasAnyOutstandingFail) {
        cgpa = lastValidCgpa;
        cgpaFrozen = true;
      } else if (cumulativeEarnedCredits > 0) {
        cgpa = r2(cumulativePoints / cumulativeEarnedCredits);
        lastValidCgpa = cgpa;
      }
    }

    sem.gpa = gpa;
    sem.cgpa = cgpa;
    sem.cumulativeQualityPoints = r2(cumulativePoints);
    sem.cumulativeEarnedCredits = r2(cumulativeEarnedCredits);
    sem.cumulativeTotalCredits = r2(cumulativeTotalCredits);
    sem.cgpaFrozen = cgpaFrozen;
    sem.hasOutstandingArrear = hasAnyOutstandingFail;
  }

  return semesters;
};

const main = async () => {
  const conn = await mysql.createConnection(DB);
  try {
    const seedSqlPath = path.join(__dirname, '..', 'sql', 'seed_full_sem_results_for_listed_students.sql');
    const seedSql = fs.readFileSync(seedSqlPath, 'utf8');

    await conn.query(seedSql);

    const [targetRows] = await conn.query(`
      SELECT sd.registerNumber AS regno
      FROM student_details sd
      WHERE
        (
          sd.batch = 2023
          AND CAST(sd.semester AS UNSIGNED) = 6
          AND sd.departmentId IN (2, 3)
        )
        OR
        (
          sd.batch = 2024
          AND CAST(sd.semester AS UNSIGNED) = 4
          AND sd.departmentId = 2
        )
      ORDER BY sd.registerNumber
    `);

    const regnos = targetRows.map((r) => r.regno);
    if (!regnos.length) {
      console.log('No target students found. Nothing to seed.');
      await conn.end();
      return;
    }

    await conn.beginTransaction();
    try {
      await conn.query(
        `DELETE FROM StudentSemesterGPA
         WHERE regno IN (${regnos.map(() => '?').join(',')})`,
        regnos
      );

      let insertedRows = 0;

      for (const regno of regnos) {
        const [gradeRows] = await conn.query(
          `SELECT
             sg.gradeId,
             sg.courseCode,
             sg.grade,
             c.credits,
             sem.semesterId,
             sem.semesterNumber
           FROM StudentGrade sg
           JOIN Course c ON c.courseCode = sg.courseCode
           JOIN Semester sem ON sem.semesterId = c.semesterId
           WHERE sg.regno = ?
           ORDER BY sg.gradeId DESC`,
          [regno]
        );

        const latestByCourse = new Map();
        for (const row of gradeRows) {
          if (!latestByCourse.has(row.courseCode)) {
            latestByCourse.set(row.courseCode, row);
          }
        }

        const semRows = buildSemesterPerformance([...latestByCourse.values()]);
        for (const sem of semRows) {
          await conn.query(
            `INSERT INTO StudentSemesterGPA
             (regno, semesterId, gpa, cgpa, earnedCredits, totalCredits, qualityPoints,
              cumulativeEarnedCredits, cumulativeTotalCredits, cumulativeQualityPoints,
              hasOutstandingArrear, cgpaFrozen, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              regno,
              sem.semesterId,
              sem.gpa,
              sem.cgpa,
              r2(sem.semEarnedCredits),
              r2(sem.semTotalCredits),
              r2(sem.semPoints),
              sem.cumulativeEarnedCredits,
              sem.cumulativeTotalCredits,
              sem.cumulativeQualityPoints,
              sem.hasOutstandingArrear ? 1 : 0,
              sem.cgpaFrozen ? 1 : 0,
            ]
          );
          insertedRows += 1;
        }
      }

      await conn.commit();

      const [gradeCountRows] = await conn.query(
        `SELECT COUNT(*) AS cnt
         FROM StudentGrade
         WHERE regno IN (${regnos.map(() => '?').join(',')})`,
        regnos
      );
      const [gpaCountRows] = await conn.query(
        `SELECT COUNT(*) AS cnt
         FROM StudentSemesterGPA
         WHERE regno IN (${regnos.map(() => '?').join(',')})`,
        regnos
      );

      console.log('Seed completed successfully');
      console.log('Target students:', regnos.length);
      console.log('StudentGrade rows (target):', gradeCountRows[0].cnt);
      console.log('StudentSemesterGPA rows (target):', gpaCountRows[0].cnt);
      console.log('Inserted GPA rows this run:', insertedRows);
    } catch (e) {
      await conn.rollback();
      throw e;
    }
  } finally {
    await conn.end();
  }
};

main().catch((err) => {
  console.error('Seed failed:', err.message || err);
  process.exit(1);
});

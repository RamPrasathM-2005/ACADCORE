-- Seed full semester course results (StudentGrade) for the listed cohorts:
-- 1) batch=2023, semester=6, departmentId IN (2,3)
-- 2) batch=2024, semester=4, departmentId=2
--
-- It seeds all courses from Semester 1 up to each student's current semester.
-- Grades are deterministic per (regno, courseCode) and mostly-pass (no U in this seed).

START TRANSACTION;

INSERT INTO GradePoint (grade, point)
VALUES
  ('O', 10),
  ('A+', 9),
  ('A', 8),
  ('B+', 7),
  ('B', 6),
  ('C', 5),
  ('U', 0)
ON DUPLICATE KEY UPDATE
  point = VALUES(point);

DROP TEMPORARY TABLE IF EXISTS target_students;
CREATE TEMPORARY TABLE target_students AS
SELECT
  sd.registerNumber AS regno,
  sd.batch AS batchYear,
  CAST(sd.semester AS UNSIGNED) AS currentSemester,
  sd.departmentId,
  b.batchId
FROM student_details sd
JOIN departments d
  ON d.departmentId = sd.departmentId
JOIN Batch b
  ON CAST(b.batch AS UNSIGNED) = sd.batch
 AND UPPER(CONVERT(b.branch USING utf8mb4)) COLLATE utf8mb4_unicode_ci =
     UPPER(CONVERT(d.Deptacronym USING utf8mb4)) COLLATE utf8mb4_unicode_ci
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
  );

-- Reset old result cache for these students before reseeding.
DELETE FROM StudentSemesterGPA
WHERE regno IN (SELECT regno FROM target_students);

DELETE FROM StudentGrade
WHERE regno IN (SELECT regno FROM target_students);

INSERT INTO StudentGrade (regno, courseCode, grade, createdAt, updatedAt)
SELECT
  ts.regno,
  c.courseCode,
  CASE MOD(CONV(SUBSTRING(MD5(CONCAT(ts.regno, '-', c.courseCode)), 1, 2), 16, 10), 10)
    WHEN 0 THEN 'C'
    WHEN 1 THEN 'C'
    WHEN 2 THEN 'B'
    WHEN 3 THEN 'B'
    WHEN 4 THEN 'B+'
    WHEN 5 THEN 'B+'
    WHEN 6 THEN 'A'
    WHEN 7 THEN 'A'
    WHEN 8 THEN 'A+'
    ELSE 'O'
  END AS grade,
  NOW() AS createdAt,
  NOW() AS updatedAt
FROM target_students ts
JOIN Semester sem
  ON sem.batchId = ts.batchId
 AND sem.semesterNumber BETWEEN 1 AND ts.currentSemester
JOIN Course c
  ON c.semesterId = sem.semesterId
ON DUPLICATE KEY UPDATE
  grade = VALUES(grade),
  updatedAt = VALUES(updatedAt);

COMMIT;

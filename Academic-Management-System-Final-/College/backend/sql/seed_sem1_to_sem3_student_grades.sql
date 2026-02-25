-- Seed Sem 1 to Sem 3 grades for testing Student Dashboard / CGPA pages
-- Uses existing students from student_details (batch = 2023) and courses from Course (semesterId in 1,2,3).
-- It does NOT store credits in StudentGrade (by design); credits are read from Course during GPA/CGPA calculation.

START TRANSACTION;

-- Optional: clear old seeded rows for these semesters before reseeding.
DELETE sg
FROM StudentGrade sg
JOIN Course c ON c.courseCode = sg.courseCode
WHERE c.semesterId IN (1, 2, 3)
  AND sg.regno IN (
    SELECT sd.registerNumber
    FROM student_details sd
    WHERE sd.batch = 2023
  );

-- Insert deterministic grades per student-course pair.
-- Distribution:
-- 0 -> U, 1-2 -> C, 3-4 -> B, 5-6 -> B+, 7 -> A, 8 -> A+, 9 -> O
INSERT INTO StudentGrade (regno, courseCode, grade, createdAt, updatedAt)
SELECT
  sd.registerNumber AS regno,
  c.courseCode,
  CASE MOD(CONV(SUBSTRING(MD5(CONCAT(sd.registerNumber, '-', c.courseCode)), 1, 2), 16, 10), 10)
    WHEN 0 THEN 'U'
    WHEN 1 THEN 'C'
    WHEN 2 THEN 'C'
    WHEN 3 THEN 'B'
    WHEN 4 THEN 'B'
    WHEN 5 THEN 'B+'
    WHEN 6 THEN 'B+'
    WHEN 7 THEN 'A'
    WHEN 8 THEN 'A+'
    ELSE 'O'
  END AS grade,
  NOW() AS createdAt,
  NOW() AS updatedAt
FROM student_details sd
JOIN Course c ON c.semesterId IN (1, 2, 3)
WHERE sd.batch = 2023
ON DUPLICATE KEY UPDATE
  grade = VALUES(grade),
  updatedAt = VALUES(updatedAt);

COMMIT;

-- Note:
-- After running this script, call GPA/CGPA recalculation once (e.g., via grade import flow or GPA endpoints)
-- so StudentSemesterGPA cache rows are refreshed.

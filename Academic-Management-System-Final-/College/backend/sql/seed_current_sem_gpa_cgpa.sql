-- Seed GPA/CGPA for current-semester students (based on your provided cohorts)
-- Cohorts covered:
-- 1) batch=2023, semester=6, departmentId IN (2,3)
-- 2) batch=2024, semester=4, departmentId=2
--
-- Notes:
-- - Uses deterministic GPA/CGPA values derived from registerNumber.
-- - Assumes StudentSemesterGPA.semesterId is the semester number used in your setup.
-- - Safe to re-run (uses upsert via unique key on regno+semesterId).

START TRANSACTION;

INSERT INTO StudentSemesterGPA (
  regno,
  semesterId,
  gpa,
  cgpa,
  earnedCredits,
  totalCredits,
  qualityPoints,
  cumulativeEarnedCredits,
  cumulativeTotalCredits,
  cumulativeQualityPoints,
  hasOutstandingArrear,
  cgpaFrozen,
  createdAt,
  updatedAt
)
SELECT
  sd.registerNumber AS regno,
  CAST(sd.semester AS UNSIGNED) AS semesterId,
  -- 6.50 to 9.50 deterministic GPA
  ROUND(6.50 + (MOD(CONV(SUBSTRING(MD5(sd.registerNumber), 1, 2), 16, 10), 31) / 10), 2) AS gpa,
  -- CGPA close to GPA (0.20-0.60 lower), deterministic
  ROUND(
    (6.50 + (MOD(CONV(SUBSTRING(MD5(sd.registerNumber), 1, 2), 16, 10), 31) / 10)) -
    (0.20 + (MOD(CONV(SUBSTRING(MD5(CONCAT(sd.registerNumber, 'cg')), 1, 2), 16, 10), 5) / 10)),
    2
  ) AS cgpa,
  24.00 AS earnedCredits,
  24.00 AS totalCredits,
  ROUND(
    (6.50 + (MOD(CONV(SUBSTRING(MD5(sd.registerNumber), 1, 2), 16, 10), 31) / 10)) * 24.00,
    2
  ) AS qualityPoints,
  ROUND(CAST(sd.semester AS UNSIGNED) * 24.00, 2) AS cumulativeEarnedCredits,
  ROUND(CAST(sd.semester AS UNSIGNED) * 24.00, 2) AS cumulativeTotalCredits,
  ROUND(
    (
      ROUND(
        (6.50 + (MOD(CONV(SUBSTRING(MD5(sd.registerNumber), 1, 2), 16, 10), 31) / 10)) -
        (0.20 + (MOD(CONV(SUBSTRING(MD5(CONCAT(sd.registerNumber, 'cg')), 1, 2), 16, 10), 5) / 10)),
        2
      )
    ) * (CAST(sd.semester AS UNSIGNED) * 24.00),
    2
  ) AS cumulativeQualityPoints,
  0 AS hasOutstandingArrear,
  0 AS cgpaFrozen,
  NOW() AS createdAt,
  NOW() AS updatedAt
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
ON DUPLICATE KEY UPDATE
  gpa = VALUES(gpa),
  cgpa = VALUES(cgpa),
  earnedCredits = VALUES(earnedCredits),
  totalCredits = VALUES(totalCredits),
  qualityPoints = VALUES(qualityPoints),
  cumulativeEarnedCredits = VALUES(cumulativeEarnedCredits),
  cumulativeTotalCredits = VALUES(cumulativeTotalCredits),
  cumulativeQualityPoints = VALUES(cumulativeQualityPoints),
  hasOutstandingArrear = VALUES(hasOutstandingArrear),
  cgpaFrozen = VALUES(cgpaFrozen),
  updatedAt = VALUES(updatedAt);

COMMIT;

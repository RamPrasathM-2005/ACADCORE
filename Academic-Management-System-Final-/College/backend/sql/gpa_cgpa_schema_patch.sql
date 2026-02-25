-- GPA / CGPA schema patch
-- Run this once on your DB before using the new import/recalculation flow.

-- Keep only the latest grade attempt per (regno, courseCode)
DELETE sg_old
FROM StudentGrade sg_old
JOIN StudentGrade sg_new
  ON sg_old.regno = sg_new.regno
 AND sg_old.courseCode = sg_new.courseCode
 AND sg_old.gradeId < sg_new.gradeId;

-- Keep only the latest GPA row per (regno, semesterId)
DELETE gpa_old
FROM StudentSemesterGPA gpa_old
JOIN StudentSemesterGPA gpa_new
  ON gpa_old.regno = gpa_new.regno
 AND gpa_old.semesterId = gpa_new.semesterId
 AND gpa_old.studentGPAId < gpa_new.studentGPAId;

ALTER TABLE GradePoint
  MODIFY grade VARCHAR(3) NOT NULL;

ALTER TABLE StudentGrade
  MODIFY grade VARCHAR(3) NOT NULL;

ALTER TABLE NptelCreditTransfer
  MODIFY grade VARCHAR(3) NOT NULL;

ALTER TABLE StudentGrade
  ADD UNIQUE KEY uq_student_grade_regno_course_code (regno, courseCode);

ALTER TABLE StudentSemesterGPA
  ADD UNIQUE KEY uq_student_semester_gpa_regno_semester (regno, semesterId);

ALTER TABLE StudentSemesterGPA
  ADD COLUMN earnedCredits DECIMAL(6,2) NOT NULL DEFAULT 0 AFTER cgpa,
  ADD COLUMN totalCredits DECIMAL(6,2) NOT NULL DEFAULT 0 AFTER earnedCredits,
  ADD COLUMN qualityPoints DECIMAL(8,2) NOT NULL DEFAULT 0 AFTER totalCredits,
  ADD COLUMN cumulativeEarnedCredits DECIMAL(7,2) NOT NULL DEFAULT 0 AFTER qualityPoints,
  ADD COLUMN cumulativeTotalCredits DECIMAL(7,2) NOT NULL DEFAULT 0 AFTER cumulativeEarnedCredits,
  ADD COLUMN cumulativeQualityPoints DECIMAL(9,2) NOT NULL DEFAULT 0 AFTER cumulativeTotalCredits,
  ADD COLUMN hasOutstandingArrear TINYINT(1) NOT NULL DEFAULT 0 AFTER cumulativeQualityPoints,
  ADD COLUMN cgpaFrozen TINYINT(1) NOT NULL DEFAULT 0 AFTER hasOutstandingArrear;

-- Optional grade point seed update for 'C'
INSERT INTO GradePoint (grade, point) VALUES ('C', 5)
ON DUPLICATE KEY UPDATE point = VALUES(point);

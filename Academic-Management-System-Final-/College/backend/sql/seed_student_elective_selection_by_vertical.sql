/*
  Seed StudentElectiveSelection by Vertical (domain-consistent allocation)
  -----------------------------------------------------------------------
  What this does:
  1) Takes all target students (defaults: companyId=1, batch=2023, semester=6)
  2) Takes all buckets under one semesterId (set @target_semester_id)
  3) Finds courses in each bucket that belong to each Vertical (via RegulationCourse + VerticalCourse)
  4) Keeps only "eligible" verticals that have a course for EVERY bucket
  5) Assigns each student to one vertical (round-robin)
  6) Inserts one selected course per bucket for that student, all from same vertical

  IMPORTANT:
  - Set @target_semester_id correctly (from ElectiveBucket.semesterId)
  - This script deletes existing selections for target students + target buckets before insert.
*/

START TRANSACTION;

-- ===== INPUTS =====
SET @target_semester_id := 22;  -- Example: 22 (your new buckets 3,4). Use 8 for old buckets 1,2.
SET @target_company_id  := 1;
SET @target_batch       := '2023';
SET @target_sem_number  := 6;
SET @actor_user_id      := 1;   -- createdBy / updatedBy in StudentElectiveSelection

-- Resolve regulation for the semester
SET @target_regulation_id := (
  SELECT b.regulationId
  FROM Semester s
  JOIN Batch b ON b.batchId = s.batchId
  WHERE s.semesterId = @target_semester_id
  LIMIT 1
);

-- Guard checks (manual inspect before running full script in strict env)
SELECT @target_semester_id AS semesterId, @target_regulation_id AS regulationId;

DROP TEMPORARY TABLE IF EXISTS tmp_target_buckets;
CREATE TEMPORARY TABLE tmp_target_buckets AS
SELECT eb.bucketId, eb.bucketNumber
FROM ElectiveBucket eb
WHERE eb.semesterId = @target_semester_id;

DROP TEMPORARY TABLE IF EXISTS tmp_vertical_bucket_courses;
CREATE TEMPORARY TABLE tmp_vertical_bucket_courses AS
SELECT
  tb.bucketId,
  v.verticalId,
  MIN(c.courseId) AS selectedCourseId  -- deterministic pick inside same vertical/bucket
FROM tmp_target_buckets tb
JOIN ElectiveBucketCourse ebc
  ON ebc.bucketId = tb.bucketId
JOIN Course c
  ON c.courseId = ebc.courseId
JOIN RegulationCourse rc
  ON rc.regulationId = @target_regulation_id
 AND rc.courseCode = c.courseCode
JOIN VerticalCourse vc
  ON vc.regCourseId = rc.regCourseId
JOIN Vertical v
  ON v.verticalId = vc.verticalId
 AND v.regulationId = @target_regulation_id
 AND v.isActive = 'YES'
GROUP BY tb.bucketId, v.verticalId;

DROP TEMPORARY TABLE IF EXISTS tmp_eligible_verticals;
CREATE TEMPORARY TABLE tmp_eligible_verticals AS
SELECT vbc.verticalId
FROM tmp_vertical_bucket_courses vbc
GROUP BY vbc.verticalId
HAVING COUNT(DISTINCT vbc.bucketId) = (SELECT COUNT(*) FROM tmp_target_buckets);

DROP TEMPORARY TABLE IF EXISTS tmp_target_students;
CREATE TEMPORARY TABLE tmp_target_students AS
SELECT
  sd.registerNumber AS regno,
  ROW_NUMBER() OVER (ORDER BY sd.registerNumber) AS rn
FROM student_details sd
WHERE sd.companyId = @target_company_id
  AND sd.batch = @target_batch
  AND CAST(sd.semester AS UNSIGNED) = @target_sem_number;

DROP TEMPORARY TABLE IF EXISTS tmp_vertical_ranked;
CREATE TEMPORARY TABLE tmp_vertical_ranked AS
SELECT
  ev.verticalId,
  ROW_NUMBER() OVER (ORDER BY ev.verticalId) AS rn,
  COUNT(*) OVER () AS total_verticals
FROM tmp_eligible_verticals ev;

DROP TEMPORARY TABLE IF EXISTS tmp_student_vertical;
CREATE TEMPORARY TABLE tmp_student_vertical AS
SELECT
  ts.regno,
  vr.verticalId
FROM tmp_target_students ts
JOIN tmp_vertical_ranked vr
  ON vr.rn = ((ts.rn - 1) MOD vr.total_verticals) + 1;

-- Preview counts
SELECT
  (SELECT COUNT(*) FROM tmp_target_students)   AS student_count,
  (SELECT COUNT(*) FROM tmp_target_buckets)    AS bucket_count,
  (SELECT COUNT(*) FROM tmp_eligible_verticals) AS eligible_vertical_count;

-- Remove old rows for same students + same buckets (safe re-run)
DELETE ses
FROM StudentElectiveSelection ses
JOIN tmp_target_students ts ON ts.regno = ses.regno
JOIN tmp_target_buckets tb ON tb.bucketId = ses.bucketId;

-- Insert fresh domain-consistent selections
INSERT INTO StudentElectiveSelection
  (regno, bucketId, selectedCourseId, status, createdBy, updatedBy, createdAt, updatedAt)
SELECT
  sv.regno,
  vbc.bucketId,
  vbc.selectedCourseId,
  'allocated',
  @actor_user_id,
  @actor_user_id,
  NOW(),
  NOW()
FROM tmp_student_vertical sv
JOIN tmp_vertical_bucket_courses vbc
  ON vbc.verticalId = sv.verticalId
ORDER BY sv.regno, vbc.bucketId;

-- Validation: every student should have exactly one row per bucket
SELECT
  ses.regno,
  COUNT(*) AS selections_count
FROM StudentElectiveSelection ses
JOIN tmp_target_students ts ON ts.regno = ses.regno
JOIN tmp_target_buckets tb ON tb.bucketId = ses.bucketId
GROUP BY ses.regno
ORDER BY ses.regno;

COMMIT;


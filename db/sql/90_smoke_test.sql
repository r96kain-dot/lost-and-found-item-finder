USE lost_found_db;

-- Run this after files 01-05 in one MariaDB session on a development database.
-- The sample rows are rolled back at the end. Save the actual results for
-- the test record rather than treating the expected results as proof.
SELECT VERSION() AS server_version,
       @@SESSION.sql_mode AS sql_mode,
       @@SESSION.time_zone AS session_time_zone;

-- Exactly the four agreed tables should be here, with no claims table.
SELECT IF(
  COUNT(*) = 4
  AND SUM(TABLE_NAME IN (
    'item_reports', 'moderators', 'potential_matches', 'activity_logs'
  )) = 4,
  'PASS', 'FAIL'
) AS four_tables_no_claims
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_TYPE = 'BASE TABLE';

START TRANSACTION;

-- RAND() gives this test different references each time. The real backend
-- needs secure random codes and must retry if one already exists.
SET @test_lost_number = CAST(FLOOR(RAND() * 1000000) AS UNSIGNED);
SET @test_found_number = MOD(@test_lost_number + 500000, 1000000);
SET @test_lost_ref = CONCAT('LFIF-', LPAD(@test_lost_number, 6, '0'));
SET @test_found_ref = CONCAT('LFIF-', LPAD(@test_found_number, 6, '0'));

INSERT INTO item_reports (
  reference_code, report_type, item_type, colour, brand_model, area,
  item_date, contact_method, contact_detail, notes
) VALUES (
  @test_lost_ref, 'lost', 'Wallet / Purse', 'Black', NULL, 'Library',
  '2026-10-01', 'email', 'lost@example.invalid', 'Test row only'
);
SET @test_lost_id = LAST_INSERT_ID();

-- Submitting a found report doesn't mean staff have received the item yet.
INSERT INTO item_reports (
  reference_code, report_type, item_type, colour, brand_model, area,
  item_date, contact_method, contact_detail, notes
) VALUES (
  @test_found_ref, 'found', 'Wallet / Purse', 'Black', NULL, 'Library',
  '2026-10-01', 'phone', '0210000000', 'Test row only'
);
SET @test_found_id = LAST_INSERT_ID();
SET @test_receipt_was_null =
  (SELECT received_at IS NULL FROM item_reports
   WHERE report_id = @test_found_id);

INSERT INTO moderators (email, password_hash)
VALUES (CONCAT('smoke+', @test_lost_number, '@example.invalid'),
        'TEST_ONLY_NOT_A_REAL_PASSWORD_HASH');
SET @test_moderator_id = LAST_INSERT_ID();

INSERT INTO activity_logs (report_id, moderator_id, action)
VALUES (@test_lost_id, NULL, 'report_submitted'),
       (@test_found_id, NULL, 'report_submitted');

-- The backend still needs to check that these IDs are lost and found reports.
INSERT INTO potential_matches (
  lost_report_id, found_report_id, automatic_score
) VALUES (@test_lost_id, @test_found_id, 60);
SET @test_match_id = LAST_INSERT_ID();

UPDATE item_reports SET report_status = 'under_review'
WHERE report_id IN (@test_lost_id, @test_found_id);

-- The moderator gives 10 points for the description and approves this pair.
-- Points and the actual decision are stored separately.
UPDATE potential_matches
SET moderator_points = 10, decision = 'approved',
    reviewed_by = @test_moderator_id, reviewed_at = CURRENT_TIMESTAMP
WHERE match_id = @test_match_id;

UPDATE item_reports SET report_status = 'matched'
WHERE report_id IN (@test_lost_id, @test_found_id);

INSERT INTO activity_logs (report_id, match_id, moderator_id, action)
VALUES (@test_lost_id, @test_match_id, @test_moderator_id, 'match_approved'),
       (@test_found_id, @test_match_id, @test_moderator_id, 'match_approved');

-- Staff have the found item now. It can be marked ready to collect after this.
UPDATE item_reports SET received_at = CURRENT_TIMESTAMP
WHERE report_id = @test_found_id;
INSERT INTO activity_logs (report_id, moderator_id, action)
VALUES (@test_found_id, @test_moderator_id, 'item_received');

UPDATE item_reports
SET report_status = 'ready_to_collect',
    collection_instructions = 'Bring your reference and contact details.'
WHERE report_id = @test_lost_id;
UPDATE item_reports SET report_status = 'ready_to_collect'
WHERE report_id = @test_found_id;

-- Passing the claimant check happens before the item is actually handed over.
-- A failed check would be logged without changing the report to collected.
INSERT INTO activity_logs (report_id, moderator_id, action)
VALUES (@test_lost_id, @test_moderator_id, 'claim_verified');

UPDATE item_reports
SET report_status = 'collected', collected_at = CURRENT_TIMESTAMP
WHERE report_id IN (@test_lost_id, @test_found_id);

INSERT INTO activity_logs (report_id, moderator_id, action)
VALUES (@test_lost_id, @test_moderator_id, 'item_collected'),
       (@test_found_id, @test_moderator_id, 'item_collected');

-- Expected: seven PASS values while the test rows are still in the transaction.
SELECT
  IF((SELECT COUNT(*) FROM item_reports
      WHERE report_id IN (@test_lost_id, @test_found_id)
        AND created_at IS NOT NULL) = 2, 'PASS', 'FAIL') AS filed_dates,
  IF(@test_receipt_was_null = 1 AND
     (SELECT COUNT(*) FROM item_reports
      WHERE report_id = @test_found_id AND received_at IS NOT NULL) = 1,
      'PASS', 'FAIL') AS received_after_staff_action,
  IF((SELECT COUNT(*) FROM potential_matches
      WHERE match_id = @test_match_id
        AND automatic_score = 60 AND moderator_points = 10
        AND decision = 'approved' AND reviewed_by = @test_moderator_id) = 1,
      'PASS', 'FAIL') AS approved_70_point_pair,
  IF((SELECT COUNT(*) FROM item_reports
      WHERE report_id IN (@test_lost_id, @test_found_id)
        AND report_status = 'collected' AND collected_at IS NOT NULL) = 2,
      'PASS', 'FAIL') AS both_reports_collected,
  IF((SELECT COUNT(*) FROM activity_logs
      WHERE report_id IN (@test_lost_id, @test_found_id)) = 8,
      'PASS', 'FAIL') AS eight_history_events,
  IF((SELECT COUNT(*) FROM activity_logs
      WHERE match_id = @test_match_id
        AND action = 'match_approved'
        AND report_id IN (@test_lost_id, @test_found_id)
        AND moderator_id = @test_moderator_id) = 2,
      'PASS', 'FAIL') AS both_match_logs_linked,
  IF((SELECT COUNT(*) FROM activity_logs
      WHERE report_id = @test_lost_id AND action = 'claim_verified'
        AND moderator_id = @test_moderator_id) = 1,
      'PASS', 'FAIL') AS verification_audit;

-- Expected: one lost/found pair, 60 + 10 points and an approving moderator.
SELECT m.match_id, lost.reference_code AS lost_reference,
       lost.report_type AS lost_type, found.reference_code AS found_reference,
       found.report_type AS found_type, found.received_at,
       m.automatic_score, m.moderator_points,
       m.automatic_score + m.moderator_points AS total_points,
       m.decision, staff.email AS reviewed_by
FROM potential_matches AS m
JOIN item_reports AS lost ON lost.report_id = m.lost_report_id
JOIN item_reports AS found ON found.report_id = m.found_report_id
JOIN moderators AS staff ON staff.moderator_id = m.reviewed_by
WHERE m.match_id = @test_match_id;

-- Expected: six foreign keys: three for matches and three for activity logs.
SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
  AND TABLE_NAME IN ('potential_matches', 'activity_logs')
ORDER BY TABLE_NAME, COLUMN_NAME;

-- Expected: five CHECK constraints listed. The earlier invalid-row tests
-- showed the tested rules actually reject bad values.
SELECT TABLE_NAME, CONSTRAINT_NAME
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'CHECK'
  AND TABLE_NAME IN ('item_reports', 'potential_matches')
ORDER BY TABLE_NAME, CONSTRAINT_NAME;

ROLLBACK;

-- Expected: four zeroes. No test reports, matches, logs or staff left behind.
SELECT
  (SELECT COUNT(*) FROM item_reports
   WHERE report_id IN (@test_lost_id, @test_found_id)) AS test_reports_remaining,
  (SELECT COUNT(*) FROM potential_matches
   WHERE match_id = @test_match_id) AS test_matches_remaining,
  (SELECT COUNT(*) FROM activity_logs
   WHERE report_id IN (@test_lost_id, @test_found_id)) AS test_logs_remaining,
  (SELECT COUNT(*) FROM moderators
   WHERE moderator_id = @test_moderator_id) AS test_moderators_remaining;
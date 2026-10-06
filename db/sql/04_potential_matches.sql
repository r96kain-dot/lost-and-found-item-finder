USE lost_found_db;

-- This table holds possible matches between a lost report and a found report.
-- A report can have several suggestions while a moderator checks them.
CREATE TABLE potential_matches (
  match_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lost_report_id INT UNSIGNED NOT NULL,
  found_report_id INT UNSIGNED NOT NULL,

  -- Our proposal gives area 25, brand/model 20, date 15, type 10 and
  -- colour 10. That's 80 points max before the moderator looks at it.
  -- DECIMAL gives us room to split points if we decide to later.
  automatic_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,

  -- NULL means it hasn't been scored by a moderator yet. We can settle
  -- on 0/10/20 or 0/5/10/15/20 with Alex without changing this column.
  moderator_points TINYINT UNSIGNED NULL,

  -- This decision is about the suggested match, not item collection.
  decision ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',

  -- The backend fills these in when a moderator makes a decision.
  reviewed_by INT UNSIGNED NULL,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (match_id),

  -- Don't save the exact same lost/found pair twice.
  UNIQUE KEY uq_potential_matches_pair (lost_report_id, found_report_id),
  KEY ix_potential_matches_found_report (found_report_id),
  KEY ix_potential_matches_reviewer (reviewed_by),

  -- Keep the two parts of the score within their agreed limits.
  CONSTRAINT chk_matches_automatic_score
    CHECK (automatic_score BETWEEN 0 AND 80),
  CONSTRAINT chk_matches_moderator_points
    CHECK (moderator_points IS NULL OR moderator_points <= 20),

  -- These IDs must point to reports and moderators that actually exist.
  -- RESTRICT stops us deleting a record that a match still uses.
  CONSTRAINT fk_matches_lost_report
    FOREIGN KEY (lost_report_id) REFERENCES item_reports (report_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_matches_found_report
    FOREIGN KEY (found_report_id) REFERENCES item_reports (report_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_matches_reviewer
    FOREIGN KEY (reviewed_by) REFERENCES moderators (moderator_id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A foreign key checks that a report exists, but it can't tell whether that
-- report is lost or found. The backend checks the types and the two IDs.
-- It also keeps the review fields empty while pending and records who made
-- an approval or rejection. Rejecting one pair leaves other matches open.
-- Approval still isn't proof of ownership; verification happens at pickup.
-- If one found report has several suggestions, we must never hand it to
-- two different people.
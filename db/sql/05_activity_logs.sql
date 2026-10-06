USE lost_found_db;

-- This is the history for a report. Each row is one thing that happened.
-- If a match decision affects both reports, add a log row for each one
-- using the same match_id.
CREATE TABLE activity_logs (
  log_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id INT UNSIGNED NOT NULL,
  match_id INT UNSIGNED NULL,
  moderator_id INT UNSIGNED NULL,
  action VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (log_id),
  KEY ix_activity_logs_report_time (report_id, created_at),
  KEY ix_activity_logs_match (match_id),
  KEY ix_activity_logs_moderator (moderator_id),
  CONSTRAINT fk_activity_logs_report
    FOREIGN KEY (report_id) REFERENCES item_reports (report_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_activity_logs_match
    FOREIGN KEY (match_id) REFERENCES potential_matches (match_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_activity_logs_moderator
    FOREIGN KEY (moderator_id) REFERENCES moderators (moderator_id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A public report submission has no moderator_id because reporters
-- don't have accounts. Staff actions should record the moderator.
-- Start with: report_submitted, item_received, match_approved,
-- match_rejected, claim_verified, claim_verification_failed, item_collected.
-- Keep these action names consistent in the backend. VARCHAR lets us
-- add another action later without changing the table.
-- A failed claimant check gets logged but doesn't change the report status.
-- Passing the check and actually handing over the item are separate actions.
-- We only log the result of the ID check, not an ID scan or number.
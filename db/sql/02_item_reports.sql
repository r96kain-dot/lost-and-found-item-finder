USE lost_found_db;

-- Each row is a report someone submitted, whether they lost or found the item.
-- Reporters don't have accounts, so they use the public code and their contact
-- detail to check progress. We need to limit repeated lookup attempts.
CREATE TABLE item_reports (
  -- This number is for links between our tables, not for public tracking.
  report_id INT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- LFIF- plus six digits is 11 characters. The backend makes the code
  -- and tries another one if it happens to generate a duplicate.
  reference_code VARCHAR(11) NOT NULL,

  report_type ENUM('lost', 'found') NOT NULL,
  item_type VARCHAR(80) NOT NULL,
  colour VARCHAR(50) NOT NULL,
  brand_model VARCHAR(120) NULL,
  area VARCHAR(120) NOT NULL,
  item_date DATE NOT NULL,

  -- Save the option they picked on the form instead of guessing from the text.
  contact_method ENUM('phone', 'email') NOT NULL,
  contact_detail VARCHAR(255) NOT NULL,
  notes TEXT NULL,

  -- We're using Head Office as the hand-in point for now. If we end up with
  -- more locations, we'll need to update this table and the form together.
  -- Submitting a found report doesn't mean staff have the item yet.
  received_at TIMESTAMP NULL DEFAULT NULL,

  -- Keep one optional item photo in a private local uploads folder.
  -- This just stores its generated filename, not the photo itself.
  photo_key VARCHAR(255) NULL,

  -- Only fill this in if staff need to give different pickup instructions.
  -- The usual Head Office address and hours live in one shared app setting.
  collection_instructions VARCHAR(500) NULL,

  -- This is the report's status. Approving or rejecting a suggested match
  -- happens in potential_matches, so one rejection doesn't close the report.
  report_status ENUM(
    'submitted', 'under_review', 'matched',
    'ready_to_collect', 'collected', 'closed'
  ) NOT NULL DEFAULT 'submitted',

  -- Set this when the item is actually handed over, along with the collected
  -- status and an item_collected log entry. It also helps with photo cleanup.
  collected_at TIMESTAMP NULL DEFAULT NULL,

  -- item_date is when it was lost/found; created_at is when we got the report.
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (report_id),
  UNIQUE KEY uq_item_reports_reference_code (reference_code),

  -- These help when filtering reports or showing the newest ones.
  KEY ix_item_reports_type_status (report_type, report_status),
  KEY ix_item_reports_created_at (created_at),

  -- Only a found report can have a hand-in time.
  CONSTRAINT chk_reports_received_found_only
    CHECK (received_at IS NULL OR report_type = 'found'),

  -- A found item can't be ready for pickup before staff receive it.
  CONSTRAINT chk_reports_found_at_office_before_collection
    CHECK (report_type <> 'found'
      OR report_status NOT IN ('ready_to_collect', 'collected')
      OR received_at IS NOT NULL),

  -- If the status says collected, we need the handover time too.
  CONSTRAINT chk_reports_collection_time
    CHECK ((report_status = 'collected' AND collected_at IS NOT NULL)
      OR (report_status <> 'collected' AND collected_at IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The backend still needs to check the phone/email, make the exact LFIF code,
-- allow only sensible status changes, and limit public lookup attempts.
-- If we undo a mistaken handover, clear collected_at but keep the earlier
-- collection and verification events in activity_logs.
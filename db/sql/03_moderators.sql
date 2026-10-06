USE lost_found_db;

-- For now, moderators are the ones with accounts. Reporters check their
-- reports using the LFIF code and the contact detail they gave us.
CREATE TABLE moderators (
  -- This ID is what the other tables use to link an action to a moderator.
  moderator_id INT UNSIGNED NOT NULL AUTO_INCREMENT,

  email VARCHAR(255) NOT NULL,

  -- The backend must hash the password before saving it here.
  -- Don't put the password itself in this column.
  password_hash VARCHAR(255) NOT NULL,

  -- The database fills this in when the moderator account is created.
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (moderator_id),

  -- Email is the AK in our diagram: another unique way to identify
  -- a moderator, while moderator_id stays the primary key.
  UNIQUE KEY uq_moderators_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
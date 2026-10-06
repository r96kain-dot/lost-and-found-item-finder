-- Run this file first, table files expect lost_found_db to exist
-- Used IF NOT EXISTS to let this file run again when the database already exists
CREATE DATABASE IF NOT EXISTS lost_found_db
-- Unicode support
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE lost_found_db;

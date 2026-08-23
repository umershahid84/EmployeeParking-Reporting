-- Employee Parking Daily Reporting Application
-- MariaDB schema
--
-- This file assumes the target database (DB_NAME) already exists and the
-- connection is using it - scripts/migrate.js creates the database (named
-- from the DB_NAME environment variable) and selects it before applying
-- this file, so no CREATE DATABASE / USE statements are hardcoded here.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

INSERT IGNORE INTO roles (name) VALUES ('supervisor'), ('manager'), ('administrator');

-- ---------------------------------------------------------------------------
-- Shifts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shifts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

INSERT IGNORE INTO shifts (name) VALUES ('Day'), ('Swing'), ('Graveyard'), ('Bridge');

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_id INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Drivers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drivers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  driver_name VARCHAR(150) NOT NULL,
  employee_id VARCHAR(50) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Shuttles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shuttles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  shuttle_number VARCHAR(50) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Daily Reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_reports (
  id INT PRIMARY KEY AUTO_INCREMENT,
  report_date DATE NOT NULL,
  shift_id INT NOT NULL,
  supervisor_id INT NOT NULL,
  status ENUM('draft', 'submitted', 'edited', 'reviewed') NOT NULL DEFAULT 'draft',
  bus_issues TEXT NULL,
  significant_activity TEXT NULL,
  notes TEXT NULL,
  submitted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id) REFERENCES shifts(id),
  FOREIGN KEY (supervisor_id) REFERENCES users(id),
  INDEX idx_report_date (report_date),
  INDEX idx_shift (shift_id),
  INDEX idx_supervisor (supervisor_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Incoming Supervisors (multi-select handoff for a report)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_incoming_supervisors (
  id INT PRIMARY KEY AUTO_INCREMENT,
  report_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uniq_report_incoming_supervisor (report_id, user_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Driver Call-Outs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_callouts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  report_id INT NOT NULL,
  shuttle_id INT NULL,
  driver_id INT NULL,
  notes VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (shuttle_id) REFERENCES shuttles(id),
  FOREIGN KEY (driver_id) REFERENCES drivers(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Shift Coverage
--   'ot'          - shift covered with overtime: shuttle_id + driver_id
--   'moved'       - driver moved from another shuttle: shuttle_id + driver_id + original_shuttle_id
--   'not_covered' - shift not covered due to a bus issue: shuttle_id only (no driver)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shift_coverage (
  id INT PRIMARY KEY AUTO_INCREMENT,
  report_id INT NOT NULL,
  coverage_type ENUM('ot', 'moved', 'not_covered') NOT NULL,
  shuttle_id INT NULL,
  driver_id INT NULL,
  original_shuttle_id INT NULL,
  notes VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (shuttle_id) REFERENCES shuttles(id),
  FOREIGN KEY (driver_id) REFERENCES drivers(id),
  FOREIGN KEY (original_shuttle_id) REFERENCES shuttles(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Work Orders Placed
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  report_id INT NOT NULL,
  location ENUM('LOT - A', 'LOT - C', 'North Employee Parking Lot') NOT NULL,
  comments TEXT NULL,
  user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Manager / Admin Comments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_comments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  report_id INT NOT NULL,
  user_id INT NOT NULL,
  comment TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Report Edit History (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  report_id INT NOT NULL,
  user_id INT NOT NULL,
  action VARCHAR(100) NOT NULL,
  field_changed VARCHAR(100) NULL,
  previous_value TEXT NULL,
  new_value TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES daily_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Audit Logs (system-wide)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NULL,
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100) NULL,
  entity_id INT NULL,
  details TEXT NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_action (action)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Password Reset Codes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_codes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  used TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_prc_user (user_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Account Setup / Reset Tokens
-- Used both for a brand-new user's first sign-in and for an admin-triggered
-- account reset. A one-time link, never a plain-text password, is emailed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_setup_tokens (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  purpose ENUM('initial_setup', 'admin_reset') NOT NULL DEFAULT 'initial_setup',
  expires_at DATETIME NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ast_user (user_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Email Notification Recipients (managed via the Admin Portal, not code)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_recipients (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(190) NOT NULL,
  notification_type VARCHAR(50) NOT NULL DEFAULT 'daily_report',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_email_recipient (email, notification_type)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Email Delivery Log (audit trail of every email the app sends/attempts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email_type VARCHAR(50) NOT NULL,
  recipient_email VARCHAR(190) NOT NULL,
  related_entity VARCHAR(50) NULL,
  related_id INT NULL,
  status ENUM('sent', 'failed', 'skipped') NOT NULL,
  error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_log_type (email_type),
  INDEX idx_email_log_related (related_entity, related_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Seed an initial administrator (password must be reset on first login;
-- default password hash below corresponds to "ChangeMe123!" — CHANGE IMMEDIATELY)
-- ---------------------------------------------------------------------------
-- Run scripts/seedAdmin.js instead of inserting a hash by hand.

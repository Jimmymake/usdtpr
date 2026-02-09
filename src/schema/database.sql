-- USDT Payment Processor Database Schema
-- Run this script to create the database and tables

-- Create database
CREATE DATABASE IF NOT EXISTS usdtpr;
USE usdtpr;

-- Users table with balance
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  balance_kes DECIMAL(18, 2) DEFAULT 0.00,
  referral_code VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_phone (phone),
  INDEX idx_username (username)
);

-- Deposits table (USDT deposits)
CREATE TABLE IF NOT EXISTS deposits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  
  -- Transaction details from blockchain
  tx_hash VARCHAR(64) NOT NULL UNIQUE,
  from_address VARCHAR(50),
  to_address VARCHAR(50),
  
  -- Amounts
  usdt_amount DECIMAL(18, 6) NOT NULL DEFAULT 0,
  exchange_rate DECIMAL(18, 4) NOT NULL DEFAULT 0,
  kes_amount DECIMAL(18, 2) NOT NULL DEFAULT 0,
  
  -- Status tracking
  status ENUM('pending', 'verifying', 'completed', 'failed', 'rejected') DEFAULT 'pending',
  failure_reason VARCHAR(255),
  
  -- Blockchain data
  block_timestamp BIGINT,
  
  -- Audit fields
  ip_address VARCHAR(45),
  user_agent TEXT,
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_tx_hash (tx_hash),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);

-- Exchange rates table (for future use if rates become dynamic)
CREATE TABLE IF NOT EXISTS exchange_rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_currency VARCHAR(10) NOT NULL,
  to_currency VARCHAR(10) NOT NULL,
  rate DECIMAL(18, 4) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_currency_pair (from_currency, to_currency)
);

-- Insert default exchange rate
INSERT INTO exchange_rates (from_currency, to_currency, rate, is_active) 
VALUES ('USDT', 'KES', 130.0000, true)
ON DUPLICATE KEY UPDATE rate = VALUES(rate);

-- Transactions log table (for all balance changes)
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('deposit', 'withdrawal', 'bet', 'win', 'bonus', 'refund') NOT NULL,
  amount DECIMAL(18, 2) NOT NULL,
  balance_before DECIMAL(18, 2) NOT NULL,
  balance_after DECIMAL(18, 2) NOT NULL,
  reference_id INT,
  reference_type VARCHAR(50),
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_type (type),
  INDEX idx_created_at (created_at)
);

-- Processed transaction hashes (extra safety against duplicates)
CREATE TABLE IF NOT EXISTS processed_tx_hashes (
  tx_hash VARCHAR(64) PRIMARY KEY,
  deposit_id INT NOT NULL,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (deposit_id) REFERENCES deposits(id) ON DELETE CASCADE
);


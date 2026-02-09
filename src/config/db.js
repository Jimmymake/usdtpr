const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file path
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/usdtpr.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create database connection
const db = new Database(DB_PATH, { 
  verbose: process.env.NODE_ENV === 'development' ? console.log : null 
});

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
const initializeDatabase = () => {
  const schema = `
    -- Users table with balance and HD wallet address
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      balance_kes REAL DEFAULT 0.00,
      referral_code TEXT,
      tron_address TEXT UNIQUE,
      derivation_index INTEGER UNIQUE,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Deposits table (USDT deposits)
    CREATE TABLE IF NOT EXISTS deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tx_hash TEXT NOT NULL UNIQUE,
      from_address TEXT,
      to_address TEXT,
      usdt_amount REAL DEFAULT 0,
      exchange_rate REAL DEFAULT 0,
      kes_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'verifying', 'completed', 'failed', 'rejected')),
      failure_reason TEXT,
      block_timestamp INTEGER,
      ip_address TEXT,
      user_agent TEXT,
      verified_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Exchange rates table
    CREATE TABLE IF NOT EXISTS exchange_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_currency TEXT NOT NULL,
      to_currency TEXT NOT NULL,
      rate REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(from_currency, to_currency)
    );

    -- Transactions log table (for all balance changes)
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal', 'bet', 'win', 'bonus', 'refund')),
      amount REAL NOT NULL,
      balance_before REAL NOT NULL,
      balance_after REAL NOT NULL,
      reference_id INTEGER,
      reference_type TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Processed transaction hashes (extra safety against duplicates)
    CREATE TABLE IF NOT EXISTS processed_tx_hashes (
      tx_hash TEXT PRIMARY KEY,
      deposit_id INTEGER NOT NULL,
      processed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (deposit_id) REFERENCES deposits(id) ON DELETE CASCADE
    );

    -- Wallet configuration table (for tracking next derivation index)
    CREATE TABLE IF NOT EXISTS wallet_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      next_derivation_index INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Sweeps table (for tracking fund consolidation)
    CREATE TABLE IF NOT EXISTS sweeps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      usdt_amount REAL NOT NULL,
      tx_hash TEXT UNIQUE,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Withdrawals table (for tracking user withdrawals)
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      to_address TEXT NOT NULL,
      kes_amount REAL NOT NULL,
      usdt_amount REAL NOT NULL,
      exchange_rate REAL NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed')),
      tx_hash TEXT UNIQUE,
      failure_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      failed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_tron_address ON users(tron_address);
    CREATE INDEX IF NOT EXISTS idx_deposits_tx_hash ON deposits(tx_hash);
    CREATE INDEX IF NOT EXISTS idx_deposits_user_id ON deposits(user_id);
    CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);
    CREATE INDEX IF NOT EXISTS idx_deposits_to_address ON deposits(to_address);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
  `;

  // Execute schema
  db.exec(schema);

  // Migration for existing databases: Add tron_address and derivation_index columns if they don't exist
  const userColumns = db.prepare("PRAGMA table_info(users)").all();
  const columnNames = userColumns.map(col => col.name);
  
  if (!columnNames.includes('tron_address')) {
    // For existing databases, add without UNIQUE (can't add UNIQUE via ALTER TABLE in SQLite)
    db.exec('ALTER TABLE users ADD COLUMN tron_address TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tron_address_unique ON users(tron_address)');
    console.log('✅ Added tron_address column to users table');
  }
  
  if (!columnNames.includes('derivation_index')) {
    db.exec('ALTER TABLE users ADD COLUMN derivation_index INTEGER');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_derivation_index_unique ON users(derivation_index)');
    console.log('✅ Added derivation_index column to users table');
  }

  // Initialize wallet_config if not exists
  const walletConfig = db.prepare('SELECT id FROM wallet_config WHERE id = 1').get();
  if (!walletConfig) {
    // Count existing users to set the starting index
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    db.prepare('INSERT INTO wallet_config (id, next_derivation_index) VALUES (1, ?)').run(userCount.count);
    console.log(`✅ Wallet config initialized with next_derivation_index: ${userCount.count}`);
  }

  // Insert default exchange rate if not exists
  const existingRate = db.prepare(
    'SELECT id FROM exchange_rates WHERE from_currency = ? AND to_currency = ?'
  ).get('USDT', 'KES');

  if (!existingRate) {
    db.prepare(
      'INSERT INTO exchange_rates (from_currency, to_currency, rate, is_active) VALUES (?, ?, ?, 1)'
    ).run('USDT', 'KES', parseFloat(process.env.USDT_TO_KES_RATE) || 130);
  }

  console.log('✅ Database initialized successfully');
};

// Initialize on load
initializeDatabase();

module.exports = db;

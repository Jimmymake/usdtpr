/**
 * Deposit Monitor Service
 * Automatically monitors user wallet addresses for incoming USDT deposits
 * and credits their accounts when deposits are confirmed
 */

const db = require('../config/db');
const tronService = require('./tronService');

const USDT_TO_KES_RATE = parseFloat(process.env.USDT_TO_KES_RATE) || 130;
const MIN_DEPOSIT = parseFloat(process.env.MIN_DEPOSIT_USDT) || 0.1;
const MAX_DEPOSIT = parseFloat(process.env.MAX_DEPOSIT_USDT) || 10000;

// Monitor configuration
const POLL_INTERVAL_MS = parseInt(process.env.DEPOSIT_POLL_INTERVAL_MS) || 30000; // 30 seconds default
const BATCH_SIZE = parseInt(process.env.DEPOSIT_MONITOR_BATCH_SIZE) || 50; // Users per batch

let isRunning = false;
let pollInterval = null;

/**
 * Process a single deposit transaction
 * @param {object} tx - Transaction data
 * @param {object} user - User data
 * @returns {Promise<object>} Result
 */
const processDeposit = async (tx, user) => {
  const { transaction_id: txHash, value, block_timestamp: blockTimestamp, from } = tx;
  
  // Calculate USDT amount (6 decimals)
  const usdtAmount = Number(value) / 1_000_000;
  
  // Check minimum deposit
  if (usdtAmount < MIN_DEPOSIT) {
    console.log(`⚠️ Deposit ${txHash} below minimum (${usdtAmount} < ${MIN_DEPOSIT} USDT)`);
    
    // Record as rejected but don't fail
    db.prepare(
      `INSERT OR IGNORE INTO deposits (user_id, tx_hash, from_address, to_address, usdt_amount, exchange_rate, kes_amount, status, failure_reason, block_timestamp)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'rejected', ?, ?)`
    ).run(user.id, txHash, from, user.tron_address, usdtAmount, USDT_TO_KES_RATE, `Amount below minimum (${MIN_DEPOSIT} USDT)`, blockTimestamp);
    
    return { credited: false, reason: 'below_minimum' };
  }
  
  // Check maximum deposit
  if (usdtAmount > MAX_DEPOSIT) {
    console.log(`⚠️ Deposit ${txHash} above maximum (${usdtAmount} > ${MAX_DEPOSIT} USDT)`);
    
    db.prepare(
      `INSERT OR IGNORE INTO deposits (user_id, tx_hash, from_address, to_address, usdt_amount, exchange_rate, kes_amount, status, failure_reason, block_timestamp)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'rejected', ?, ?)`
    ).run(user.id, txHash, from, user.tron_address, usdtAmount, USDT_TO_KES_RATE, `Amount above maximum (${MAX_DEPOSIT} USDT)`, blockTimestamp);
    
    return { credited: false, reason: 'above_maximum' };
  }
  
  // Calculate KES amount
  const kesAmount = usdtAmount * USDT_TO_KES_RATE;
  
  // Credit user (atomic transaction)
  const creditUser = db.transaction(() => {
    // Check if already processed
    const existing = db.prepare('SELECT id FROM processed_tx_hashes WHERE tx_hash = ?').get(txHash);
    if (existing) {
      return { alreadyProcessed: true };
    }
    
    // Get current balance
    const currentUser = db.prepare('SELECT balance_kes FROM users WHERE id = ?').get(user.id);
    const currentBalance = parseFloat(currentUser.balance_kes);
    const newBalance = currentBalance + kesAmount;
    
    // Update user balance
    db.prepare('UPDATE users SET balance_kes = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(newBalance, user.id);
    
    // Create deposit record
    const depositResult = db.prepare(
      `INSERT INTO deposits (user_id, tx_hash, from_address, to_address, usdt_amount, exchange_rate, kes_amount, status, block_timestamp, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, datetime('now'))`
    ).run(user.id, txHash, from, user.tron_address, usdtAmount, USDT_TO_KES_RATE, kesAmount, blockTimestamp);
    
    const depositId = depositResult.lastInsertRowid;
    
    // Record in transactions log
    db.prepare(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_id, reference_type, description)
       VALUES (?, 'deposit', ?, ?, ?, ?, 'deposit', ?)`
    ).run(user.id, kesAmount, currentBalance, newBalance, depositId, `USDT deposit: ${usdtAmount} USDT @ ${USDT_TO_KES_RATE}`);
    
    // Mark tx as processed
    db.prepare('INSERT INTO processed_tx_hashes (tx_hash, deposit_id) VALUES (?, ?)')
      .run(txHash, depositId);
    
    return {
      alreadyProcessed: false,
      depositId,
      kesAmount,
      newBalance,
    };
  });
  
  const result = creditUser();
  
  if (result.alreadyProcessed) {
    return { credited: false, reason: 'already_processed' };
  }
  
  console.log(`✅ Auto-credited ${usdtAmount} USDT (${kesAmount} KES) to user ${user.id} (${user.username})`);
  
  return {
    credited: true,
    depositId: result.depositId,
    usdtAmount,
    kesAmount: result.kesAmount,
    newBalance: result.newBalance,
  };
};

/**
 * Check deposits for a batch of users
 * @param {array} users - Array of user objects with tron_address
 */
const checkUserDeposits = async (users) => {
  for (const user of users) {
    if (!user.tron_address) continue;
    
    try {
      // Get recent TRC20 transactions for this address
      const transactions = await tronService.getAddressTransactions(user.tron_address, {
        limit: 20, // Check last 20 transactions
      });
      
      // Handle case where transactions is null or undefined (API error)
      if (!transactions || !Array.isArray(transactions)) {
        // Silently skip - error already logged in tronService
        continue;
      }
      
      // Filter for incoming transactions (where user's address is recipient)
      const incomingTx = transactions.filter(tx => tx && tx.to === user.tron_address);
      
      for (const tx of incomingTx) {
        // Check if already processed
        const existing = db.prepare('SELECT id FROM processed_tx_hashes WHERE tx_hash = ?').get(tx.txHash);
        
        if (!existing) {
          await processDeposit({
            transaction_id: tx.txHash,
            value: tx.value,
            block_timestamp: tx.blockTimestamp,
            from: tx.from,
          }, user);
        }
      }
    } catch (error) {
      console.error(`Error checking deposits for user ${user.id}:`, error.message);
    }
  }
};

/**
 * Run one monitoring cycle
 */
const runMonitorCycle = async () => {
  if (!isRunning) return;
  
  try {
    // Get all users with tron addresses in batches
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE tron_address IS NOT NULL').get();
    
    if (totalUsers.count === 0) {
      return;
    }
    
    let offset = 0;
    
    while (offset < totalUsers.count && isRunning) {
      const users = db.prepare(
        'SELECT id, username, tron_address FROM users WHERE tron_address IS NOT NULL AND is_active = 1 LIMIT ? OFFSET ?'
      ).all(BATCH_SIZE, offset);
      
      await checkUserDeposits(users);
      
      offset += BATCH_SIZE;
      
      // Small delay between batches to avoid rate limiting
      if (offset < totalUsers.count) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error('Deposit monitor cycle error:', error.message);
  }
};

/**
 * Start the deposit monitor
 */
const start = () => {
  if (isRunning) {
    console.log('Deposit monitor is already running');
    return;
  }
  
  // Check if HD wallet is configured
  const hdWallet = require('./hdWalletService');
  const config = hdWallet.validateConfig();
  
  if (!config.valid) {
    console.log('⚠️ HD Wallet not configured - deposit monitor disabled');
    console.log('   Set HD_MASTER_MNEMONIC environment variable to enable auto-deposits');
    return;
  }
  
  isRunning = true;
  console.log(`🔍 Deposit monitor started (polling every ${POLL_INTERVAL_MS / 1000}s)`);
  
  // Run first cycle immediately
  runMonitorCycle();
  
  // Then run on interval
  pollInterval = setInterval(runMonitorCycle, POLL_INTERVAL_MS);
};

/**
 * Stop the deposit monitor
 */
const stop = () => {
  if (!isRunning) {
    console.log('Deposit monitor is not running');
    return;
  }
  
  isRunning = false;
  
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  
  console.log('🛑 Deposit monitor stopped');
};

/**
 * Get monitor status
 */
const getStatus = () => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE tron_address IS NOT NULL').get();
  
  return {
    running: isRunning,
    pollIntervalMs: POLL_INTERVAL_MS,
    batchSize: BATCH_SIZE,
    monitoredAddresses: totalUsers.count,
  };
};

/**
 * Manually check deposits for a specific user (useful for debugging)
 * @param {number} userId - User ID
 */
const checkUserById = async (userId) => {
  const user = db.prepare('SELECT id, username, tron_address FROM users WHERE id = ?').get(userId);
  
  if (!user || !user.tron_address) {
    return { error: 'User not found or has no deposit address' };
  }
  
  await checkUserDeposits([user]);
  return { success: true, address: user.tron_address };
};

module.exports = {
  start,
  stop,
  getStatus,
  checkUserById,
  processDeposit,
};

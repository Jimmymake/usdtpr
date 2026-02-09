/**
 * Withdrawal Service
 * Handles USDT withdrawals from user KES balance
 */

const TronWeb = require('tronweb');
const db = require('../config/db');

const TRON_API_URL = process.env.TRON_API_URL || 'https://api.trongrid.io';
const TRON_API_KEY = process.env.TRON_API_KEY;
const USDT_CONTRACT = process.env.USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const MASTER_WALLET_PRIVATE_KEY = process.env.MASTER_WALLET_PRIVATE_KEY; // Private key for master wallet
const MASTER_WALLET_ADDRESS = process.env.DEPOSIT_ADDRESS; // Master wallet address
const USDT_TO_KES_RATE = parseFloat(process.env.USDT_TO_KES_RATE) || 130;
const MIN_WITHDRAWAL_USDT = parseFloat(process.env.MIN_WITHDRAWAL_USDT) || 1;
const MAX_WITHDRAWAL_USDT = parseFloat(process.env.MAX_WITHDRAWAL_USDT) || 10000;

/**
 * Create TronWeb instance with master wallet private key
 */
const createTronWeb = () => {
  if (!MASTER_WALLET_PRIVATE_KEY) {
    throw new Error('MASTER_WALLET_PRIVATE_KEY not configured in environment variables');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (TRON_API_KEY && TRON_API_KEY.trim() !== '') {
    headers['TRON-PRO-API-KEY'] = TRON_API_KEY;
  }

  return new TronWeb({
    fullHost: TRON_API_URL,
    headers,
    privateKey: MASTER_WALLET_PRIVATE_KEY,
  });
};

/**
 * Get USDT balance of master wallet
 */
const getMasterWalletBalance = async () => {
  try {
    const tronWeb = createTronWeb();
    const contract = await tronWeb.contract().at(USDT_CONTRACT);
    const balance = await contract.methods.balanceOf(MASTER_WALLET_ADDRESS).call();
    return Number(balance) / 1_000_000; // USDT has 6 decimals
  } catch (error) {
    console.error('Error getting master wallet balance:', error.message);
    throw new Error('Failed to check master wallet balance');
  }
};

/**
 * Get TRX balance of master wallet (for gas)
 */
const getMasterTrxBalance = async () => {
  try {
    const tronWeb = createTronWeb();
    const balance = await tronWeb.trx.getBalance(MASTER_WALLET_ADDRESS);
    return balance / 1_000_000; // Convert sun to TRX
  } catch (error) {
    console.error('Error getting master TRX balance:', error.message);
    return 0;
  }
};

/**
 * Send USDT from master wallet to user address
 * @param {string} toAddress - Recipient address
 * @param {number} usdtAmount - Amount in USDT
 * @returns {Promise<object>} Transaction result
 */
const sendUsdt = async (toAddress, usdtAmount) => {
  try {
    // Validate address format
    if (!toAddress || typeof toAddress !== 'string' || !toAddress.startsWith('T') || toAddress.length !== 34) {
      throw new Error('Invalid Tron address format');
    }

    // Check master wallet balance
    const masterBalance = await getMasterWalletBalance();
    if (masterBalance < usdtAmount) {
      throw new Error(`Insufficient master wallet balance. Available: ${masterBalance} USDT, Required: ${usdtAmount} USDT`);
    }

    // Check TRX balance for gas
    const trxBalance = await getMasterTrxBalance();
    if (trxBalance < 10) {
      throw new Error(`Insufficient TRX for gas. Available: ${trxBalance} TRX, Needs: ~10 TRX`);
    }

    // Create TronWeb instance
    const tronWeb = createTronWeb();

    // Get USDT contract
    const contract = await tronWeb.contract().at(USDT_CONTRACT);

    // Convert amount to smallest unit (6 decimals)
    const amountInSun = Math.floor(usdtAmount * 1_000_000);

    // Send USDT
    const tx = await contract.methods.transfer(toAddress, amountInSun).send({
      feeLimit: 100_000_000, // 100 TRX max fee
      callValue: 0,
    });

    console.log(`✅ Sent ${usdtAmount} USDT to ${toAddress} - TX: ${tx}`);

    return {
      success: true,
      txHash: tx,
      amount: usdtAmount,
      from: MASTER_WALLET_ADDRESS,
      to: toAddress,
    };
  } catch (error) {
    console.error('Error sending USDT:', error.message);
    throw error;
  }
};

/**
 * Process withdrawal request
 * @param {number} userId - User ID
 * @param {string} toAddress - Recipient Tron address
 * @param {number} kesAmount - Amount in KES to withdraw
 * @returns {Promise<object>} Withdrawal result
 */
const processWithdrawal = async (userId, toAddress, kesAmount) => {
  // Validate amount
  if (kesAmount < MIN_WITHDRAWAL_USDT * USDT_TO_KES_RATE) {
    throw new Error(`Minimum withdrawal is ${MIN_WITHDRAWAL_USDT} USDT (${MIN_WITHDRAWAL_USDT * USDT_TO_KES_RATE} KES)`);
  }

  if (kesAmount > MAX_WITHDRAWAL_USDT * USDT_TO_KES_RATE) {
    throw new Error(`Maximum withdrawal is ${MAX_WITHDRAWAL_USDT} USDT (${MAX_WITHDRAWAL_USDT * USDT_TO_KES_RATE} KES)`);
  }

  // Convert KES to USDT
  const usdtAmount = kesAmount / USDT_TO_KES_RATE;

  // Validate USDT amount
  if (usdtAmount < MIN_WITHDRAWAL_USDT) {
    throw new Error(`Minimum withdrawal is ${MIN_WITHDRAWAL_USDT} USDT`);
  }

  if (usdtAmount > MAX_WITHDRAWAL_USDT) {
    throw new Error(`Maximum withdrawal is ${MAX_WITHDRAWAL_USDT} USDT`);
  }

  // Process withdrawal (atomic transaction)
  const processWithdrawalTx = db.transaction(() => {
    // Get user balance
    const user = db.prepare('SELECT balance_kes FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const currentBalance = parseFloat(user.balance_kes);

    // Check sufficient balance
    if (currentBalance < kesAmount) {
      throw new Error(`Insufficient balance. Available: ${currentBalance.toFixed(2)} KES, Requested: ${kesAmount.toFixed(2)} KES`);
    }

    // Calculate new balance
    const newBalance = currentBalance - kesAmount;

    // Update user balance
    db.prepare('UPDATE users SET balance_kes = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(newBalance, userId);

    // Create withdrawal record
    const withdrawalResult = db.prepare(
      `INSERT INTO withdrawals (user_id, to_address, kes_amount, usdt_amount, exchange_rate, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))`
    ).run(userId, toAddress, kesAmount, usdtAmount, USDT_TO_KES_RATE);

    const withdrawalId = withdrawalResult.lastInsertRowid;

    // Record transaction
    db.prepare(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_id, reference_type, description)
       VALUES (?, 'withdrawal', ?, ?, ?, ?, 'withdrawal', ?)`
    ).run(
      userId,
      kesAmount,
      currentBalance,
      newBalance,
      withdrawalId,
      `USDT withdrawal: ${usdtAmount.toFixed(6)} USDT @ ${USDT_TO_KES_RATE}`
    );

    return {
      withdrawalId,
      currentBalance,
      newBalance,
      kesAmount,
      usdtAmount,
    };
  });

  const { withdrawalId, newBalance } = processWithdrawalTx();

  // Send USDT on blockchain
  try {
    const sendResult = await sendUsdt(toAddress, usdtAmount);

    // Update withdrawal record with transaction hash
    db.prepare(
      `UPDATE withdrawals 
       SET tx_hash = ?, status = 'completed', completed_at = datetime('now')
       WHERE id = ?`
    ).run(sendResult.txHash, withdrawalId);

    return {
      success: true,
      withdrawalId,
      txHash: sendResult.txHash,
      kesAmount,
      usdtAmount,
      newBalance,
      toAddress,
    };
  } catch (error) {
    // Revert balance if blockchain send fails
    const revertTx = db.transaction(() => {
      const user = db.prepare('SELECT balance_kes FROM users WHERE id = ?').get(userId);
      const currentBalance = parseFloat(user.balance_kes);
      const revertedBalance = currentBalance + kesAmount;

      db.prepare('UPDATE users SET balance_kes = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(revertedBalance, userId);

      db.prepare(
        `UPDATE withdrawals SET status = 'failed', failure_reason = ?, failed_at = datetime('now') WHERE id = ?`
      ).run(error.message, withdrawalId);

      // Record reversal transaction
      db.prepare(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_id, reference_type, description)
         VALUES (?, 'refund', ?, ?, ?, ?, 'withdrawal', ?)`
      ).run(
        userId,
        kesAmount,
        currentBalance,
        revertedBalance,
        withdrawalId,
        `Withdrawal failed - refunded: ${error.message}`
      );
    });

    revertTx();

    throw error;
  }
};

/**
 * Get withdrawal history for a user
 */
const getWithdrawalHistory = (userId, limit = 20, offset = 0) => {
  const withdrawals = db.prepare(
    `SELECT id, to_address, kes_amount, usdt_amount, exchange_rate, status, tx_hash, failure_reason, created_at, completed_at, failed_at
     FROM withdrawals
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  ).all(userId, limit, offset);

  return withdrawals.map(w => ({
    id: w.id,
    toAddress: w.to_address,
    kesAmount: parseFloat(w.kes_amount),
    usdtAmount: parseFloat(w.usdt_amount),
    exchangeRate: parseFloat(w.exchange_rate),
    status: w.status,
    txHash: w.tx_hash,
    failureReason: w.failure_reason,
    createdAt: w.created_at,
    completedAt: w.completed_at,
    failedAt: w.failed_at,
  }));
};

module.exports = {
  processWithdrawal,
  getWithdrawalHistory,
  getMasterWalletBalance,
  getMasterTrxBalance,
  sendUsdt,
};

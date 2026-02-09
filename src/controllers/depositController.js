const db = require('../config/db');
const tronService = require('../services/tronService');

const USDT_TO_KES_RATE = parseFloat(process.env.USDT_TO_KES_RATE) || 130;
const MIN_DEPOSIT = parseFloat(process.env.MIN_DEPOSIT_USDT) || 0.1;
const MAX_DEPOSIT = parseFloat(process.env.MAX_DEPOSIT_USDT) || 10000;

/**
 * Get deposit address and instructions
 * GET /api/v1/deposit/address
 * Now returns user's personal unique deposit address
 */
const getDepositAddress = async (req, res) => {
  const userId = req.user.id;
  
  // Get user's personal deposit address
  const user = db.prepare('SELECT tron_address FROM users WHERE id = ?').get(userId);
  
  if (!user || !user.tron_address) {
    return res.status(500).json({
      status: false,
      message: 'Deposit address not configured for your account. Please contact support.',
    });
  }
  
  return res.status(200).json({
    status: true,
    data: {
      network: 'TRC20',
      address: user.tron_address,
      token: 'USDT',
      exchangeRate: USDT_TO_KES_RATE,
      minDeposit: MIN_DEPOSIT,
      maxDeposit: MAX_DEPOSIT,
      autoCredit: true,
      instructions: [
        'Send USDT (TRC20) to YOUR personal address above',
        'This address is unique to your account',
        'Only send from exchanges like Binance, OKX, etc.',
        'Your account will be credited automatically within 1-2 minutes',
        'No need to submit transaction ID - deposits are detected automatically',
      ],
    },
  });
};

/**
 * Verify and process USDT deposit
 * POST /api/v1/deposit/verify
 */
const verifyDeposit = async (req, res) => {
  const { txId } = req.body;
  const userId = req.user.id;
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];

  try {
    // Get user's personal deposit address
    const user = db.prepare('SELECT tron_address FROM users WHERE id = ?').get(userId);
    
    if (!user || !user.tron_address) {
      return res.status(500).json({
        status: false,
        message: 'Deposit address not configured for your account. Please contact support.',
      });
    }
    
    const userDepositAddress = user.tron_address;
    
    // 1. Check if TxID already processed
    const existingDeposit = db.prepare(
      'SELECT id, status FROM deposits WHERE tx_hash = ? LIMIT 1'
    ).get(txId);

    if (existingDeposit) {
      if (existingDeposit.status === 'completed') {
        return res.status(400).json({
          status: false,
          message: 'This transaction has already been processed',
        });
      }
      
      if (existingDeposit.status === 'verifying') {
        return res.status(400).json({
          status: false,
          message: 'This transaction is currently being verified',
        });
      }
    }

    // 2. Create pending deposit record
    let depositId;
    
    if (existingDeposit) {
      db.prepare(
        "UPDATE deposits SET status = 'verifying', updated_at = datetime('now') WHERE id = ?"
      ).run(existingDeposit.id);
      depositId = existingDeposit.id;
    } else {
      const result = db.prepare(
        `INSERT INTO deposits (user_id, tx_hash, status, ip_address, user_agent, usdt_amount, exchange_rate, kes_amount)
         VALUES (?, ?, 'verifying', ?, ?, 0, ?, 0)`
      ).run(userId, txId, ipAddress, userAgent, USDT_TO_KES_RATE);
      depositId = result.lastInsertRowid;
    }

    // 3. Verify transaction on blockchain (check it was sent to user's personal address)
    const verification = await tronService.verifyUsdtDeposit(txId, userDepositAddress);

    if (!verification.valid) {
      // Update deposit as failed
      db.prepare(
        'UPDATE deposits SET status = ?, failure_reason = ? WHERE id = ?'
      ).run('failed', verification.error, depositId);

      return res.status(400).json({
        status: false,
        message: verification.error,
        details: verification.details || null,
      });
    }

    const { usdtAmount, from, to, blockTimestamp } = verification.data;

    // 4. Validate amount limits
    if (usdtAmount < MIN_DEPOSIT) {
      db.prepare(
        'UPDATE deposits SET status = ?, failure_reason = ?, usdt_amount = ? WHERE id = ?'
      ).run('rejected', `Amount below minimum (${MIN_DEPOSIT} USDT)`, usdtAmount, depositId);

      return res.status(400).json({
        status: false,
        message: `Deposit amount (${usdtAmount} USDT) is below minimum (${MIN_DEPOSIT} USDT)`,
      });
    }

    if (usdtAmount > MAX_DEPOSIT) {
      db.prepare(
        'UPDATE deposits SET status = ?, failure_reason = ?, usdt_amount = ? WHERE id = ?'
      ).run('rejected', `Amount above maximum (${MAX_DEPOSIT} USDT)`, usdtAmount, depositId);

      return res.status(400).json({
        status: false,
        message: `Deposit amount (${usdtAmount} USDT) exceeds maximum (${MAX_DEPOSIT} USDT)`,
      });
    }

    // 5. Calculate KES amount
    const kesAmount = usdtAmount * USDT_TO_KES_RATE;

    // 6. Credit user account (atomic transaction)
    const creditUser = db.transaction(() => {
      // Get current balance
      const user = db.prepare(
        'SELECT balance_kes FROM users WHERE id = ?'
      ).get(userId);
      
      const currentBalance = parseFloat(user.balance_kes);
      const newBalance = currentBalance + kesAmount;

      // Update user balance
      db.prepare(
        'UPDATE users SET balance_kes = ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).run(newBalance, userId);

      // Update deposit record
      db.prepare(
        `UPDATE deposits SET 
          status = 'completed',
          usdt_amount = ?,
          kes_amount = ?,
          exchange_rate = ?,
          from_address = ?,
          to_address = ?,
          block_timestamp = ?,
          verified_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ?`
      ).run(usdtAmount, kesAmount, USDT_TO_KES_RATE, from, to, blockTimestamp, depositId);

      // Record in transactions log
      db.prepare(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_id, reference_type, description)
         VALUES (?, 'deposit', ?, ?, ?, ?, 'deposit', ?)`
      ).run(userId, kesAmount, currentBalance, newBalance, depositId, `USDT deposit: ${usdtAmount} USDT @ ${USDT_TO_KES_RATE}`);

      // Record processed tx hash (extra safety)
      db.prepare(
        'INSERT OR IGNORE INTO processed_tx_hashes (tx_hash, deposit_id) VALUES (?, ?)'
      ).run(txId, depositId);

      return { currentBalance, newBalance };
    });

    const { newBalance } = creditUser();

    return res.status(200).json({
      status: true,
      message: 'Deposit successful!',
      data: {
        depositId,
        usdtReceived: usdtAmount,
        exchangeRate: USDT_TO_KES_RATE,
        kesCredited: kesAmount,
        newBalance: newBalance,
      },
    });
  } catch (err) {
    console.error('Deposit verification error:', err);

    return res.status(500).json({
      status: false,
      message: 'Failed to process deposit. Please try again later.',
    });
  }
};

/**
 * Get deposit status
 * GET /api/v1/deposit/status/:id
 */
const getDepositStatus = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const deposit = db.prepare(
      `SELECT id, tx_hash, usdt_amount, exchange_rate, kes_amount, status, failure_reason, created_at, verified_at
       FROM deposits WHERE id = ? AND user_id = ? LIMIT 1`
    ).get(id, userId);

    if (!deposit) {
      return res.status(404).json({
        status: false,
        message: 'Deposit not found',
      });
    }

    return res.status(200).json({
      status: true,
      data: {
        id: deposit.id,
        txHash: deposit.tx_hash,
        usdtAmount: parseFloat(deposit.usdt_amount),
        exchangeRate: parseFloat(deposit.exchange_rate),
        kesAmount: parseFloat(deposit.kes_amount),
        status: deposit.status,
        failureReason: deposit.failure_reason,
        createdAt: deposit.created_at,
        verifiedAt: deposit.verified_at,
      },
    });
  } catch (err) {
    console.error('Error fetching deposit status:', err);
    return res.status(500).json({
      status: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Get user's deposit history
 * GET /api/v1/deposit/history
 */
const getDepositHistory = async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  try {
    // Get deposits
    const deposits = db.prepare(
      `SELECT id, tx_hash, usdt_amount, exchange_rate, kes_amount, status, created_at, verified_at
       FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(userId, limit, offset);

    // Get total count
    const countResult = db.prepare(
      'SELECT COUNT(*) as total FROM deposits WHERE user_id = ?'
    ).get(userId);

    const total = countResult.total;

    return res.status(200).json({
      status: true,
      data: {
        deposits: deposits.map((d) => ({
          id: d.id,
          txHash: d.tx_hash,
          usdtAmount: parseFloat(d.usdt_amount),
          exchangeRate: parseFloat(d.exchange_rate),
          kesAmount: parseFloat(d.kes_amount),
          status: d.status,
          createdAt: d.created_at,
          verifiedAt: d.verified_at,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    console.error('Error fetching deposit history:', err);
    return res.status(500).json({
      status: false,
      message: 'Internal server error',
    });
  }
};

module.exports = {
  getDepositAddress,
  verifyDeposit,
  getDepositStatus,
  getDepositHistory,
};

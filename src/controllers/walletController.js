const db = require('../config/db');

/**
 * Get user's wallet balance
 * GET /api/v1/wallet/balance
 */
const getBalance = async (req, res) => {
  try {
    const user = db.prepare(
      'SELECT balance_kes FROM users WHERE id = ? LIMIT 1'
    ).get(req.user.id);

    if (!user) {
      return res.status(404).json({
        status: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      status: true,
      data: {
        balance: parseFloat(user.balance_kes),
        currency: 'KES',
      },
    });
  } catch (err) {
    console.error('Error fetching balance:', err);
    return res.status(500).json({
      status: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Get user's transaction history
 * GET /api/v1/wallet/transactions
 */
const getTransactionHistory = async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const type = req.query.type;
  const offset = (page - 1) * limit;

  try {
    // Build query
    let query = `SELECT id, type, amount, balance_before, balance_after, description, created_at
                 FROM transactions WHERE user_id = ?`;
    const params = [userId];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    // Get transactions
    const transactions = db.prepare(query).all(...params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM transactions WHERE user_id = ?';
    const countParams = [userId];

    if (type) {
      countQuery += ' AND type = ?';
      countParams.push(type);
    }

    const countResult = db.prepare(countQuery).get(...countParams);
    const total = countResult.total;

    return res.status(200).json({
      status: true,
      data: {
        transactions: transactions.map((t) => ({
          id: t.id,
          type: t.type,
          amount: parseFloat(t.amount),
          balanceBefore: parseFloat(t.balance_before),
          balanceAfter: parseFloat(t.balance_after),
          description: t.description,
          createdAt: t.created_at,
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
    console.error('Error fetching transactions:', err);
    return res.status(500).json({
      status: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Get current exchange rate
 * GET /api/v1/wallet/exchange-rate
 */
const getExchangeRate = async (req, res) => {
  try {
    // Get from database or use env
    const rateRow = db.prepare(
      'SELECT rate FROM exchange_rates WHERE from_currency = ? AND to_currency = ? AND is_active = 1 LIMIT 1'
    ).get('USDT', 'KES');

    const rate = rateRow 
      ? parseFloat(rateRow.rate) 
      : parseFloat(process.env.USDT_TO_KES_RATE) || 130;

    return res.status(200).json({
      status: true,
      data: {
        from: 'USDT',
        to: 'KES',
        rate: rate,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Error fetching exchange rate:', err);
    return res.status(500).json({
      status: false,
      message: 'Internal server error',
    });
  }
};

module.exports = {
  getBalance,
  getTransactionHistory,
  getExchangeRate,
};

const db = require('../config/db');
const withdrawalService = require('../services/withdrawalService');

const USDT_TO_KES_RATE = parseFloat(process.env.USDT_TO_KES_RATE) || 130;
const MIN_WITHDRAWAL_USDT = parseFloat(process.env.MIN_WITHDRAWAL_USDT) || 1;
const MAX_WITHDRAWAL_USDT = parseFloat(process.env.MAX_WITHDRAWAL_USDT) || 10000;

/**
 * Request withdrawal
 * POST /api/v1/wallet/withdraw
 */
const requestWithdrawal = async (req, res) => {
  const userId = req.user.id;
  const { address, amount } = req.body;

  try {
    // Validate address
    if (!address || typeof address !== 'string') {
      return res.status(400).json({
        status: false,
        message: 'Withdrawal address is required',
      });
    }

    // Validate amount
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        status: false,
        message: 'Valid withdrawal amount is required',
      });
    }

    const kesAmount = parseFloat(amount);

    // Process withdrawal
    const result = await withdrawalService.processWithdrawal(userId, address, kesAmount);

    return res.status(200).json({
      status: true,
      message: 'Withdrawal successful!',
      data: {
        withdrawalId: result.withdrawalId,
        txHash: result.txHash,
        kesAmount: result.kesAmount,
        usdtAmount: result.usdtAmount,
        toAddress: result.toAddress,
        newBalance: result.newBalance,
      },
    });
  } catch (error) {
    console.error('Withdrawal error:', error);
    return res.status(400).json({
      status: false,
      message: error.message || 'Withdrawal failed',
    });
  }
};

/**
 * Get withdrawal history
 * GET /api/v1/wallet/withdrawals
 */
const getWithdrawalHistory = async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  try {
    const withdrawals = withdrawalService.getWithdrawalHistory(userId, limit, offset);

    // Get total count
    const countResult = db.prepare(
      'SELECT COUNT(*) as total FROM withdrawals WHERE user_id = ?'
    ).get(userId);
    const total = countResult.total;

    return res.status(200).json({
      status: true,
      data: {
        withdrawals,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching withdrawal history:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to fetch withdrawal history',
    });
  }
};

/**
 * Get withdrawal limits and info
 * GET /api/v1/wallet/withdrawal-info
 */
const getWithdrawalInfo = async (req, res) => {
  try {
    // Get user balance
    const user = db.prepare('SELECT balance_kes FROM users WHERE id = ?').get(req.user.id);
    const balance = user ? parseFloat(user.balance_kes) : 0;

    // Get master wallet balance
    let masterBalance = 0;
    let masterTrxBalance = 0;
    try {
      masterBalance = await withdrawalService.getMasterWalletBalance();
      masterTrxBalance = await withdrawalService.getMasterTrxBalance();
    } catch (error) {
      console.warn('Could not fetch master wallet balance:', error.message);
    }

    return res.status(200).json({
      status: true,
      data: {
        minWithdrawal: MIN_WITHDRAWAL_USDT,
        maxWithdrawal: MAX_WITHDRAWAL_USDT,
        minWithdrawalKES: MIN_WITHDRAWAL_USDT * USDT_TO_KES_RATE,
        maxWithdrawalKES: MAX_WITHDRAWAL_USDT * USDT_TO_KES_RATE,
        exchangeRate: USDT_TO_KES_RATE,
        availableBalance: balance,
        availableUsdt: balance / USDT_TO_KES_RATE,
        masterWalletBalance: masterBalance,
        masterWalletTrxBalance: masterTrxBalance,
        canWithdraw: balance >= (MIN_WITHDRAWAL_USDT * USDT_TO_KES_RATE) && masterBalance >= MIN_WITHDRAWAL_USDT,
      },
    });
  } catch (error) {
    console.error('Error fetching withdrawal info:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to fetch withdrawal info',
    });
  }
};

module.exports = {
  requestWithdrawal,
  getWithdrawalHistory,
  getWithdrawalInfo,
};

/**
 * Admin Controller
 * Handles admin operations like fund consolidation
 */

const consolidationService = require('../services/consolidationService');
const db = require('../config/db');

/**
 * Get consolidation status
 * GET /api/v1/admin/consolidation/status
 */
const getConsolidationStatus = async (req, res) => {
  try {
    const status = await consolidationService.getStatus();
    
    return res.status(200).json({
      status: true,
      data: status,
    });
  } catch (error) {
    console.error('Error getting consolidation status:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to get consolidation status',
    });
  }
};

/**
 * Sweep all eligible wallets to consolidation address
 * POST /api/v1/admin/consolidation/sweep
 */
const sweepAll = async (req, res) => {
  try {
    const results = await consolidationService.sweepAll();
    
    return res.status(200).json({
      status: true,
      message: `Swept ${results.swept} wallets, ${results.totalUsdt} USDT total`,
      data: results,
    });
  } catch (error) {
    console.error('Error sweeping wallets:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to sweep wallets',
    });
  }
};

/**
 * Sweep a specific user's wallet
 * POST /api/v1/admin/consolidation/sweep/:userId
 */
const sweepUser = async (req, res) => {
  const { userId } = req.params;
  
  try {
    // Get user info
    const user = db.prepare(
      'SELECT id, username, tron_address, derivation_index FROM users WHERE id = ?'
    ).get(userId);
    
    if (!user || !user.tron_address) {
      return res.status(404).json({
        status: false,
        message: 'User not found or has no deposit address',
      });
    }
    
    // Get balance
    const usdtBalance = await consolidationService.getUsdtBalance(user.tron_address);
    
    if (usdtBalance < 0.01) {
      return res.status(400).json({
        status: false,
        message: `Insufficient USDT balance: ${usdtBalance} USDT`,
      });
    }
    
    // Sweep
    const result = await consolidationService.sweepUserWallet(
      user.id,
      user.derivation_index,
      user.tron_address,
      usdtBalance
    );
    
    if (result.success) {
      return res.status(200).json({
        status: true,
        message: `Swept ${usdtBalance} USDT from user ${user.username}`,
        data: result,
      });
    } else {
      return res.status(400).json({
        status: false,
        message: result.error,
        data: result,
      });
    }
  } catch (error) {
    console.error('Error sweeping user wallet:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to sweep user wallet',
    });
  }
};

/**
 * Get wallet balances for a specific user
 * GET /api/v1/admin/wallet/:userId
 */
const getUserWalletInfo = async (req, res) => {
  const { userId } = req.params;
  
  try {
    const user = db.prepare(
      'SELECT id, username, tron_address, derivation_index FROM users WHERE id = ?'
    ).get(userId);
    
    if (!user || !user.tron_address) {
      return res.status(404).json({
        status: false,
        message: 'User not found or has no deposit address',
      });
    }
    
    const usdtBalance = await consolidationService.getUsdtBalance(user.tron_address);
    const trxBalance = await consolidationService.getTrxBalance(user.tron_address);
    
    return res.status(200).json({
      status: true,
      data: {
        userId: user.id,
        username: user.username,
        address: user.tron_address,
        derivationIndex: user.derivation_index,
        usdtBalance,
        trxBalance,
        hasSufficientGas: trxBalance >= 10,
      },
    });
  } catch (error) {
    console.error('Error getting user wallet info:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to get wallet info',
    });
  }
};

/**
 * Get sweep history
 * GET /api/v1/admin/consolidation/history
 */
const getSweepHistory = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  
  try {
    const sweeps = db.prepare(
      `SELECT s.*, u.username 
       FROM sweeps s 
       JOIN users u ON s.user_id = u.id 
       ORDER BY s.created_at DESC 
       LIMIT ? OFFSET ?`
    ).all(limit, offset);
    
    const countResult = db.prepare('SELECT COUNT(*) as total FROM sweeps').get();
    
    return res.status(200).json({
      status: true,
      data: {
        sweeps: sweeps.map(s => ({
          id: s.id,
          userId: s.user_id,
          username: s.username,
          fromAddress: s.from_address,
          toAddress: s.to_address,
          usdtAmount: s.usdt_amount,
          txHash: s.tx_hash,
          status: s.status,
          createdAt: s.created_at,
        })),
        pagination: {
          page,
          limit,
          total: countResult.total,
          totalPages: Math.ceil(countResult.total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Error getting sweep history:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to get sweep history',
    });
  }
};

module.exports = {
  getConsolidationStatus,
  sweepAll,
  sweepUser,
  getUserWalletInfo,
  getSweepHistory,
};

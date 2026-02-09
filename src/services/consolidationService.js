/**
 * Consolidation Service
 * Sweeps USDT from user wallets to the master consolidation address
 */

const TronWeb = require('tronweb');
const db = require('../config/db');
const hdWallet = require('./hdWalletService');

// Configuration
const TRON_API_URL = process.env.TRON_API_URL || 'https://api.trongrid.io';
const TRON_API_KEY = process.env.TRON_API_KEY;
const USDT_CONTRACT = process.env.USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const CONSOLIDATION_ADDRESS = process.env.DEPOSIT_ADDRESS; // Master wallet
const MIN_SWEEP_AMOUNT = parseFloat(process.env.MIN_SWEEP_USDT) || 1; // Minimum USDT to sweep

/**
 * Create TronWeb instance with a private key
 * @param {string} privateKey - Private key in hex
 * @returns {TronWeb} TronWeb instance
 */
const createTronWeb = (privateKey) => {
  return new TronWeb({
    fullHost: TRON_API_URL,
    headers: { 'TRON-PRO-API-KEY': TRON_API_KEY },
    privateKey: privateKey,
  });
};

/**
 * Get USDT balance for an address
 * @param {string} address - Tron address
 * @returns {Promise<number>} USDT balance
 */
const getUsdtBalance = async (address) => {
  try {
    const tronWeb = new TronWeb({
      fullHost: TRON_API_URL,
      headers: { 'TRON-PRO-API-KEY': TRON_API_KEY },
    });
    
    // Get USDT contract
    const contract = await tronWeb.contract().at(USDT_CONTRACT);
    
    // Get balance (returns BigNumber)
    const balance = await contract.methods.balanceOf(address).call();
    
    // Convert from 6 decimals
    return Number(balance) / 1_000_000;
  } catch (error) {
    console.error(`Error getting USDT balance for ${address}:`, error.message);
    return 0;
  }
};

/**
 * Get TRX balance for an address (needed for gas)
 * @param {string} address - Tron address
 * @returns {Promise<number>} TRX balance
 */
const getTrxBalance = async (address) => {
  try {
    const tronWeb = new TronWeb({
      fullHost: TRON_API_URL,
      headers: { 'TRON-PRO-API-KEY': TRON_API_KEY },
    });
    
    const balance = await tronWeb.trx.getBalance(address);
    
    // Convert from sun to TRX (1 TRX = 1,000,000 sun)
    return balance / 1_000_000;
  } catch (error) {
    console.error(`Error getting TRX balance for ${address}:`, error.message);
    return 0;
  }
};

/**
 * Sweep USDT from a user wallet to consolidation address
 * @param {number} userId - User ID
 * @param {number} derivationIndex - HD wallet derivation index
 * @param {string} fromAddress - Source address
 * @param {number} amount - Amount to sweep (in USDT)
 * @returns {Promise<object>} Sweep result
 */
const sweepUserWallet = async (userId, derivationIndex, fromAddress, amount) => {
  try {
    // Derive private key for this wallet
    const privateKey = hdWallet.derivePrivateKey(derivationIndex);
    
    // Create TronWeb with this private key
    const tronWeb = createTronWeb(privateKey);
    
    // Check TRX balance for gas
    const trxBalance = await getTrxBalance(fromAddress);
    if (trxBalance < 10) {
      return {
        success: false,
        error: `Insufficient TRX for gas. Has ${trxBalance} TRX, needs ~10-20 TRX`,
        needsTrx: true,
        trxBalance,
      };
    }
    
    // Get USDT contract
    const contract = await tronWeb.contract().at(USDT_CONTRACT);
    
    // Convert amount to smallest unit (6 decimals)
    const amountInSun = Math.floor(amount * 1_000_000);
    
    // Send USDT to consolidation address
    const tx = await contract.methods.transfer(CONSOLIDATION_ADDRESS, amountInSun).send({
      feeLimit: 100_000_000, // 100 TRX max fee
      callValue: 0,
    });
    
    console.log(`✅ Swept ${amount} USDT from user ${userId} (${fromAddress}) - TX: ${tx}`);
    
    // Record sweep in database
    db.prepare(
      `INSERT INTO sweeps (user_id, from_address, to_address, usdt_amount, tx_hash, status)
       VALUES (?, ?, ?, ?, ?, 'completed')`
    ).run(userId, fromAddress, CONSOLIDATION_ADDRESS, amount, tx);
    
    return {
      success: true,
      txHash: tx,
      amount,
      from: fromAddress,
      to: CONSOLIDATION_ADDRESS,
    };
  } catch (error) {
    console.error(`Error sweeping wallet for user ${userId}:`, error.message);
    
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get all user wallets with balances above minimum sweep amount
 * @returns {Promise<array>} Array of wallets with balances
 */
const getWalletsToSweep = async () => {
  // Get all users with tron addresses
  const users = db.prepare(
    'SELECT id, username, tron_address, derivation_index FROM users WHERE tron_address IS NOT NULL AND is_active = 1'
  ).all();
  
  const walletsToSweep = [];
  
  for (const user of users) {
    const usdtBalance = await getUsdtBalance(user.tron_address);
    const trxBalance = await getTrxBalance(user.tron_address);
    
    if (usdtBalance >= MIN_SWEEP_AMOUNT) {
      walletsToSweep.push({
        userId: user.id,
        username: user.username,
        address: user.tron_address,
        derivationIndex: user.derivation_index,
        usdtBalance,
        trxBalance,
        hasSufficientGas: trxBalance >= 10,
      });
    }
  }
  
  return walletsToSweep;
};

/**
 * Sweep all eligible wallets
 * @returns {Promise<object>} Sweep results
 */
const sweepAll = async () => {
  const wallets = await getWalletsToSweep();
  
  if (wallets.length === 0) {
    return {
      success: true,
      message: 'No wallets to sweep',
      swept: 0,
      totalUsdt: 0,
    };
  }
  
  const results = {
    success: true,
    swept: 0,
    failed: 0,
    needsGas: 0,
    totalUsdt: 0,
    details: [],
  };
  
  for (const wallet of wallets) {
    if (!wallet.hasSufficientGas) {
      results.needsGas++;
      results.details.push({
        userId: wallet.userId,
        address: wallet.address,
        status: 'needs_gas',
        usdtBalance: wallet.usdtBalance,
        trxBalance: wallet.trxBalance,
      });
      continue;
    }
    
    const sweepResult = await sweepUserWallet(
      wallet.userId,
      wallet.derivationIndex,
      wallet.address,
      wallet.usdtBalance
    );
    
    if (sweepResult.success) {
      results.swept++;
      results.totalUsdt += wallet.usdtBalance;
      results.details.push({
        userId: wallet.userId,
        address: wallet.address,
        status: 'swept',
        amount: wallet.usdtBalance,
        txHash: sweepResult.txHash,
      });
    } else {
      results.failed++;
      results.details.push({
        userId: wallet.userId,
        address: wallet.address,
        status: 'failed',
        error: sweepResult.error,
      });
    }
    
    // Small delay between sweeps to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return results;
};

/**
 * Get consolidation status
 * @returns {Promise<object>} Status info
 */
const getStatus = async () => {
  const wallets = await getWalletsToSweep();
  
  const totalUsdt = wallets.reduce((sum, w) => sum + w.usdtBalance, 0);
  const walletsNeedingGas = wallets.filter(w => !w.hasSufficientGas);
  
  // Get consolidation address balance
  const consolidationBalance = await getUsdtBalance(CONSOLIDATION_ADDRESS);
  
  return {
    consolidationAddress: CONSOLIDATION_ADDRESS,
    consolidationBalance,
    minSweepAmount: MIN_SWEEP_AMOUNT,
    walletsToSweep: wallets.length,
    walletsNeedingGas: walletsNeedingGas.length,
    totalUsdtToSweep: totalUsdt,
    wallets,
  };
};

module.exports = {
  getUsdtBalance,
  getTrxBalance,
  sweepUserWallet,
  getWalletsToSweep,
  sweepAll,
  getStatus,
};

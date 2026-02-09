#!/usr/bin/env node
/**
 * Check Deposit Balance Script
 * 
 * Checks both on-chain USDT balance and KES balance in database after a deposit
 * 
 * Usage:
 *   node scripts/check-deposit-balance.js --address <address> [--user-id <id>]
 *   node scripts/check-deposit-balance.js --user-id <id>
 */

require('dotenv').config();
const axios = require('axios');
const db = require('../src/config/db');
const tronService = require('../src/services/tronService');

const TRON_API_URL = process.env.TRON_API_URL || 'https://api.trongrid.io';
const TRON_API_KEY = process.env.TRON_API_KEY;
const USDT_CONTRACT = process.env.USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_TO_KES_RATE = parseFloat(process.env.USDT_TO_KES_RATE) || 130;

// Create axios instance
const tronApi = axios.create({
  baseURL: TRON_API_URL,
  headers: {
    'TRON-PRO-API-KEY': TRON_API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

/**
 * Get on-chain USDT balance
 */
async function getOnChainUsdtBalance(address) {
  try {
    // Method 1: Try TRC20 transactions to calculate balance
    const transactions = await tronService.getAddressTransactions(address, {
      limit: 200,
      contractAddress: USDT_CONTRACT,
    });

    // Calculate balance from transactions
    let balance = 0;
    transactions.forEach(tx => {
      if (tx.to === address) {
        balance += parseFloat(tx.value || 0);
      } else if (tx.from === address) {
        balance -= parseFloat(tx.value || 0);
      }
    });

    // Method 2: Try to get token balance directly
    try {
      const response = await tronApi.get(`/v1/accounts/${address}/tokens`, {
        params: { limit: 200 }
      });

      if (response.data.success && response.data.data) {
        const usdtToken = response.data.data.find(
          token => token.token_address === USDT_CONTRACT
        );

        if (usdtToken) {
          balance = parseFloat(usdtToken.balance) / 1_000_000; // USDT has 6 decimals
          return { balance, method: 'direct', transactions: transactions.length };
        }
      }
    } catch (error) {
      // If direct method fails, use calculated balance from transactions
    }

    return { 
      balance: balance / 1_000_000, 
      method: 'calculated', 
      transactions: transactions.length 
    };
  } catch (error) {
    return { balance: 0, error: error.message };
  }
}

/**
 * Get KES balance from database
 */
function getKesBalance(userId) {
  try {
    const user = db.prepare('SELECT id, username, balance_kes, tron_address FROM users WHERE id = ?').get(userId);
    
    if (!user) {
      return { error: 'User not found' };
    }

    return {
      userId: user.id,
      username: user.username,
      balance: parseFloat(user.balance_kes || 0),
      address: user.tron_address,
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Get deposit history for user
 */
function getDepositHistory(userId, limit = 10) {
  try {
    const deposits = db.prepare(
      `SELECT id, tx_hash, usdt_amount, kes_amount, status, created_at, verified_at 
       FROM deposits 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT ?`
    ).all(userId, limit);

    return deposits.map(deposit => ({
      id: deposit.id,
      txHash: deposit.tx_hash,
      usdtAmount: parseFloat(deposit.usdt_amount),
      kesAmount: parseFloat(deposit.kes_amount),
      status: deposit.status,
      createdAt: deposit.created_at,
      verifiedAt: deposit.verified_at,
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Check both balances
 */
async function checkBalances(address, userId = null) {
  console.log('\n' + '='.repeat(70));
  console.log('💰 DEPOSIT BALANCE CHECK');
  console.log('='.repeat(70));
  
  // Get user info if userId provided
  let userInfo = null;
  if (userId) {
    userInfo = getKesBalance(userId);
    if (userInfo.error) {
      console.error(`\n❌ Error: ${userInfo.error}`);
      return;
    }
    address = userInfo.address;
    console.log(`\n👤 User: ${userInfo.username} (ID: ${userInfo.userId})`);
  }
  
  console.log(`📍 Address: ${address}`);
  console.log(`🌐 Network: ${TRON_API_URL.includes('shasta') ? 'TESTNET (Shasta)' : 'MAINNET'}`);
  console.log('─'.repeat(70));

  // Check on-chain USDT balance
  console.log('\n1️⃣  ON-CHAIN USDT BALANCE');
  console.log('─'.repeat(70));
  
  const usdtBalance = await getOnChainUsdtBalance(address);
  
  if (usdtBalance.error) {
    console.log(`   ❌ Error: ${usdtBalance.error}`);
  } else {
    console.log(`   💵 USDT Balance: ${usdtBalance.balance.toFixed(6)} USDT`);
    console.log(`   📊 Method: ${usdtBalance.method}`);
    console.log(`   📜 Transactions: ${usdtBalance.transactions || 0}`);
    
    if (usdtBalance.balance > 0) {
      const expectedKes = usdtBalance.balance * USDT_TO_KES_RATE;
      console.log(`   💱 Expected KES (at ${USDT_TO_KES_RATE}): ${expectedKes.toFixed(2)} KES`);
    }
  }

  // Check KES balance in database
  if (userId || userInfo) {
    const userIdToCheck = userId || userInfo.userId;
    const kesInfo = getKesBalance(userIdToCheck);
    
    console.log('\n2️⃣  DATABASE KES BALANCE');
    console.log('─'.repeat(70));
    
    if (kesInfo.error) {
      console.log(`   ❌ Error: ${kesInfo.error}`);
    } else {
      console.log(`   💵 KES Balance: ${kesInfo.balance.toFixed(2)} KES`);
      console.log(`   👤 User: ${kesInfo.username} (ID: ${kesInfo.userId})`);
      
      // Compare balances
      if (usdtBalance.balance > 0 && kesInfo.balance > 0) {
        const expectedKes = usdtBalance.balance * USDT_TO_KES_RATE;
        const difference = Math.abs(kesInfo.balance - expectedKes);
        
        console.log('\n3️⃣  BALANCE COMPARISON');
        console.log('─'.repeat(70));
        console.log(`   On-chain USDT: ${usdtBalance.balance.toFixed(6)} USDT`);
        console.log(`   Expected KES: ${expectedKes.toFixed(2)} KES`);
        console.log(`   Actual KES: ${kesInfo.balance.toFixed(2)} KES`);
        
        if (difference < 0.01) {
          console.log(`   ✅ Balances match! (difference: ${difference.toFixed(2)} KES)`);
        } else {
          console.log(`   ⚠️  Balance difference: ${difference.toFixed(2)} KES`);
          console.log(`   💡 This might be due to:`);
          console.log(`      - Multiple deposits`);
          console.log(`      - Pending deposits not yet credited`);
          console.log(`      - Different exchange rates`);
        }
      } else if (usdtBalance.balance > 0 && kesInfo.balance === 0) {
        console.log('\n⚠️  DEPOSIT NOT CREDITED YET');
        console.log('─'.repeat(70));
        console.log(`   On-chain USDT: ${usdtBalance.balance.toFixed(6)} USDT`);
        console.log(`   Database KES: ${kesInfo.balance.toFixed(2)} KES`);
        console.log(`   💡 The deposit monitor should credit this automatically`);
        console.log(`   💡 Check deposit monitor logs or wait 1-2 minutes`);
      }
    }

    // Show deposit history
    const deposits = getDepositHistory(userIdToCheck, 5);
    if (deposits.length > 0) {
      console.log('\n4️⃣  RECENT DEPOSITS');
      console.log('─'.repeat(70));
      deposits.forEach((deposit, index) => {
        console.log(`\n   Deposit ${index + 1}:`);
        console.log(`   ├─ Status: ${deposit.status}`);
        console.log(`   ├─ USDT: ${deposit.usdtAmount.toFixed(6)} USDT`);
        console.log(`   ├─ KES: ${deposit.kesAmount.toFixed(2)} KES`);
        console.log(`   ├─ TX Hash: ${deposit.txHash}`);
        console.log(`   └─ Created: ${deposit.createdAt}`);
      });
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ Balance check complete');
  console.log('='.repeat(70) + '\n');
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Check Deposit Balance Script

Usage:
  node scripts/check-deposit-balance.js --address <address>
  node scripts/check-deposit-balance.js --user-id <user_id>
  node scripts/check-deposit-balance.js --address <address> --user-id <user_id>

Examples:
  node scripts/check-deposit-balance.js --address TBcY5RRNKVuzApHDUFoqaZeVdPa46iyfGE
  node scripts/check-deposit-balance.js --user-id 1
  node scripts/check-deposit-balance.js --address TBcY5RRNKVuzApHDUFoqaZeVdPa46iyfGE --user-id 1
`);
    process.exit(0);
  }

  let address = null;
  let userId = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--address' && args[i + 1]) {
      address = args[i + 1];
      i++;
    } else if (args[i] === '--user-id' && args[i + 1]) {
      userId = parseInt(args[i + 1]);
      i++;
    }
  }

  if (!address && !userId) {
    console.error('❌ Please provide either --address or --user-id');
    console.log('Use --help for usage information');
    process.exit(1);
  }

  try {
    await checkBalances(address, userId);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  checkBalances,
  getOnChainUsdtBalance,
  getKesBalance,
  getDepositHistory,
};

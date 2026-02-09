#!/usr/bin/env node
/**
 * Test Deposit Script
 * 
 * Helps test a deposit on Shasta testnet by monitoring the deposit process
 * 
 * Usage:
 *   node scripts/test-deposit.js --user-id <id> [--amount <amount>]
 *   node scripts/test-deposit.js --address <address> --user-id <id>
 */

require('dotenv').config();
const axios = require('axios');
const db = require('../src/config/db');
const tronService = require('../src/services/tronService');
const depositMonitor = require('../src/services/depositMonitor');

const TRON_API_URL = process.env.TRON_API_URL || 'https://api.trongrid.io';
const USDT_CONTRACT = process.env.USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_TO_KES_RATE = parseFloat(process.env.USDT_TO_KES_RATE) || 130;
const MIN_DEPOSIT = parseFloat(process.env.MIN_DEPOSIT_USDT) || 0.1;

const isTestnet = TRON_API_URL.includes('shasta');
const TESTNET_USDT = 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs';

console.log('\n' + '='.repeat(70));
console.log('🧪 TEST DEPOSIT MONITOR');
console.log('='.repeat(70));
console.log(`🌐 Network: ${isTestnet ? 'TESTNET (Shasta)' : 'MAINNET'}`);
console.log(`📝 USDT Contract: ${isTestnet ? TESTNET_USDT : USDT_CONTRACT}`);
console.log(`💰 Exchange Rate: 1 USDT = ${USDT_TO_KES_RATE} KES`);
console.log(`📊 Min Deposit: ${MIN_DEPOSIT} USDT`);
console.log('='.repeat(70) + '\n');

/**
 * Get user info
 */
function getUserInfo(userId) {
  const user = db.prepare('SELECT id, username, balance_kes, tron_address FROM users WHERE id = ?').get(userId);
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    username: user.username,
    balance: parseFloat(user.balance_kes || 0),
    address: user.tron_address,
  };
}

/**
 * Check on-chain balance
 */
async function checkOnChainBalance(address) {
  try {
    const transactions = await tronService.getAddressTransactions(address, {
      limit: 50,
      contractAddress: isTestnet ? TESTNET_USDT : USDT_CONTRACT,
    });

    // Calculate balance from transactions
    let balance = 0;
    const incomingTx = transactions.filter(tx => tx.to === address);
    
    incomingTx.forEach(tx => {
      balance += parseFloat(tx.value || 0);
    });

    return {
      balance: balance / 1_000_000,
      transactions: incomingTx.length,
      recentTx: incomingTx.slice(0, 5),
    };
  } catch (error) {
    return { balance: 0, error: error.message };
  }
}

/**
 * Check database balance
 */
function checkDatabaseBalance(userId) {
  const user = getUserInfo(userId);
  if (!user) return null;

  const deposits = db.prepare(
    `SELECT id, tx_hash, usdt_amount, kes_amount, status, created_at, verified_at 
     FROM deposits 
     WHERE user_id = ? 
     ORDER BY created_at DESC 
     LIMIT 10`
  ).all(userId);

  return {
    user,
    deposits: deposits.map(d => ({
      id: d.id,
      txHash: d.tx_hash,
      usdtAmount: parseFloat(d.usdt_amount),
      kesAmount: parseFloat(d.kes_amount),
      status: d.status,
      createdAt: d.created_at,
      verifiedAt: d.verified_at,
    })),
  };
}

/**
 * Monitor deposit
 */
async function monitorDeposit(userId, expectedAmount = 5) {
  const user = getUserInfo(userId);
  if (!user) {
    console.error(`❌ User with ID ${userId} not found`);
    return;
  }

  console.log(`👤 User: ${user.username} (ID: ${user.id})`);
  console.log(`📍 Address: ${user.address}`);
  console.log(`💰 Expected Amount: ${expectedAmount} USDT`);
  console.log(`💵 Expected KES: ${expectedAmount * USDT_TO_KES_RATE} KES\n`);

  const initialBalance = user.balance;
  console.log(`📊 Initial KES Balance: ${initialBalance.toFixed(2)} KES\n`);

  console.log('⏳ Monitoring for deposit...');
  console.log('   (Press Ctrl+C to stop)\n');

  let lastTxCount = 0;
  let lastBalance = initialBalance;
  let checkCount = 0;
  const maxChecks = 60; // 5 minutes max (5 second intervals)

  const checkInterval = setInterval(async () => {
    checkCount++;

    // Check on-chain balance
    const onChain = await checkOnChainBalance(user.address);
    
    // Check database balance
    const dbInfo = checkDatabaseBalance(userId);
    const currentBalance = dbInfo.user.balance;

    // Check for new transactions
    const newTxCount = onChain.transactions;
    const hasNewTx = newTxCount > lastTxCount;
    const balanceChanged = currentBalance !== lastBalance;

    // Display status
    process.stdout.write(`\r[${checkCount}/${maxChecks}] `);
    process.stdout.write(`On-chain: ${onChain.balance.toFixed(6)} USDT | `);
    process.stdout.write(`Database: ${currentBalance.toFixed(2)} KES`);

    if (hasNewTx) {
      console.log(`\n\n✅ New transaction detected!`);
      console.log(`   On-chain USDT: ${onChain.balance.toFixed(6)} USDT`);
      
      if (onChain.recentTx.length > 0) {
        const latestTx = onChain.recentTx[0];
        console.log(`   Latest TX: ${latestTx.txHash}`);
        console.log(`   Amount: ${(latestTx.value / 1_000_000).toFixed(6)} USDT`);
      }
    }

    if (balanceChanged) {
      const credited = currentBalance - lastBalance;
      console.log(`\n\n✅ Balance credited!`);
      console.log(`   KES Credited: ${credited.toFixed(2)} KES`);
      console.log(`   New Balance: ${currentBalance.toFixed(2)} KES`);
      
      // Show deposit details
      if (dbInfo.deposits.length > 0) {
        const latestDeposit = dbInfo.deposits[0];
        console.log(`\n📋 Deposit Details:`);
        console.log(`   Status: ${latestDeposit.status}`);
        console.log(`   USDT: ${latestDeposit.usdtAmount.toFixed(6)} USDT`);
        console.log(`   KES: ${latestDeposit.kesAmount.toFixed(2)} KES`);
        console.log(`   TX Hash: ${latestDeposit.txHash}`);
        console.log(`   Verified: ${latestDeposit.verifiedAt || 'Pending'}`);
      }

      lastBalance = currentBalance;
    }

    // Stop if deposit is complete
    if (onChain.balance >= expectedAmount && currentBalance >= (expectedAmount * USDT_TO_KES_RATE * 0.99)) {
      console.log(`\n\n✅ Deposit complete!`);
      console.log(`   On-chain: ${onChain.balance.toFixed(6)} USDT`);
      console.log(`   Database: ${currentBalance.toFixed(2)} KES`);
      console.log(`   Expected: ${(expectedAmount * USDT_TO_KES_RATE).toFixed(2)} KES`);
      clearInterval(checkInterval);
      process.exit(0);
    }

    // Stop after max checks
    if (checkCount >= maxChecks) {
      console.log(`\n\n⏱️  Monitoring timeout reached`);
      console.log(`   Final On-chain: ${onChain.balance.toFixed(6)} USDT`);
      console.log(`   Final Database: ${currentBalance.toFixed(2)} KES`);
      
      if (onChain.balance > 0 && currentBalance === initialBalance) {
        console.log(`\n⚠️  Deposit detected on-chain but not credited yet`);
        console.log(`   💡 The deposit monitor should credit it automatically`);
        console.log(`   💡 Check server logs for deposit monitor activity`);
      }
      
      clearInterval(checkInterval);
      process.exit(0);
    }

    lastTxCount = newTxCount;
  }, 5000); // Check every 5 seconds
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Test Deposit Monitor Script

Usage:
  node scripts/test-deposit.js --user-id <id> [--amount <amount>]

Examples:
  node scripts/test-deposit.js --user-id 1
  node scripts/test-deposit.js --user-id 1 --amount 5

This script monitors both on-chain USDT balance and database KES balance
to verify that deposits are detected and credited automatically.
`);
    process.exit(0);
  }

  let userId = null;
  let amount = 5;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--user-id' && args[i + 1]) {
      userId = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--amount' && args[i + 1]) {
      amount = parseFloat(args[i + 1]);
      i++;
    }
  }

  if (!userId) {
    console.error('❌ Please provide --user-id');
    process.exit(1);
  }

  // Check network
  if (!isTestnet) {
    console.log('⚠️  WARNING: You are on MAINNET (real funds)');
    console.log('   To switch to testnet, update .env:');
    console.log('   TRON_API_URL=https://api.shasta.trongrid.io');
    console.log('   USDT_CONTRACT=TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs\n');
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    readline.question('Continue anyway? (yes/no): ', (answer) => {
      readline.close();
      if (answer.toLowerCase() !== 'yes') {
        console.log('Cancelled.');
        process.exit(0);
      }
      monitorDeposit(userId, amount);
    });
  } else {
    monitorDeposit(userId, amount);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Monitoring stopped');
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { monitorDeposit, checkOnChainBalance, checkDatabaseBalance };

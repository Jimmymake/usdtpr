#!/usr/bin/env node
/**
 * Check Address Activation Status
 * 
 * Checks if a Tron address is activated and ready to receive tokens
 * 
 * Usage:
 *   node scripts/check-activation.js --address <address>
 *   node scripts/check-activation.js --user-id <id>
 */

require('dotenv').config();
const axios = require('axios');
const db = require('../src/config/db');

const TRON_API_URL = process.env.TRON_API_URL || 'https://api.trongrid.io';
const TRON_API_KEY = process.env.TRON_API_KEY;

const isTestnet = TRON_API_URL.includes('shasta');
const explorerUrl = isTestnet 
  ? 'https://shasta.tronscan.org'
  : 'https://tronscan.org';

// Create axios instance
const createApi = () => {
  const headers = { 'Content-Type': 'application/json' };
  if (TRON_API_KEY && TRON_API_KEY.trim() !== '') {
    headers['TRON-PRO-API-KEY'] = TRON_API_KEY;
  }
  
  return axios.create({
    baseURL: TRON_API_URL,
    headers,
    timeout: 30000,
  });
};

/**
 * Check if address is activated
 */
async function checkActivation(address) {
  console.log('\n' + '='.repeat(70));
  console.log('🔍 ADDRESS ACTIVATION CHECK');
  console.log('='.repeat(70));
  console.log(`📍 Address: ${address}`);
  console.log(`🌐 Network: ${isTestnet ? 'TESTNET (Shasta)' : 'MAINNET'}`);
  console.log('─'.repeat(70) + '\n');

  try {
    const api = createApi();
    
    // Check account info
    const response = await api.get(`/v1/accounts/${address}`);
    
    if (response.data.success === false) {
      console.log('❌ Address Status: INACTIVATED\n');
      console.log('⚠️  This address has not been activated yet.');
      console.log('   It needs to receive TRX first before it can receive tokens.\n');
      console.log('📋 Activation Steps:');
      console.log('   1. Get test TRX from faucet:');
      console.log('      - https://www.trongrid.io/faucet');
      console.log('      - https://shasta.tronex.io/join/getJoinPage');
      console.log(`   2. Send TRX to: ${address}`);
      console.log('   3. Wait 1-2 minutes for confirmation');
      console.log('   4. Check again\n');
      console.log(`🔗 View on Explorer: ${explorerUrl}/#/address/${address}\n`);
      return { activated: false };
    }

    const account = response.data.data || response.data;
    
    const trxBalance = (account.balance || 0) / 1_000_000;
    const txCount = account.tx_count || 0;
    const accountType = account.account_type || 'Normal';
    
    console.log('✅ Address Status: ACTIVATED\n');
    console.log('📊 Account Details:');
    console.log(`   TRX Balance: ${trxBalance} TRX`);
    console.log(`   Transaction Count: ${txCount}`);
    console.log(`   Account Type: ${accountType}`);
    
    if (trxBalance === 0 && txCount === 0) {
      console.log('\n⚠️  Note: Address is activated but has no balance or transactions yet.');
    }
    
    if (trxBalance > 0) {
      console.log('\n✅ Address is ready to receive tokens!');
      console.log('   You can now send USDT (TRC-20) to this address.');
    } else {
      console.log('\n💡 Address is activated but has no TRX balance.');
      console.log('   Consider sending some TRX for gas fees.');
    }
    
    console.log(`\n🔗 View on Explorer: ${explorerUrl}/#/address/${address}\n`);
    
    return {
      activated: true,
      trxBalance,
      txCount,
      accountType,
    };
    
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log('❌ Address Status: INACTIVATED\n');
      console.log('⚠️  Address not found on blockchain (not activated yet).\n');
      console.log('📋 To Activate:');
      console.log('   1. Send TRX to this address');
      console.log('   2. Wait for confirmation');
      console.log('   3. Check again\n');
      console.log(`🔗 View on Explorer: ${explorerUrl}/#/address/${address}\n`);
      return { activated: false };
    }
    
    console.error(`❌ Error checking activation: ${error.message}`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
    }
    return { activated: false, error: error.message };
  }
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Check Address Activation Script

Usage:
  node scripts/check-activation.js --address <address>
  node scripts/check-activation.js --user-id <user_id>

Examples:
  node scripts/check-activation.js --address TBcY5RRNKVuzApHDUFoqaZeVdPa46iyfGE
  node scripts/check-activation.js --user-id 1
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
    process.exit(1);
  }

  if (userId) {
    const user = db.prepare('SELECT id, username, tron_address FROM users WHERE id = ?').get(userId);
    if (!user) {
      console.error(`❌ User with ID ${userId} not found`);
      process.exit(1);
    }
    console.log(`👤 User: ${user.username} (ID: ${user.id})\n`);
    address = user.tron_address;
  }

  await checkActivation(address);
}

if (require.main === module) {
  main();
}

module.exports = { checkActivation };

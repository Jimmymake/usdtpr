#!/usr/bin/env node
/**
 * Testnet Setup Script
 * 
 * Helps you switch to Tron Shasta testnet and get test USDT for testing
 * 
 * Usage:
 *   node scripts/testnet-setup.js --check
 *   node scripts/testnet-setup.js --faucet <address>
 */

require('dotenv').config();
const axios = require('axios');

const MAINNET_API = 'https://api.trongrid.io';
const TESTNET_API = 'https://api.shasta.trongrid.io';
const MAINNET_USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const TESTNET_USDT = 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs'; // Shasta testnet USDT contract

const TRON_API_KEY = process.env.TRON_API_KEY;

// Create axios instance
const createApi = (baseURL) => {
  return axios.create({
    baseURL,
    headers: {
      'TRON-PRO-API-KEY': TRON_API_KEY,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
};

/**
 * Check current network configuration
 */
async function checkNetworkConfig() {
  console.log('\n🌐 Checking Network Configuration...\n');
  
  const currentApi = process.env.TRON_API_URL || MAINNET_API;
  const currentUsdt = process.env.USDT_CONTRACT || MAINNET_USDT;
  
  const isTestnet = currentApi.includes('shasta');
  
  console.log(`Current API URL: ${currentApi}`);
  console.log(`Current USDT Contract: ${currentUsdt}`);
  console.log(`Network: ${isTestnet ? '🧪 TESTNET (Shasta)' : '🌍 MAINNET'}\n`);
  
  if (!isTestnet) {
    console.log('⚠️  You are currently on MAINNET (real funds)');
    console.log('   To switch to testnet, update your .env file:\n');
    console.log('   TRON_API_URL=https://api.shasta.trongrid.io');
    console.log('   USDT_CONTRACT=TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs\n');
  } else {
    console.log('✅ You are on TESTNET (test funds only)\n');
  }
  
  return { isTestnet, currentApi, currentUsdt };
}

/**
 * Get testnet faucet links
 */
function showFaucetInfo(address = null) {
  console.log('\n🚰 Testnet Faucet Information\n');
  console.log('To get test USDT on Shasta testnet:\n');
  
  console.log('1️⃣  Official Tron Faucet:');
  console.log('   https://www.trongrid.io/faucet');
  console.log('   - Provides test TRX');
  console.log('   - Complete CAPTCHA and enter your address\n');
  
  console.log('2️⃣  Shasta Testnet Faucet:');
  console.log('   https://shasta.tronex.io/join/getJoinPage');
  console.log('   - Provides test TRX and TRC-20 tokens\n');
  
  console.log('3️⃣  Community TRC-20 Faucet:');
  console.log('   https://testnet-tron-faucet-phi.vercel.app');
  console.log('   - Specifically for TRC-20 tokens like USDT\n');
  
  if (address) {
    console.log(`\n📋 Your address to use: ${address}\n`);
    console.log('💡 Steps:');
    console.log('   1. Copy your address above');
    console.log('   2. Visit one of the faucet links');
    console.log('   3. Paste your address and complete CAPTCHA');
    console.log('   4. Wait for confirmation (usually 1-2 minutes)');
    console.log('   5. Check your balance using:');
    console.log(`      npm run verify-address -- --test-transaction ${address}\n`);
  }
}

/**
 * Check testnet balance
 */
async function checkTestnetBalance(address) {
  console.log(`\n🔍 Checking testnet balance for: ${address}\n`);
  
  try {
    const api = createApi(TESTNET_API);
    
    // Check TRX balance
    const accountResponse = await api.get(`/v1/accounts/${address}`);
    const account = accountResponse.data.data || accountResponse.data;
    
    console.log('📊 Account Balance:');
    console.log(`   TRX: ${(account.balance || 0) / 1_000_000} TRX`);
    console.log(`   Account Type: ${account.account_type || 'Normal'}`);
    console.log(`   Transaction Count: ${account.tx_count || 0}\n`);
    
    // Check USDT balance using TRC20 transactions method (more reliable)
    let usdtBalance = 0;
    let hasUsdtTransactions = false;
    
    try {
      // Method 1: Try TRC20 transactions endpoint
      const trc20Response = await api.get(`/v1/accounts/${address}/transactions/trc20`, {
        params: {
          limit: 200,
          contract_address: TESTNET_USDT,
        }
      });
      
      if (trc20Response.data.success && trc20Response.data.data) {
        const transactions = trc20Response.data.data;
        hasUsdtTransactions = transactions.length > 0;
        
        // Calculate balance from transactions (incoming - outgoing)
        let balance = 0;
        transactions.forEach(tx => {
          if (tx.to === address) {
            balance += parseFloat(tx.value || 0);
          } else if (tx.from === address) {
            balance -= parseFloat(tx.value || 0);
          }
        });
        usdtBalance = balance / 1_000_000; // USDT has 6 decimals
      }
    } catch (trc20Error) {
      // If TRC20 endpoint fails, try tokens endpoint
      try {
        const tokensResponse = await api.get(`/v1/accounts/${address}/tokens`, {
          params: { limit: 200 }
        });
        
        if (tokensResponse.data.success && tokensResponse.data.data) {
          const usdtToken = tokensResponse.data.data.find(
            token => token.token_address === TESTNET_USDT
          );
          
          if (usdtToken) {
            usdtBalance = parseFloat(usdtToken.balance) / 1_000_000;
            hasUsdtTransactions = true;
          }
        }
      } catch (tokensError) {
        // Both methods failed, balance is likely 0
        // This is normal for addresses that haven't received tokens yet
      }
    }
    
    if (hasUsdtTransactions || usdtBalance > 0) {
      console.log(`   USDT: ${usdtBalance.toFixed(6)} USDT`);
    } else {
      console.log('   USDT: 0 USDT (no test USDT yet)');
      console.log('   ℹ️  This is normal - address hasn\'t received test USDT yet');
    }
    
    console.log('\n💡 To get test USDT:');
    console.log('   1. Visit: https://testnet-tron-faucet-phi.vercel.app');
    console.log('   2. Or visit: https://shasta.tronex.io/join/getJoinPage');
    console.log('   3. Paste your address and complete CAPTCHA');
    console.log('   4. Wait 1-2 minutes for confirmation\n');
    
  } catch (error) {
    console.error(`❌ Error checking balance: ${error.message}`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      if (error.response.status === 404) {
        console.error('   ℹ️  Address might not exist on testnet yet');
        console.error('   💡 Send some test TRX first to activate the address');
      }
    }
  }
}

/**
 * Generate testnet .env configuration
 */
function generateTestnetConfig() {
  console.log('\n📝 Testnet Configuration for .env file:\n');
  console.log('# Testnet Configuration (Shasta)');
  console.log('TRON_API_URL=https://api.shasta.trongrid.io');
  console.log('USDT_CONTRACT=TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs');
  console.log('');
  console.log('# Keep your existing API key (works for both mainnet and testnet)');
  console.log(`TRON_API_KEY=${TRON_API_KEY || 'your_api_key_here'}\n`);
  
  console.log('⚠️  IMPORTANT:');
  console.log('   - Backup your current .env file before switching');
  console.log('   - Testnet uses different contract addresses');
  console.log('   - Testnet addresses are separate from mainnet');
  console.log('   - Testnet tokens have NO real value\n');
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Testnet Setup Script

Usage:
  node scripts/testnet-setup.js --check
  node scripts/testnet-setup.js --faucet [address]
  node scripts/testnet-setup.js --balance <address>
  node scripts/testnet-setup.js --config

Examples:
  node scripts/testnet-setup.js --check
  node scripts/testnet-setup.js --faucet TBcY5RRNKVuzApHDUFoqaZeVdPa46iyfGE
  node scripts/testnet-setup.js --balance TBcY5RRNKVuzApHDUFoqaZeVdPa46iyfGE
  node scripts/testnet-setup.js --config
`);
    process.exit(0);
  }
  
  try {
    if (args[0] === '--check') {
      await checkNetworkConfig();
      
    } else if (args[0] === '--faucet') {
      const address = args[1];
      if (!address) {
        console.error('❌ Please provide an address: --faucet <address>');
        process.exit(1);
      }
      showFaucetInfo(address);
      
    } else if (args[0] === '--balance') {
      const address = args[1];
      if (!address) {
        console.error('❌ Please provide an address: --balance <address>');
        process.exit(1);
      }
      await checkTestnetBalance(address);
      
    } else if (args[0] === '--config') {
      generateTestnetConfig();
      
    } else {
      console.error(`❌ Unknown command: ${args[0]}`);
      console.log('Use --help for usage information');
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  checkNetworkConfig,
  showFaucetInfo,
  checkTestnetBalance,
  TESTNET_API,
  TESTNET_USDT,
  MAINNET_API,
  MAINNET_USDT,
};

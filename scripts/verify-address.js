#!/usr/bin/env node
/**
 * Address Verification Script
 * 
 * This script verifies that generated Tron addresses are valid and can receive crypto.
 * 
 * Usage:
 *   node scripts/verify-address.js [address] [derivation_index]
 *   node scripts/verify-address.js --user-id <id>
 *   node scripts/verify-address.js --test-transaction <address>
 */

require('dotenv').config();
const axios = require('axios');
const TronWeb = require('tronweb');
const hdWallet = require('../src/services/hdWalletService');
const db = require('../src/config/db');
const tronService = require('../src/services/tronService');

const TRON_API_URL = process.env.TRON_API_URL || 'https://api.trongrid.io';
const TRON_API_KEY = process.env.TRON_API_KEY;

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
 * Validate Tron address format
 */
function validateAddressFormat(address) {
  if (!address || typeof address !== 'string') {
    return { valid: false, error: 'Address must be a string' };
  }

  // Tron addresses start with 'T' and are 34 characters long
  if (!address.startsWith('T')) {
    return { valid: false, error: 'Tron address must start with "T"' };
  }

  if (address.length !== 34) {
    return { valid: false, error: `Tron address must be 34 characters (got ${address.length})` };
  }

  // Check base58 characters
  const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
  if (!base58Regex.test(address)) {
    return { valid: false, error: 'Address contains invalid characters (must be base58)' };
  }

  // Try to validate using TronWeb utils.address.toHex (most reliable method)
  try {
    // Use TronWeb.utils.address.toHex - if conversion succeeds, address is valid
    if (TronWeb.utils && TronWeb.utils.address && typeof TronWeb.utils.address.toHex === 'function') {
      try {
        const hex = TronWeb.utils.address.toHex(address);
        if (!hex || (hex.length !== 42 && hex.length !== 40)) { 
          // Tron hex addresses are 40 chars or 42 with 0x prefix
          return { valid: false, error: 'Address failed TronWeb hex conversion validation' };
        }
        // Conversion successful = address is valid
      } catch (conversionError) {
        // If conversion throws, address format is invalid
        return { valid: false, error: `Invalid address format: ${conversionError.message}` };
      }
    }
    // Fallback: Try TronWeb.isAddress if available
    else if (typeof TronWeb.isAddress === 'function') {
      const isValid = TronWeb.isAddress(address);
      if (!isValid) {
        return { valid: false, error: 'Address failed TronWeb validation' };
      }
    }
    // If TronWeb utils not available, format checks above are sufficient
    // (length, starts with T, base58 characters are good enough)
  } catch (error) {
    // Unexpected error - but format checks passed, so consider valid
    // (TronWeb might not be fully initialized, but basic format is correct)
    // Don't fail validation on TronWeb errors if format checks passed
  }

  return { valid: true };
}

/**
 * Check if address exists on blockchain and get its info
 */
async function checkAddressOnBlockchain(address) {
  try {
    const response = await tronApi.get(`/v1/accounts/${address}`);
    
    if (response.data.success === false) {
      return {
        exists: false,
        error: response.data.error || 'Address not found on blockchain',
      };
    }

    const account = response.data.data || response.data;
    
    return {
      exists: true,
      address: account.address || address,
      balance: account.balance || 0,
      trxBalance: (account.balance || 0) / 1_000_000, // Convert sun to TRX
      accountType: account.account_type || 'Normal',
      isContract: account.account_type === 'Contract',
      hasTransactions: (account.tx_count || 0) > 0,
      txCount: account.tx_count || 0,
    };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return {
        exists: false,
        error: 'Address not found on blockchain (new address, never used)',
      };
    }
    
    return {
      exists: false,
      error: `Error checking address: ${error.message}`,
    };
  }
}

/**
 * Check USDT balance for an address
 */
async function checkUsdtBalance(address) {
  try {
    const transactions = await tronService.getAddressTransactions(address, {
      limit: 1,
      contractAddress: process.env.USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    });

    // Get account info to check token balances
    const response = await tronApi.get(`/v1/accounts/${address}/tokens`, {
      params: {
        limit: 200,
      },
    });

    if (response.data.success && response.data.data) {
      const usdtToken = response.data.data.find(
        (token) => token.token_address === (process.env.USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
      );

      if (usdtToken) {
        return {
          hasUsdt: true,
          balance: parseFloat(usdtToken.balance) / 1_000_000, // USDT has 6 decimals
          tokenInfo: usdtToken,
        };
      }
    }

    return {
      hasUsdt: false,
      balance: 0,
    };
  } catch (error) {
    return {
      hasUsdt: false,
      balance: 0,
      error: error.message,
    };
  }
}

/**
 * Verify address derivation
 */
function verifyDerivation(address, expectedIndex) {
  try {
    const derived = hdWallet.deriveAddress(expectedIndex);
    const matches = derived.address === address;
    
    return {
      matches,
      expectedAddress: derived.address,
      actualAddress: address,
      derivationIndex: expectedIndex,
    };
  } catch (error) {
    return {
      matches: false,
      error: error.message,
    };
  }
}

/**
 * Main verification function
 */
async function verifyAddress(address, derivationIndex = null) {
  console.log('\n🔍 Verifying Tron Address...\n');
  console.log(`Address: ${address}`);
  if (derivationIndex !== null) {
    console.log(`Derivation Index: ${derivationIndex}`);
  }
  console.log('─'.repeat(60));

  const results = {
    address,
    derivationIndex,
    checks: {},
  };

  // 1. Format validation
  console.log('\n1️⃣  Checking address format...');
  const formatCheck = validateAddressFormat(address);
  results.checks.format = formatCheck;
  
  if (formatCheck.valid) {
    console.log('   ✅ Address format is valid');
  } else {
    console.log(`   ❌ Format validation failed: ${formatCheck.error}`);
    return results;
  }

  // 2. Blockchain check
  console.log('\n2️⃣  Checking address on blockchain...');
  const blockchainCheck = await checkAddressOnBlockchain(address);
  results.checks.blockchain = blockchainCheck;
  
  if (blockchainCheck.exists) {
    console.log('   ✅ Address exists on blockchain');
    console.log(`   📊 TRX Balance: ${blockchainCheck.trxBalance} TRX`);
    console.log(`   📊 Account Type: ${blockchainCheck.accountType}`);
    console.log(`   📊 Transaction Count: ${blockchainCheck.txCount}`);
  } else {
    console.log(`   ⚠️  ${blockchainCheck.error}`);
    console.log('   ℹ️  This is normal for new addresses that haven\'t received any transactions yet');
  }

  // 3. USDT balance check
  console.log('\n3️⃣  Checking USDT balance...');
  const usdtCheck = await checkUsdtBalance(address);
  results.checks.usdt = usdtCheck;
  
  if (usdtCheck.hasUsdt) {
    console.log(`   ✅ USDT Balance: ${usdtCheck.balance} USDT`);
  } else {
    console.log('   ℹ️  No USDT balance (address can still receive USDT)');
  }

  // 4. Derivation verification (if index provided)
  if (derivationIndex !== null) {
    console.log('\n4️⃣  Verifying address derivation...');
    const derivationCheck = verifyDerivation(address, derivationIndex);
    results.checks.derivation = derivationCheck;
    
    if (derivationCheck.matches) {
      console.log('   ✅ Address matches expected derivation');
    } else {
      console.log(`   ❌ Address does NOT match derivation index ${derivationIndex}`);
      console.log(`   Expected: ${derivationCheck.expectedAddress}`);
      console.log(`   Actual:   ${derivationCheck.actualAddress}`);
    }
  }

  // 5. Final verdict
  console.log('\n' + '─'.repeat(60));
  console.log('\n📋 Verification Summary:\n');
  
  const allChecksPassed = 
    formatCheck.valid &&
    (blockchainCheck.exists || blockchainCheck.error?.includes('new address')) &&
    (derivationIndex === null || results.checks.derivation?.matches);

  if (allChecksPassed) {
    console.log('✅ Address is VALID and can receive crypto!');
    console.log('\n💡 To test receiving crypto:');
    console.log('   1. Send a small amount of TRX (for gas) to this address');
    console.log('   2. Send USDT (TRC20) to this address');
    console.log('   3. Check the address again to verify the transaction was received');
  } else {
    console.log('⚠️  Some checks failed. Review the details above.');
  }

  return results;
}

/**
 * Test transaction verification (check if address can receive)
 */
async function testTransaction(address) {
  console.log('\n🧪 Testing Transaction Receipt...\n');
  console.log(`Address: ${address}`);
  console.log('─'.repeat(60));

  try {
    // Get recent transactions
    const transactions = await tronService.getAddressTransactions(address, {
      limit: 5,
    });

    console.log(`\n📜 Recent Transactions: ${transactions.length}\n`);

    if (transactions.length === 0) {
      console.log('   ℹ️  No transactions found yet');
      console.log('   💡 Send a test transaction to verify the address can receive');
      return;
    }

    transactions.forEach((tx, index) => {
      console.log(`   Transaction ${index + 1}:`);
      console.log(`   ├─ Hash: ${tx.txHash}`);
      console.log(`   ├─ From: ${tx.from}`);
      console.log(`   ├─ To: ${tx.to}`);
      console.log(`   ├─ Amount: ${tx.value / 1_000_000} USDT`);
      console.log(`   └─ Time: ${new Date(tx.blockTimestamp).toLocaleString()}`);
      console.log('');
    });

    // Check if any are incoming
    const incoming = transactions.filter(tx => tx.to === address);
    if (incoming.length > 0) {
      console.log(`✅ Address has received ${incoming.length} transaction(s)!`);
    } else {
      console.log('⚠️  No incoming transactions found (only outgoing)');
    }
  } catch (error) {
    console.error(`❌ Error checking transactions: ${error.message}`);
  }
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Address Verification Script

Usage:
  node scripts/verify-address.js <address> [derivation_index]
  node scripts/verify-address.js --user-id <user_id>
  node scripts/verify-address.js --test-transaction <address>
  node scripts/verify-address.js --all-users

Examples:
  node scripts/verify-address.js TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE 0
  node scripts/verify-address.js --user-id 1
  node scripts/verify-address.js --test-transaction TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE
  node scripts/verify-address.js --all-users
`);
    process.exit(0);
  }

  try {
    // Validate HD wallet config
    const config = hdWallet.validateConfig();
    if (!config.valid) {
      console.error(`❌ HD Wallet not configured: ${config.error}`);
      console.error('   Set HD_MASTER_MNEMONIC environment variable');
      process.exit(1);
    }

    if (args[0] === '--user-id') {
      const userId = parseInt(args[1]);
      const user = db.prepare('SELECT id, username, tron_address, derivation_index FROM users WHERE id = ?').get(userId);
      
      if (!user) {
        console.error(`❌ User with ID ${userId} not found`);
        process.exit(1);
      }

      console.log(`\n👤 Verifying address for user: ${user.username} (ID: ${user.id})\n`);
      await verifyAddress(user.tron_address, user.derivation_index);
      
    } else if (args[0] === '--test-transaction') {
      const address = args[1];
      await verifyAddress(address);
      await testTransaction(address);
      
    } else if (args[0] === '--all-users') {
      const users = db.prepare('SELECT id, username, tron_address, derivation_index FROM users WHERE tron_address IS NOT NULL').all();
      
      if (users.length === 0) {
        console.log('No users with addresses found');
        process.exit(0);
      }

      console.log(`\n🔍 Verifying ${users.length} user addresses...\n`);
      
      for (const user of users) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`User: ${user.username} (ID: ${user.id})`);
        await verifyAddress(user.tron_address, user.derivation_index);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit delay
      }
      
    } else {
      const address = args[0];
      const derivationIndex = args[1] ? parseInt(args[1]) : null;
      await verifyAddress(address, derivationIndex);
    }
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
  verifyAddress,
  validateAddressFormat,
  checkAddressOnBlockchain,
  checkUsdtBalance,
  testTransaction,
};

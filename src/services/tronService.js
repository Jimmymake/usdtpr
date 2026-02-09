const axios = require('axios');
const crypto = require('crypto');

const TRON_API_URL = process.env.TRON_API_URL || 'https://api.trongrid.io';
const TRON_API_KEY = process.env.TRON_API_KEY;
const USDT_CONTRACT = process.env.USDT_CONTRACT;

// Create axios instance with default config
const tronApiHeaders = {
  'Content-Type': 'application/json',
};

// Only add API key if it exists and is not empty
if (TRON_API_KEY && TRON_API_KEY.trim() !== '') {
  tronApiHeaders['TRON-PRO-API-KEY'] = TRON_API_KEY;
}

const tronApi = axios.create({
  baseURL: TRON_API_URL,
  headers: tronApiHeaders,
  timeout: 30000,
});

// Base58 alphabet for Tron addresses
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Convert hex address to base58 Tron address
 * @param {string} hexAddress - Hex format address (0x... or 41...)
 * @returns {string} Base58 format address (T...)
 */
const hexToBase58 = (hexAddress) => {
  // Remove 0x prefix if present
  let cleanHex = hexAddress.startsWith('0x') ? hexAddress.slice(2) : hexAddress;
  
  // Add Tron prefix (41) if not present
  if (!cleanHex.startsWith('41')) {
    cleanHex = '41' + cleanHex;
  }
  
  const hexBytes = Buffer.from(cleanHex, 'hex');
  
  // Double SHA256 for checksum
  const hash1 = crypto.createHash('sha256').update(hexBytes).digest();
  const hash2 = crypto.createHash('sha256').update(hash1).digest();
  
  // Add checksum (first 4 bytes)
  const checksum = hash2.slice(0, 4);
  const addressBytes = Buffer.concat([hexBytes, checksum]);
  
  // Convert to BigInt for base58 encoding
  let num = BigInt('0x' + addressBytes.toString('hex'));
  let result = '';
  
  while (num > 0n) {
    const remainder = Number(num % 58n);
    num = num / 58n;
    result = BASE58_ALPHABET[remainder] + result;
  }
  
  // Add leading '1's for leading zero bytes
  for (let i = 0; i < addressBytes.length && addressBytes[i] === 0; i++) {
    result = '1' + result;
  }
  
  return result;
};

/**
 * Get TRC20 transaction details by transaction hash
 * @param {string} txHash - The transaction hash (TxID)
 * @returns {Promise<object|null>} Transaction data or null if not found
 */
const getTransactionByHash = async (txHash) => {
  try {
    // Get transaction events (for TRC20 transfers)
    const eventsResponse = await tronApi.get(`/v1/transactions/${txHash}/events`);
    
    if (!eventsResponse.data.success || !eventsResponse.data.data.length) {
      return null;
    }

    const event = eventsResponse.data.data[0];
    
    // Check if it's a Transfer event from USDT contract
    if (event.event_name !== 'Transfer' || event.contract_address !== USDT_CONTRACT) {
      return null;
    }

    // Convert hex addresses to base58
    const fromAddress = hexToBase58(event.result.from);
    const toAddress = hexToBase58(event.result.to);

    return {
      txHash: event.transaction_id,
      contractAddress: event.contract_address,
      from: fromAddress,
      to: toAddress,
      value: event.result.value,
      blockNumber: event.block_number,
      blockTimestamp: event.block_timestamp,
      eventName: event.event_name,
    };
  } catch (error) {
    console.error('Error fetching transaction:', error.message);
    throw new Error('Failed to fetch transaction from blockchain');
  }
};

/**
 * Get TRC20 transactions for an address
 * @param {string} address - Tron address
 * @param {object} options - Query options
 * @returns {Promise<array>} Array of transactions
 */
const getAddressTransactions = async (address, options = {}) => {
  try {
    const { limit = 20, contractAddress = USDT_CONTRACT } = options;
    
    const response = await tronApi.get(
      `/v1/accounts/${address}/transactions/trc20`,
      {
        params: {
          limit,
          contract_address: contractAddress,
        },
      }
    );

    if (!response.data.success) {
      return [];
    }

    return response.data.data.map((tx) => ({
      txHash: tx.transaction_id,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      tokenSymbol: tx.token_info.symbol,
      tokenDecimals: tx.token_info.decimals,
      blockTimestamp: tx.block_timestamp,
    }));
  } catch (error) {
    // Handle 401 authentication errors
    if (error.response && error.response.status === 401) {
      console.error(`⚠️  API authentication failed (401). Check your TRON_API_KEY in .env`);
      console.error(`   API URL: ${TRON_API_URL}`);
      console.error(`   API Key present: ${TRON_API_KEY ? 'Yes' : 'No'}`);
      console.error(`   Note: Some testnet endpoints may not require API keys`);
      
      // For testnet, try without API key as fallback
      if (TRON_API_URL.includes('shasta')) {
        console.log('   Attempting request without API key for testnet...');
        try {
          const fallbackApi = axios.create({
            baseURL: TRON_API_URL,
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000,
          });
          
          const fallbackResponse = await fallbackApi.get(
            `/v1/accounts/${address}/transactions/trc20`,
            {
              params: {
                limit,
                contract_address: contractAddress,
              },
            }
          );

          if (fallbackResponse.data.success && fallbackResponse.data.data) {
            return fallbackResponse.data.data.map((tx) => ({
              txHash: tx.transaction_id,
              from: tx.from,
              to: tx.to,
              value: tx.value,
              tokenSymbol: tx.token_info?.symbol,
              tokenDecimals: tx.token_info?.decimals,
              blockTimestamp: tx.block_timestamp,
            }));
          }
        } catch (fallbackError) {
          console.error('   Fallback request also failed:', fallbackError.message);
        }
      }
    }
    
    console.error('Error fetching address transactions:', error.message);
    // Return empty array instead of throwing to prevent deposit monitor from crashing
    return [];
  }
};

/**
 * Verify a USDT deposit transaction
 * @param {string} txHash - Transaction hash to verify
 * @param {string} expectedAddress - Expected recipient address (user's personal deposit address)
 * @returns {Promise<object>} Verification result
 */
const verifyUsdtDeposit = async (txHash, expectedAddress) => {
  const tx = await getTransactionByHash(txHash);
  
  if (!tx) {
    return {
      valid: false,
      error: 'Transaction not found or not a valid USDT transfer',
    };
  }

  // Check if sent to the expected deposit address
  if (expectedAddress && tx.to !== expectedAddress) {
    return {
      valid: false,
      error: 'Transaction was not sent to your deposit address',
      details: { expected: expectedAddress, received: tx.to },
    };
  }

  // Check if it's from USDT contract
  if (tx.contractAddress !== USDT_CONTRACT) {
    return {
      valid: false,
      error: 'Transaction is not a USDT transfer',
    };
  }

  // Calculate USDT amount (6 decimals)
  const usdtAmount = Number(tx.value) / 1_000_000;

  return {
    valid: true,
    data: {
      txHash: tx.txHash,
      from: tx.from,
      to: tx.to,
      usdtAmount,
      blockTimestamp: tx.blockTimestamp,
      blockNumber: tx.blockNumber,
    },
  };
};

module.exports = {
  getTransactionByHash,
  getAddressTransactions,
  verifyUsdtDeposit,
  hexToBase58,
};

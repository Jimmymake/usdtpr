/**
 * HD Wallet Service
 * Generates Tron addresses from a master seed using BIP39/BIP44
 */

const bip39 = require('bip39');
const { HDKey } = require('@scure/bip32');
const TronWeb = require('tronweb');
const crypto = require('crypto');

// Tron BIP44 path: m/44'/195'/0'/0/index
// 195 is Tron's coin type
const TRON_PATH = "m/44'/195'/0'/0";

/**
 * Get or validate the master mnemonic from environment
 * @returns {string} The master mnemonic
 */
const getMasterMnemonic = () => {
  const mnemonic = process.env.HD_MASTER_MNEMONIC;
  
  if (!mnemonic) {
    throw new Error('HD_MASTER_MNEMONIC environment variable is not set');
  }
  
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid HD_MASTER_MNEMONIC - not a valid BIP39 mnemonic');
  }
  
  return mnemonic;
};

/**
 * Generate a new random mnemonic (for initial setup)
 * @param {number} strength - 128 for 12 words, 256 for 24 words
 * @returns {string} New mnemonic phrase
 */
const generateMnemonic = (strength = 128) => {
  return bip39.generateMnemonic(strength);
};

/**
 * Derive a Tron address from the master seed at a specific index
 * @param {number} index - Derivation index (user's wallet index)
 * @returns {object} { address, publicKey }
 */
const deriveAddress = (index) => {
  const mnemonic = getMasterMnemonic();
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  
  // Create HD key from seed
  const hdKey = HDKey.fromMasterSeed(seed);
  
  // Derive child key at path m/44'/195'/0'/0/index
  const childKey = hdKey.derive(`${TRON_PATH}/${index}`);
  
  if (!childKey.privateKey) {
    throw new Error('Failed to derive private key');
  }
  
  // Get the private key as hex
  const privateKeyHex = Buffer.from(childKey.privateKey).toString('hex');
  
  // Use TronWeb to generate address from private key
  const address = TronWeb.utils.address.fromPrivateKey(privateKeyHex);
  
  return {
    address,
    index,
  };
};

/**
 * Derive private key for a specific index (used for consolidation/sweeping)
 * WARNING: Only call this when you need to sign a transaction
 * @param {number} index - Derivation index
 * @returns {string} Private key in hex format
 */
const derivePrivateKey = (index) => {
  const mnemonic = getMasterMnemonic();
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  
  const hdKey = HDKey.fromMasterSeed(seed);
  const childKey = hdKey.derive(`${TRON_PATH}/${index}`);
  
  if (!childKey.privateKey) {
    throw new Error('Failed to derive private key');
  }
  
  return Buffer.from(childKey.privateKey).toString('hex');
};

/**
 * Verify that an address matches a derivation index
 * @param {string} address - Tron address to verify
 * @param {number} index - Expected derivation index
 * @returns {boolean} True if address matches
 */
const verifyAddressIndex = (address, index) => {
  const derived = deriveAddress(index);
  return derived.address === address;
};

/**
 * Generate multiple addresses (for batch operations or recovery)
 * @param {number} startIndex - Starting index
 * @param {number} count - Number of addresses to generate
 * @returns {array} Array of { address, index }
 */
const deriveAddressBatch = (startIndex, count) => {
  const addresses = [];
  for (let i = 0; i < count; i++) {
    addresses.push(deriveAddress(startIndex + i));
  }
  return addresses;
};

/**
 * Initialize and validate HD wallet configuration
 * Call this on startup to ensure everything is configured
 * @returns {object} { valid: boolean, error?: string, testAddress?: string }
 */
const validateConfig = () => {
  try {
    const mnemonic = getMasterMnemonic();
    
    // Test derivation with index 0
    const testDerivation = deriveAddress(0);
    
    return {
      valid: true,
      testAddress: testDerivation.address,
      wordCount: mnemonic.split(' ').length,
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
    };
  }
};

module.exports = {
  generateMnemonic,
  deriveAddress,
  derivePrivateKey,
  verifyAddressIndex,
  deriveAddressBatch,
  validateConfig,
  getMasterMnemonic,
};

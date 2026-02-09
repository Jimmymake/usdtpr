# Address Verification Guide

This guide explains how to verify that your generated Tron addresses can actually receive crypto.

## Quick Start

### Verify a Single Address

```bash
# Verify an address directly
npm run verify-address TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE 0

# Or verify by user ID
npm run verify-address -- --user-id 1

# Check transaction history for an address
npm run verify-address -- --test-transaction TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE

# Verify all user addresses
npm run verify-address -- --all-users
```

## What Gets Verified

The verification script checks:

1. **Address Format** ✅
   - Validates Tron address format (starts with 'T', 34 characters, base58)
   - Uses TronWeb library validation

2. **Blockchain Existence** ✅
   - Checks if address exists on Tron blockchain
   - Gets TRX balance and transaction count
   - Note: New addresses may not exist yet (this is normal)

3. **USDT Balance** ✅
   - Checks current USDT (TRC20) balance
   - Verifies address can hold USDT tokens

4. **Derivation Verification** ✅
   - If derivation index is provided, verifies address matches expected derivation
   - Ensures HD wallet is generating correct addresses

5. **Transaction History** ✅ (with --test-transaction)
   - Shows recent transactions to/from the address
   - Confirms address has received crypto

## Verification Methods

### Method 1: Format Validation Only

This checks if the address format is correct (doesn't require blockchain access):

```bash
npm run verify-address TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE
```

### Method 2: Full Blockchain Verification

This checks format, blockchain existence, and USDT balance:

```bash
npm run verify-address TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE 0
```

### Method 3: Verify by User ID

Verify a specific user's address from your database:

```bash
npm run verify-address -- --user-id 1
```

### Method 4: Test Transaction Receipt

Check if an address has received any transactions:

```bash
npm run verify-address -- --test-transaction TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE
```

### Method 5: Verify All Users

Verify all addresses in your database:

```bash
npm run verify-address -- --all-users
```

## Testing with Real Transactions

To fully verify an address can receive crypto:

### Step 1: Send Test TRX (for gas)

Send a small amount of TRX (e.g., 1-10 TRX) to the address. This:
- Activates the address on the blockchain
- Provides gas for future USDT transactions

You can use:
- TronLink wallet
- Binance or other exchanges
- TronScan (https://tronscan.org) - send TRX

### Step 2: Send Test USDT

Send a small amount of USDT (TRC20) to the address:
- Minimum: 0.1 USDT (or your configured minimum)
- Use Binance, OKX, or any Tron wallet
- Make sure to use TRC20 network (not ERC20)

### Step 3: Verify Receipt

After sending, verify the transaction was received:

```bash
npm run verify-address -- --test-transaction YOUR_ADDRESS
```

Or check on TronScan:
- Visit: https://tronscan.org/#/address/YOUR_ADDRESS
- Look for the transaction in the transaction history

### Step 4: Check Auto-Credit

If your deposit monitor is running, the deposit should be automatically credited within 1-2 minutes. Check via:

```bash
# Check user balance via API
curl http://localhost:3000/api/v1/wallet/balance \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Common Issues

### "Address not found on blockchain"

**This is normal!** New addresses that haven't received any transactions yet won't appear in blockchain queries. The address is still valid and can receive crypto.

**Solution:** Send a small amount of TRX first to activate the address.

### "Address format validation failed"

**Problem:** The address format is incorrect.

**Solutions:**
- Check the address starts with 'T'
- Verify it's exactly 34 characters
- Ensure no typos or extra spaces

### "Address does NOT match derivation"

**Problem:** The address doesn't match the expected derivation from your HD wallet.

**Solutions:**
- Check your `HD_MASTER_MNEMONIC` is correct
- Verify the derivation index matches
- Ensure you're using the same mnemonic that generated the address

### "Error checking address: Request failed"

**Problem:** API connection issue or rate limiting.

**Solutions:**
- Check your `TRON_API_KEY` is set in `.env`
- Verify internet connection
- Wait a moment and try again (rate limit)

## Using Testnet (for Testing)

For testing without using real funds, you can use Tron Shasta testnet:

1. Get testnet TRX from: https://www.trongrid.io/faucet
2. Use testnet API: Set `TRON_API_URL=https://api.shasta.trongrid.io` in `.env`
3. Generate test addresses and verify them

## Integration with Your System

The verification script can be integrated into your application:

```javascript
const { verifyAddress } = require('./scripts/verify-address');

// Verify an address programmatically
const result = await verifyAddress('TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE', 0);
console.log(result);
```

## Monitoring Addresses

Your system already includes automatic deposit monitoring via `depositMonitor.js`. This:
- Polls all user addresses every 30 seconds (configurable)
- Automatically credits deposits when detected
- Handles duplicate transactions

To check monitor status, look at server logs or add an admin endpoint.

## Best Practices

1. **Always verify addresses before sharing with users**
   ```bash
   npm run verify-address -- --user-id <new_user_id>
   ```

2. **Test with small amounts first**
   - Send 0.1 USDT as a test
   - Verify it's credited correctly
   - Then proceed with larger amounts

3. **Monitor your addresses regularly**
   - Use `--all-users` to verify all addresses periodically
   - Check for any derivation mismatches

4. **Keep your mnemonic secure**
   - Never commit `HD_MASTER_MNEMONIC` to version control
   - Store encrypted backups
   - Test address derivation after restoring from backup

## Troubleshooting

If verification fails, check:

1. **Environment Variables**
   ```bash
   # Check .env file has:
   HD_MASTER_MNEMONIC=your twelve word mnemonic phrase here
   TRON_API_KEY=your_tron_api_key
   TRON_API_URL=https://api.trongrid.io
   ```

2. **Database Connection**
   - Ensure database is initialized
   - Check `data/usdtpr.db` exists

3. **API Access**
   - Verify TronGrid API key is valid
   - Check rate limits haven't been exceeded

## Additional Resources

- [TronScan Explorer](https://tronscan.org) - View addresses and transactions
- [TronGrid API Docs](https://www.trongrid.io/) - API documentation
- [TronWeb Documentation](https://developers.tron.network/) - Tron development docs

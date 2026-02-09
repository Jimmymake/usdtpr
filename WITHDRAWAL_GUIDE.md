# Withdrawal Guide

This guide explains how users can withdraw their KES balance as USDT.

## Overview

Users can withdraw their KES balance by converting it to USDT and receiving it at their specified Tron address. Withdrawals are processed automatically and sent from the master wallet.

## How Withdrawals Work

1. **User requests withdrawal** - Specifies amount (KES) and destination address
2. **System converts KES to USDT** - Using current exchange rate (1 USDT = 130 KES)
3. **Balance deducted** - User's KES balance is reduced
4. **USDT sent** - USDT is sent from master wallet to user's address
5. **Transaction recorded** - Withdrawal is logged in database

## API Endpoints

### Request Withdrawal

**POST** `/api/v1/wallet/withdraw`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "address": "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
  "amount": 1300.00
}
```

**Parameters:**
- `address` (string, required) - Tron address to receive USDT (must start with T, 34 characters)
- `amount` (number, required) - Amount in KES to withdraw (minimum: 130 KES = 1 USDT)

**Success Response (200):**
```json
{
  "status": true,
  "message": "Withdrawal successful!",
  "data": {
    "withdrawalId": 1,
    "txHash": "abc123...",
    "kesAmount": 1300.00,
    "usdtAmount": 10.00,
    "toAddress": "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
    "newBalance": 0.00
  }
}
```

**Error Responses:**

Insufficient balance (400):
```json
{
  "status": false,
  "message": "Insufficient balance. Available: 500.00 KES, Requested: 1300.00 KES"
}
```

Below minimum (400):
```json
{
  "status": false,
  "message": "Minimum withdrawal is 1 USDT (130 KES)"
}
```

Invalid address (400):
```json
{
  "status": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "address",
      "message": "Invalid Tron address format. Must start with T and be 34 characters."
    }
  ]
}
```

---

### Get Withdrawal Info

**GET** `/api/v1/wallet/withdrawal-info`

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "status": true,
  "data": {
    "minWithdrawal": 1,
    "maxWithdrawal": 10000,
    "minWithdrawalKES": 130,
    "maxWithdrawalKES": 1300000,
    "exchangeRate": 130,
    "availableBalance": 1300.00,
    "availableUsdt": 10.00,
    "masterWalletBalance": 5000.00,
    "masterWalletTrxBalance": 100.5,
    "canWithdraw": true
  }
}
```

---

### Get Withdrawal History

**GET** `/api/v1/wallet/withdrawals?page=1&limit=20`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (integer, optional) - Page number (default: 1)
- `limit` (integer, optional) - Items per page (default: 20, max: 100)

**Success Response (200):**
```json
{
  "status": true,
  "data": {
    "withdrawals": [
      {
        "id": 1,
        "toAddress": "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
        "kesAmount": 1300.00,
        "usdtAmount": 10.00,
        "exchangeRate": 130,
        "status": "completed",
        "txHash": "abc123...",
        "failureReason": null,
        "createdAt": "2026-02-09T10:30:00.000Z",
        "completedAt": "2026-02-09T10:30:05.000Z",
        "failedAt": null
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

**Withdrawal Status Values:**
- `pending` - Withdrawal requested, processing
- `completed` - USDT sent successfully
- `failed` - Withdrawal failed (balance refunded)

---

## Configuration

### Environment Variables

Add to your `.env` file:

```env
# Withdrawal Limits
MIN_WITHDRAWAL_USDT=1
MAX_WITHDRAWAL_USDT=10000

# Master Wallet Private Key (REQUIRED for withdrawals)
# This wallet sends USDT to users
# WARNING: Keep this secure! Never commit to version control.
MASTER_WALLET_PRIVATE_KEY=your_private_key_here
```

### Master Wallet Setup

**Option 1: Use Consolidation Wallet**
- Use the same wallet as `DEPOSIT_ADDRESS`
- Get private key from that wallet

**Option 2: Create Dedicated Withdrawal Wallet**
- Create a new Tron wallet
- Fund it with USDT and TRX (for gas)
- Use its private key for `MASTER_WALLET_PRIVATE_KEY`

**Important:**
- Master wallet must have USDT balance
- Master wallet must have TRX for gas fees (~10-20 TRX recommended)
- Keep private key secure and backed up

---

## Withdrawal Limits

**Default Limits:**
- Minimum: 1 USDT (130 KES at rate 130)
- Maximum: 10,000 USDT (1,300,000 KES at rate 130)

**Configure in `.env`:**
```env
MIN_WITHDRAWAL_USDT=1
MAX_WITHDRAWAL_USDT=10000
```

---

## Example Usage

### cURL Example

```bash
# Get withdrawal info
curl http://localhost:3000/api/v1/wallet/withdrawal-info \
  -H "Authorization: Bearer YOUR_TOKEN"

# Request withdrawal
curl -X POST http://localhost:3000/api/v1/wallet/withdraw \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
    "amount": 1300
  }'

# Get withdrawal history
curl http://localhost:3000/api/v1/wallet/withdrawals \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### JavaScript Example

```javascript
// Request withdrawal
const response = await fetch('http://localhost:3000/api/v1/wallet/withdraw', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
    amount: 1300, // KES
  }),
});

const result = await response.json();
console.log(result);
```

---

## How It Works

### Step-by-Step Process

1. **User Request**
   - User specifies amount (KES) and destination address
   - System validates address format and amount

2. **Balance Check**
   - System checks user has sufficient KES balance
   - System checks master wallet has sufficient USDT

3. **Balance Deduction**
   - User's KES balance is reduced (atomic transaction)
   - Withdrawal record created with status "pending"

4. **USDT Transfer**
   - System converts KES to USDT using exchange rate
   - USDT sent from master wallet to user's address
   - Transaction hash recorded

5. **Completion**
   - Withdrawal status updated to "completed"
   - Transaction recorded in transaction history

### Error Handling

If blockchain transfer fails:
- User's balance is automatically refunded
- Withdrawal status set to "failed"
- Failure reason recorded
- Refund transaction logged

---

## Security Considerations

1. **Private Key Security**
   - Never commit `MASTER_WALLET_PRIVATE_KEY` to version control
   - Store encrypted backups securely
   - Use environment variables, not hardcoded values

2. **Address Validation**
   - All addresses validated for correct format
   - Must be valid Tron addresses (start with T, 34 chars)

3. **Balance Checks**
   - User balance checked before deduction
   - Master wallet balance checked before sending
   - Atomic transactions prevent double-spending

4. **Transaction Logging**
   - All withdrawals logged in database
   - Transaction hashes recorded
   - Failed withdrawals automatically refunded

---

## Troubleshooting

### "MASTER_WALLET_PRIVATE_KEY not configured"
**Solution:** Add `MASTER_WALLET_PRIVATE_KEY` to `.env` file

### "Insufficient master wallet balance"
**Solution:** Fund master wallet with USDT

### "Insufficient TRX for gas"
**Solution:** Send TRX to master wallet (needs ~10-20 TRX)

### "Invalid Tron address"
**Solution:** Ensure address starts with 'T' and is 34 characters

### Withdrawal stuck in "pending"
**Solution:** Check server logs for blockchain errors, verify master wallet has funds

---

## Testing

### Test Withdrawal Flow

1. **Ensure master wallet is funded:**
   ```bash
   # Check master wallet balance
   # Should have USDT and TRX
   ```

2. **User requests withdrawal:**
   ```bash
   curl -X POST http://localhost:3000/api/v1/wallet/withdraw \
     -H "Authorization: Bearer TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"address": "TEST_ADDRESS", "amount": 130}'
   ```

3. **Verify on blockchain:**
   - Check transaction on TronScan
   - Verify USDT received at destination address

4. **Check withdrawal history:**
   ```bash
   curl http://localhost:3000/api/v1/wallet/withdrawals \
     -H "Authorization: Bearer TOKEN"
   ```

---

## Best Practices

1. **Monitor Master Wallet**
   - Regularly check USDT balance
   - Ensure sufficient TRX for gas
   - Set up alerts for low balance

2. **User Communication**
   - Show clear withdrawal limits
   - Display exchange rate
   - Provide transaction hash after completion

3. **Error Handling**
   - Handle blockchain errors gracefully
   - Automatically refund failed withdrawals
   - Log all errors for debugging

4. **Security**
   - Validate all inputs
   - Use atomic database transactions
   - Keep private keys secure

---

## Support

For withdrawal issues:
1. Check server logs for errors
2. Verify master wallet has funds
3. Check transaction on blockchain explorer
4. Review withdrawal history in database

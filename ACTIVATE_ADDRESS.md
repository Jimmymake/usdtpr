# Tron Address Activation Guide

## Why Activation is Needed

On the Tron network (including Shasta testnet), **new addresses must be activated** before they can:
- Receive TRC-20 tokens (like USDT)
- Be queried via API
- Appear in blockchain explorers
- Have transactions detected

**Activation Cost:** 1 TRX (charged when first transaction is sent)

## How to Activate Your Address

### Method 1: Send TRX (Easiest)

**For Testnet (Shasta):**

1. **Get Test TRX from Faucet:**
   - Visit: https://www.trongrid.io/faucet
   - Or: https://shasta.tronex.io/join/getJoinPage
   - Enter your address: `TBcY5RRNKVuzApHDUFoqaZeVdPa46iyfGE`
   - Complete CAPTCHA
   - Request test TRX

2. **Or Send TRX from Another Wallet:**
   - Use TronLink wallet (set to Shasta testnet)
   - Send 1-10 TRX to your address
   - This will activate the address

**For Mainnet:**

- Send any amount of TRX from an existing account
- Minimum: 1 TRX (activation fee) + bandwidth costs

### Method 2: Use API (Advanced)

You can use TronGrid API to create an activation transaction programmatically.

## Your Address Status

**Current Address:** `TBcY5RRNKVuzApHDUFoqaZeVdPa46iyfGE`

**Status:** ⚠️ **INACTIVATED** (needs activation)

**To Check Activation Status:**

```bash
# Check on Shasta explorer
# Visit: https://shasta.tronscan.org/#/address/TBcY5RRNKVuzApHDUFoqaZeVdPa46iyfGE

# Or use our script
npm run check-balance -- --user-id 1
```

**Activated when you see:**
- ✅ TRX balance > 0
- ✅ Transaction count > 0
- ✅ No "Inactivated address" warning

## After Activation

Once activated, your address can:
1. ✅ Receive USDT (TRC-20 tokens)
2. ✅ Be queried via API
3. ✅ Have deposits detected automatically
4. ✅ Appear in blockchain explorers

## Testing Flow

### Step 1: Activate Address
```bash
# Get test TRX from faucet
# Send to: TBcY5RRNKVuzApHDUFoqaZeVdPa46iyfGE
```

### Step 2: Verify Activation
```bash
npm run check-balance -- --user-id 1
# Should show TRX balance > 0
```

### Step 3: Send Test USDT
```bash
# Get test USDT from faucet or send from wallet
# Send 5+ USDT to: TBcY5RRNKVuzApHDUFoqaZeVdPa46iyfGE
```

### Step 4: Monitor Deposit
```bash
npm run test-deposit -- --user-id 1 --amount 5
# Will show when USDT arrives and KES is credited
```

## Important Notes

⚠️ **Activation is Required:**
- Addresses must be activated before receiving tokens
- Activation costs 1 TRX (one-time fee)
- Activation happens automatically when first TRX is received

⚠️ **Bandwidth Requirements:**
- Sender needs bandwidth (or pays 0.1 TRX burn fee)
- Can get bandwidth by staking TRX

⚠️ **Contract Activation:**
- Contracts can activate addresses too
- Costs extra 25,000 Energy

## Quick Activation Checklist

- [ ] Get test TRX from faucet
- [ ] Send TRX to your address
- [ ] Wait for confirmation (1-2 minutes)
- [ ] Verify activation (check explorer or script)
- [ ] Send test USDT
- [ ] Monitor deposit detection

## Troubleshooting

**Address still shows as inactive?**
- Wait 1-2 minutes for blockchain confirmation
- Check transaction on explorer
- Verify TRX was actually sent

**Can't get TRX from faucet?**
- Try different faucet
- Wait a few minutes and try again
- Some faucets have rate limits

**Deposit not detected after activation?**
- Ensure server is running (`npm start`)
- Check deposit monitor logs
- Verify USDT was sent to correct address
- Check minimum deposit requirement (5 USDT)

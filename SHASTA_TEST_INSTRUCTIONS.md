# Shasta Testnet Testing Instructions

## Quick Steps to Test 5 USDT Deposit

### Step 1: Switch to Testnet

Update your `.env` file:

```env
TRON_API_URL=https://api.shasta.trongrid.io
USDT_CONTRACT=TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs
```

Or backup your current `.env` and use the testnet version:
```bash
cp .env .env.mainnet.backup
cp .env.testnet .env
```

### Step 2: Restart Your Server

```bash
npm start
```

The deposit monitor will automatically start and use testnet.

### Step 3: Get Test USDT from Shasta Faucet

**Option 1: Community TRC-20 Faucet (Recommended)**
1. Visit: https://testnet-tron-faucet-phi.vercel.app
2. Enter your testnet address
3. Request test USDT
4. Complete CAPTCHA
5. Wait 1-2 minutes

**Option 2: Shasta Official Faucet**
1. Visit: https://shasta.tronex.io/join/getJoinPage
2. Enter your address
3. Get test TRX and tokens

**Option 3: TronGrid Faucet**
1. Visit: https://www.trongrid.io/faucet
2. Enter your address
3. Get test TRX (then swap for USDT if needed)

### Step 4: Get Your Testnet Address

Your addresses on testnet will be **different** from mainnet addresses!

Check your user's testnet address:
```bash
npm run check-balance -- --user-id 1
```

Or register a new test user (will generate testnet address):
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "0711111111",
    "username": "testuser",
    "password": "test123"
  }'
```

### Step 5: Send 5 Test USDT

Once you have test USDT:
1. Use TronLink wallet (switch to Shasta testnet)
2. Send 5 USDT (TRC20) to your testnet address
3. Wait for confirmation

### Step 6: Monitor the Deposit

Run the monitoring script:
```bash
npm run test-deposit -- --user-id 1 --amount 5
```

This will:
- Monitor on-chain USDT balance
- Monitor database KES balance
- Show when deposit is detected
- Show when balance is credited
- Auto-stop when complete

### Step 7: Verify Balances

Check both balances:
```bash
npm run check-balance -- --user-id 1
```

Expected results:
- On-chain: 5.000000 USDT
- Database: 650.00 KES (5 × 130)

## Important Notes

⚠️ **Testnet addresses are different from mainnet!**
- Same derivation index = different address on testnet
- Make sure you're using the testnet address

⚠️ **Minimum deposit is 5 USDT**
- Your `.env` has `MIN_DEPOSIT_USDT=5`
- Deposits below 5 USDT will be rejected

✅ **Deposit monitor runs automatically**
- Checks every 30 seconds
- Credits deposits automatically
- No manual verification needed

## Troubleshooting

**Deposit not detected?**
- Check server logs for deposit monitor activity
- Verify you're on testnet (check `.env`)
- Restart server after changing `.env`
- Check address on Shasta explorer: https://shasta.tronscan.org

**Balance not credited?**
- Check deposit monitor is running (server logs)
- Verify transaction on Shasta explorer
- Check minimum deposit requirement (5 USDT)
- Check deposit status in database

## Switch Back to Mainnet

When done testing:
```bash
cp .env.mainnet.backup .env
npm start
```

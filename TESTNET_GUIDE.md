# Tron Testnet (Shasta) Testing Guide

This guide explains how to use Tron's Shasta testnet to test your USDT payment processor **without using real money**.

## What is Shasta Testnet?

Shasta is Tron's official testnet where you can:
- ✅ Get free test TRX and USDT
- ✅ Test your application without risk
- ✅ Verify deposits and transactions
- ✅ Test all features safely

**Important:** Testnet tokens have NO real value and cannot be converted to real money.

---

## Quick Start

### 1. Check Your Current Network

```bash
npm run testnet -- --check
```

This shows whether you're on mainnet (real) or testnet (testing).

### 2. Switch to Testnet

Update your `.env` file:

```env
# Testnet Configuration
TRON_API_URL=https://api.shasta.trongrid.io
USDT_CONTRACT=TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs

# Keep your API key (works for both)
TRON_API_KEY=your_api_key_here
```

**⚠️ Backup your current `.env` before switching!**

### 3. Get Testnet Configuration

```bash
npm run testnet -- --config
```

This prints the exact configuration you need.

---

## Getting Test USDT

### Method 1: Official Tron Faucet (Recommended)

1. Visit: https://www.trongrid.io/faucet
2. Enter your Tron address
3. Complete CAPTCHA
4. Click "Get TRX"
5. Wait 1-2 minutes for confirmation

**Note:** This gives you test TRX. You'll need to swap some for test USDT or use Method 2.

### Method 2: Shasta Testnet Faucet

1. Visit: https://shasta.tronex.io/join/getJoinPage
2. Enter your address
3. Complete verification
4. Get test TRX and tokens

### Method 3: Community TRC-20 Faucet

1. Visit: https://testnet-tron-faucet-phi.vercel.app
2. Enter your address
3. Request test USDT directly

### Using the Script

```bash
# Show faucet links for an address
npm run testnet -- --faucet TBcY5RRNKVuzApHDUFoqaZeVdPa46iyfGE

# Check testnet balance
npm run testnet -- --balance TBcY5RRNKVuzApHDUFoqaZeVdPa46iyfGE
```

---

## Testing Your Application

### Step 1: Switch to Testnet

```bash
# Check current network
npm run testnet -- --check

# Update .env with testnet settings
# (see configuration above)
```

### Step 2: Generate Test Addresses

Your HD wallet will generate addresses on testnet. These are **different** from mainnet addresses:

```bash
# Register a test user (will generate testnet address)
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "0712345678",
    "username": "testuser",
    "password": "test123"
  }'
```

### Step 3: Get Test USDT

1. Copy the generated testnet address
2. Visit one of the faucet links above
3. Request test USDT
4. Wait for confirmation

### Step 4: Verify Receipt

```bash
# Check if test USDT was received
npm run verify-address -- --test-transaction YOUR_TESTNET_ADDRESS

# Or check balance
npm run testnet -- --balance YOUR_TESTNET_ADDRESS
```

### Step 5: Test Deposit Detection

Your deposit monitor should automatically detect testnet deposits:

1. Send test USDT to a user's testnet address
2. Wait 1-2 minutes
3. Check user balance via API:
   ```bash
   curl http://localhost:3000/api/v1/wallet/balance \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

---

## Testnet vs Mainnet Differences

| Feature | Mainnet | Testnet (Shasta) |
|---------|---------|------------------|
| **API URL** | `https://api.trongrid.io` | `https://api.shasta.trongrid.io` |
| **USDT Contract** | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | `TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs` |
| **Token Value** | Real money | Free (no value) |
| **Addresses** | Different | Different |
| **Block Explorer** | https://tronscan.org | https://shasta.tronscan.org |
| **Speed** | Normal | Faster (for testing) |

**Important:** Addresses generated on testnet are **completely different** from mainnet addresses, even with the same derivation index.

---

## Testing Checklist

- [ ] Switch `.env` to testnet configuration
- [ ] Restart your server
- [ ] Generate test user addresses
- [ ] Get test USDT from faucet
- [ ] Send test USDT to test address
- [ ] Verify deposit detection works
- [ ] Check auto-credit functionality
- [ ] Test deposit verification endpoint
- [ ] Test transaction history
- [ ] Switch back to mainnet when done

---

## Common Testnet Addresses

These are commonly used testnet addresses for testing:

- **Test USDT Contract:** `TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs`
- **Test TRX Faucet:** Various (see faucet links above)

---

## Troubleshooting

### "Address not found on testnet"

**Problem:** Your address doesn't exist on testnet yet.

**Solution:** 
- Make sure you're using testnet API URL
- Send a small amount of test TRX first to activate the address
- Addresses are different between mainnet and testnet

### "Transaction not detected"

**Problem:** Deposit monitor not detecting testnet transactions.

**Solution:**
- Verify `.env` has testnet API URL
- Restart your server after changing `.env`
- Check deposit monitor logs
- Verify transaction on Shasta explorer: https://shasta.tronscan.org

### "Invalid contract address"

**Problem:** Using mainnet USDT contract on testnet.

**Solution:**
- Update `USDT_CONTRACT` in `.env` to testnet contract:
  ```
  USDT_CONTRACT=TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs
  ```

### "Faucet not working"

**Problem:** Can't get test tokens from faucet.

**Solutions:**
- Try different faucet (there are multiple)
- Wait a few minutes and try again
- Check if address is valid on testnet
- Some faucets have rate limits

---

## Switching Back to Mainnet

When you're done testing:

1. **Backup your testnet `.env`** (optional, for future testing)
2. **Restore mainnet configuration:**

```env
# Mainnet Configuration
TRON_API_URL=https://api.trongrid.io
USDT_CONTRACT=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
TRON_API_KEY=your_api_key_here
```

3. **Restart your server**

---

## Testnet Resources

- **Shasta Explorer:** https://shasta.tronscan.org
- **Testnet API Docs:** https://developers.tron.network/docs/networks
- **Official Faucet:** https://www.trongrid.io/faucet
- **Shasta Faucet:** https://shasta.tronex.io/join/getJoinPage
- **TRC-20 Faucet:** https://testnet-tron-faucet-phi.vercel.app

---

## Best Practices

1. **Always test on testnet first** before deploying to mainnet
2. **Use separate test accounts** - don't mix test and real addresses
3. **Document test scenarios** - keep track of what you've tested
4. **Clean up test data** - reset database between test runs if needed
5. **Monitor testnet limits** - some faucets have daily limits

---

## Example Test Flow

```bash
# 1. Check network
npm run testnet -- --check

# 2. Switch to testnet (update .env)
# TRON_API_URL=https://api.shasta.trongrid.io
# USDT_CONTRACT=TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs

# 3. Restart server
npm start

# 4. Register test user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone":"0712345678","username":"test","password":"test123"}'

# 5. Get testnet address from response
# Copy the depositAddress

# 6. Get test USDT
# Visit faucet and paste address

# 7. Verify receipt
npm run testnet -- --balance YOUR_TESTNET_ADDRESS

# 8. Check auto-credit
curl http://localhost:3000/api/v1/wallet/balance \
  -H "Authorization: Bearer YOUR_TOKEN"

# 9. Switch back to mainnet when done
```

---

## Security Notes

- ⚠️ **Testnet tokens are FREE** - never pay for testnet tokens
- ⚠️ **Testnet addresses are different** - don't send real funds to testnet addresses
- ⚠️ **Backup your configs** - keep separate mainnet and testnet `.env` files
- ⚠️ **Don't commit `.env`** - keep testnet configs out of version control

---

Happy testing! 🧪

# USDT Payment Processor API Documentation

## Overview

A Node.js REST API for processing USDT (TRC20) deposits and converting them to KES (Kenyan Shillings). The API uses **HD Wallets** to generate unique deposit addresses for each user and **automatically detects** incoming deposits on the Tron blockchain.

**Key Features:**
- Each user gets a unique personal USDT deposit address
- Deposits are automatically detected and credited (no manual TxID submission required)
- HD Wallet system - all addresses derived from a single master seed
- Secure blockchain verification via TronGrid API

**Base URL:** `http://localhost:3000`

**Version:** 2.0.0

---

## Table of Contents

1. [Authentication](#authentication)
2. [Error Handling](#error-handling)
3. [Rate Limiting](#rate-limiting)
4. [Endpoints](#endpoints)
   - [Auth](#auth-endpoints)
   - [Deposit](#deposit-endpoints)
   - [Wallet](#wallet-endpoints)
   - [Admin](#admin-endpoints)
5. [Data Models](#data-models)
6. [Examples](#examples)

---

## Authentication

The API uses **JWT (JSON Web Token)** for authentication.

### How to Authenticate

1. Register or login to get a token
2. Include the token in the `Authorization` header:

```
Authorization: Bearer <your_token>
```

### Token Details

- **Expiry:** 24 hours
- **Algorithm:** HS256

---

## Error Handling

All errors follow a consistent format:

```json
{
  "status": false,
  "message": "Error description",
  "errors": [
    {
      "field": "fieldName",
      "message": "Validation error message"
    }
  ]
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (invalid/missing token) |
| 403 | Forbidden (account deactivated) |
| 404 | Not Found |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |

---

## Rate Limiting

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| General API | 100 requests | 15 minutes |
| Auth (login/register) | 10 requests | 15 minutes |
| Deposit verification | 5 requests | 1 hour |

When rate limited, you'll receive:

```json
{
  "status": false,
  "message": "Too many requests, please try again later."
}
```

---

## Endpoints

### Auth Endpoints

#### Register User

Create a new user account.

```
POST /api/v1/auth/register
```

**Headers:**
```
Content-Type: application/json
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| phone | string | Yes | Phone number (10-15 digits) |
| username | string | Yes | Username (3-30 alphanumeric chars) |
| password | string | Yes | Password (min 6 characters) |
| referralCode | string | No | Optional referral code |

**Example Request:**
```json
{
  "phone": "0712345678",
  "username": "johndoe",
  "password": "securepass123",
  "referralCode": "REF001"
}
```

**Success Response (201):**
```json
{
  "status": true,
  "message": "Account created successfully",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "phone": "0712345678",
      "username": "johndoe",
      "balance": 0,
      "depositAddress": "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE"
    }
  }
}
```

> **Note:** Each user receives a unique personal deposit address (`depositAddress`) upon registration.

**Error Response (400):**
```json
{
  "status": false,
  "message": "Phone or username already exists"
}
```

---

#### Login

Authenticate and get access token.
New Request
```
POST /api/v1/auth/login
```

**Headers:**
```
Content-Type: application/json
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| phone | string | Yes | Registered phone number |
| password | string | Yes | Account password |

**Example Request:**
```json
{
  "phone": "0712345678",
  "password": "securepass123"
}
```

**Success Response (200):**
```json
{
  "status": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "phone": "0712345678",
      "username": "johndoe",
      "balance": 1300.00,
      "depositAddress": "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE"
    }
  }
}
```

**Error Response (401):**
```json
{
  "status": false,
  "message": "Invalid credentials"
}
```

---

#### Get Profile

Get current user's profile information.

```
GET /api/v1/auth/me
```

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "status": true,
  "data": {
    "id": 1,
    "phone": "0712345678",
    "username": "johndoe",
    "balance": 1300.00,
    "depositAddress": "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
    "createdAt": "2026-02-06T10:30:00.000Z"
  }
}
```

---

### Deposit Endpoints

#### Get Deposit Address

Get the user's **personal unique** USDT deposit address and instructions.

```
GET /api/v1/deposit/address
```

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "status": true,
  "data": {
    "network": "TRC20",
    "address": "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
    "token": "USDT",
    "exchangeRate": 130,
    "minDeposit": 0.1,
    "maxDeposit": 10000,
    "autoCredit": true,
    "instructions": [
      "Send USDT (TRC20) to YOUR personal address above",
      "This address is unique to your account",
      "Only send from exchanges like Binance, OKX, etc.",
      "Your account will be credited automatically within 1-2 minutes",
      "No need to submit transaction ID - deposits are detected automatically"
    ]
  }
}
```

> **Note:** The `address` field contains a unique address for each user. Deposits to this address are automatically detected and credited.

---

#### Verify Deposit (Manual/Backup)

Submit a transaction ID to manually verify and credit a USDT deposit. 

> **Note:** This endpoint is typically not needed as deposits are automatically detected. Use this only if auto-detection hasn't credited your deposit within a few minutes.

```
POST /api/v1/deposit/verify
```

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| txId | string | Yes | Transaction hash (64 hex characters) |

**Example Request:**
```json
{
  "txId": "77dbaeeace1c931fe4a4dd57de35d2cf1227962f8d434f590cf567dda4ab2f07"
}
```

**Success Response (200):**
```json
{
  "status": true,
  "message": "Deposit successful!",
  "data": {
    "depositId": 1,
    "usdtReceived": 100.00,
    "exchangeRate": 130,
    "kesCredited": 13000.00,
    "newBalance": 13000.00
  }
}
```

**Error Responses:**

Transaction already processed (400):
```json
{
  "status": false,
  "message": "This transaction has already been processed"
}
```

Wrong recipient (400):
```json
{
  "status": false,
  "message": "Transaction was not sent to your deposit address",
  "details": {
    "expected": "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
    "received": "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7"
  }
}
```

Below minimum (400):
```json
{
  "status": false,
  "message": "Deposit amount (0.05 USDT) is below minimum (0.1 USDT)"
}
```

Invalid TxID format (400):
```json
{
  "status": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "txId",
      "message": "Invalid transaction ID format. Must be 64 hexadecimal characters."
    }
  ]
}
```

---

#### Get Deposit Status

Check the status of a specific deposit.

```
GET /api/v1/deposit/status/:id
```

**Headers:**
```
Authorization: Bearer <token>
```

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Deposit ID |

**Success Response (200):**
```json
{
  "status": true,
  "data": {
    "id": 1,
    "txHash": "77dbaeeace1c931fe4a4dd57de35d2cf1227962f8d434f590cf567dda4ab2f07",
    "usdtAmount": 100.00,
    "exchangeRate": 130,
    "kesAmount": 13000.00,
    "status": "completed",
    "failureReason": null,
    "createdAt": "2026-02-06T10:30:00.000Z",
    "verifiedAt": "2026-02-06T10:30:05.000Z"
  }
}
```

**Deposit Status Values:**

| Status | Description |
|--------|-------------|
| pending | Initial state |
| verifying | Being verified on blockchain |
| completed | Successfully credited |
| failed | Verification failed |
| rejected | Rejected (wrong address, limits, etc.) |

---

#### Get Deposit History

Get paginated list of user's deposits.

```
GET /api/v1/deposit/history
```

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | integer | 1 | Page number |
| limit | integer | 20 | Items per page (max 100) |

**Example:** `GET /api/v1/deposit/history?page=1&limit=10`

**Success Response (200):**
```json
{
  "status": true,
  "data": {
    "deposits": [
      {
        "id": 1,
        "txHash": "77dbaeeace1c931fe4a4dd57de35d2cf1227962f8d434f590cf567dda4ab2f07",
        "usdtAmount": 100.00,
        "exchangeRate": 130,
        "kesAmount": 13000.00,
        "status": "completed",
        "createdAt": "2026-02-06T10:30:00.000Z",
        "verifiedAt": "2026-02-06T10:30:05.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

### Wallet Endpoints

#### Get Balance

Get user's current KES balance.

```
GET /api/v1/wallet/balance
```

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "status": true,
  "data": {
    "balance": 13000.00,
    "currency": "KES"
  }
}
```

---

#### Get Transaction History

Get paginated list of all wallet transactions.

```
GET /api/v1/wallet/transactions
```

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | integer | 1 | Page number |
| limit | integer | 20 | Items per page (max 100) |
| type | string | - | Filter by type: `deposit`, `withdrawal`, `bet`, `win`, `bonus`, `refund` |

**Example:** `GET /api/v1/wallet/transactions?page=1&limit=10&type=deposit`

**Success Response (200):**
```json
{
  "status": true,
  "data": {
    "transactions": [
      {
        "id": 1,
        "type": "deposit",
        "amount": 13000.00,
        "balanceBefore": 0.00,
        "balanceAfter": 13000.00,
        "description": "USDT deposit: 100 USDT @ 130",
        "createdAt": "2026-02-06T10:30:05.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

#### Get Exchange Rate

Get current USDT to KES exchange rate.

```
GET /api/v1/wallet/exchange-rate
```

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "status": true,
  "data": {
    "from": "USDT",
    "to": "KES",
    "rate": 130,
    "updatedAt": "2026-02-06T10:30:00.000Z"
  }
}
```

---

### Admin Endpoints

Admin endpoints for fund consolidation and wallet management.

#### Get Consolidation Status

Get overview of all user wallets and their USDT balances.

```
GET /api/v1/admin/consolidation/status
```

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "status": true,
  "data": {
    "consolidationAddress": "TCCmNPLPn9zybshidtN63Gw3QabjDkNxUK",
    "consolidationBalance": 500.00,
    "minSweepAmount": 1,
    "walletsToSweep": 3,
    "walletsNeedingGas": 1,
    "totalUsdtToSweep": 150.50,
    "wallets": [
      {
        "userId": 1,
        "username": "johndoe",
        "address": "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
        "derivationIndex": 0,
        "usdtBalance": 50.00,
        "trxBalance": 15.5,
        "hasSufficientGas": true
      }
    ]
  }
}
```

---

#### Sweep All Wallets

Sweep USDT from all eligible user wallets to the consolidation address.

```
POST /api/v1/admin/consolidation/sweep
```

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "status": true,
  "message": "Swept 2 wallets, 100.50 USDT total",
  "data": {
    "success": true,
    "swept": 2,
    "failed": 0,
    "needsGas": 1,
    "totalUsdt": 100.50,
    "details": [
      {
        "userId": 1,
        "address": "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
        "status": "swept",
        "amount": 50.00,
        "txHash": "abc123..."
      },
      {
        "userId": 3,
        "address": "TXyz...",
        "status": "needs_gas",
        "usdtBalance": 25.00,
        "trxBalance": 2.5
      }
    ]
  }
}
```

> **Note:** Wallets need ~10-20 TRX for gas fees. Wallets without sufficient TRX will be skipped.

---

#### Sweep Specific User

Sweep USDT from a specific user's wallet.

```
POST /api/v1/admin/consolidation/sweep/:userId
```

**Headers:**
```
Authorization: Bearer <token>
```

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| userId | integer | User ID to sweep |

**Success Response (200):**
```json
{
  "status": true,
  "message": "Swept 50.00 USDT from user johndoe",
  "data": {
    "success": true,
    "txHash": "abc123...",
    "amount": 50.00,
    "from": "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
    "to": "TCCmNPLPn9zybshidtN63Gw3QabjDkNxUK"
  }
}
```

---

#### Get Sweep History

Get paginated history of all sweep operations.

```
GET /api/v1/admin/consolidation/history
```

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | integer | 1 | Page number |
| limit | integer | 20 | Items per page |

**Success Response (200):**
```json
{
  "status": true,
  "data": {
    "sweeps": [
      {
        "id": 1,
        "userId": 1,
        "username": "johndoe",
        "fromAddress": "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
        "toAddress": "TCCmNPLPn9zybshidtN63Gw3QabjDkNxUK",
        "usdtAmount": 50.00,
        "txHash": "abc123...",
        "status": "completed",
        "createdAt": "2026-02-07T10:30:00.000Z"
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

---

#### Get User Wallet Info

Get detailed wallet information for a specific user.

```
GET /api/v1/admin/wallet/:userId
```

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "status": true,
  "data": {
    "userId": 1,
    "username": "johndoe",
    "address": "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
    "derivationIndex": 0,
    "usdtBalance": 50.00,
    "trxBalance": 15.5,
    "hasSufficientGas": true
  }
}
```

---

## Data Models

### User

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Unique identifier |
| phone | string | Phone number |
| username | string | Username |
| balance_kes | decimal | KES balance |
| tron_address | string | User's unique deposit address |
| derivation_index | integer | HD wallet derivation index |
| is_active | boolean | Account status |
| created_at | timestamp | Registration date |

### Deposit

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Unique identifier |
| user_id | integer | User ID |
| tx_hash | string | Blockchain transaction hash |
| from_address | string | Sender's Tron address |
| to_address | string | Recipient's Tron address |
| usdt_amount | decimal | USDT amount received |
| exchange_rate | decimal | Rate at time of deposit |
| kes_amount | decimal | KES amount credited |
| status | string | Deposit status |
| created_at | timestamp | Submission date |
| verified_at | timestamp | Verification date |

### Transaction

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Unique identifier |
| user_id | integer | User ID |
| type | string | Transaction type |
| amount | decimal | Transaction amount |
| balance_before | decimal | Balance before transaction |
| balance_after | decimal | Balance after transaction |
| description | string | Transaction description |
| created_at | timestamp | Transaction date |

### Sweep

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Unique identifier |
| user_id | integer | User ID |
| from_address | string | Source wallet address |
| to_address | string | Consolidation address |
| usdt_amount | decimal | USDT amount swept |
| tx_hash | string | Blockchain transaction hash |
| status | string | Sweep status (pending, completed, failed) |
| created_at | timestamp | Sweep date |

---

## Examples

### Complete Deposit Flow

#### 1. Register

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "0712345678",
    "username": "johndoe",
    "password": "securepass123"
  }'
```

The response will include your unique `depositAddress`.

#### 2. Get Deposit Address

```bash
curl http://localhost:3000/api/v1/deposit/address \
  -H "Authorization: Bearer YOUR_TOKEN"
```

This returns your personal unique deposit address.

#### 3. Send USDT

Send USDT (TRC20) to **your personal address** using Binance or any Tron wallet.

#### 4. Wait for Auto-Credit (NEW!)

Your account will be **automatically credited** within 1-2 minutes. No need to submit a transaction ID!

The system continuously monitors all user deposit addresses and credits accounts automatically when deposits are detected.

#### 5. Check Balance

```bash
curl http://localhost:3000/api/v1/wallet/balance \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Optional: Manual Verification

If your deposit hasn't been credited after a few minutes, you can manually verify:

```bash
curl -X POST http://localhost:3000/api/v1/deposit/verify \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "txId": "YOUR_TRANSACTION_HASH"
  }'
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| NODE_ENV | development | Environment |
| JWT_SECRET | - | JWT signing secret (required) |
| JWT_EXPIRES_IN | 24h | Token expiry |
| TRON_API_KEY | - | TronGrid API key (required) |
| USDT_CONTRACT | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t | Official USDT TRC20 contract |
| USDT_TO_KES_RATE | 130 | Fixed exchange rate |
| MIN_DEPOSIT_USDT | 0.1 | Minimum deposit |
| MAX_DEPOSIT_USDT | 10000 | Maximum deposit |
| HD_MASTER_MNEMONIC | - | **CRITICAL** - 12/24 word BIP39 seed phrase for HD wallet |
| DEPOSIT_POLL_INTERVAL_MS | 30000 | How often to check for new deposits (ms) |
| DEPOSIT_MONITOR_BATCH_SIZE | 50 | Number of addresses to check per batch |
| DEPOSIT_ADDRESS | - | Master consolidation wallet address |
| MIN_SWEEP_USDT | 1 | Minimum USDT balance to trigger sweep |

### HD Wallet Setup

The system uses HD (Hierarchical Deterministic) wallets to generate unique deposit addresses for each user.

**Initial Setup:**

1. Generate a new mnemonic (12 or 24 words):
```javascript
const bip39 = require('bip39');
const mnemonic = bip39.generateMnemonic(128); // 12 words
console.log(mnemonic);
```

2. Set the `HD_MASTER_MNEMONIC` environment variable with this phrase.

3. **CRITICAL: Securely backup this mnemonic!** It controls all deposit addresses.

**Security Notes:**
- Never share or expose the master mnemonic
- Store encrypted backups in multiple secure locations
- All user deposit addresses can be recovered from this single seed

---

## Security Considerations

1. **HD Master Mnemonic** - This is the most critical secret. Store it encrypted and backed up securely. Never commit to version control.
2. **JWT Tokens** - Always keep tokens secure, never expose in URLs
3. **HTTPS** - Use HTTPS in production
4. **Rate Limiting** - API is rate limited to prevent abuse
5. **Input Validation** - All inputs are validated
6. **One-time TxID** - Transaction IDs can only be used once
7. **Blockchain Verification** - All deposits verified on Tron blockchain
8. **Unique Addresses** - Each user has their own deposit address, preventing deposit attribution errors

---

## Support

For API issues or questions, contact the development team.

**API Version:** 1.0.0  
**Last Updated:** February 2026


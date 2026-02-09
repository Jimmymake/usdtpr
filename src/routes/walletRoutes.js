const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

// All wallet routes require authentication
router.use(authenticate);

// Get wallet balance
router.get('/balance', walletController.getBalance);

// Get transaction history
router.get('/transactions', validate(schemas.transactionHistory, 'query'), walletController.getTransactionHistory);

// Get exchange rate (public info but keeping it under wallet)
router.get('/exchange-rate', walletController.getExchangeRate);

module.exports = router;


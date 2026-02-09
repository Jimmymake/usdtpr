const express = require('express');
const router = express.Router();
const depositController = require('../controllers/depositController');
const { authenticate } = require('../middleware/auth');
const { depositLimiter } = require('../middleware/rateLimiter');
const { validate, schemas } = require('../middleware/validate');

// All deposit routes require authentication
router.use(authenticate);

// Get deposit address and instructions
router.get('/address', depositController.getDepositAddress);

// Verify and process deposit (rate limited)
router.post('/verify', depositLimiter, validate(schemas.verifyDeposit), depositController.verifyDeposit);

// Get deposit status
router.get('/status/:id', depositController.getDepositStatus);

// Get deposit history
router.get('/history', depositController.getDepositHistory);

module.exports = router;


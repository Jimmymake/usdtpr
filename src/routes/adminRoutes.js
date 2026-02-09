const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate } = require('../middleware/auth');

// All admin routes require authentication
// In production, add admin role check middleware
router.use(authenticate);

// Consolidation routes
router.get('/consolidation/status', adminController.getConsolidationStatus);
router.post('/consolidation/sweep', adminController.sweepAll);
router.post('/consolidation/sweep/:userId', adminController.sweepUser);
router.get('/consolidation/history', adminController.getSweepHistory);

// Wallet info
router.get('/wallet/:userId', adminController.getUserWalletInfo);

module.exports = router;

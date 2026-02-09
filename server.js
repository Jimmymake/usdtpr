require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { apiLimiter } = require('./src/middleware/rateLimiter');

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const depositRoutes = require('./src/routes/depositRoutes');
const walletRoutes = require('./src/routes/walletRoutes');
const adminRoutes = require('./src/routes/adminRoutes');

// Import services
const depositMonitor = require('./src/services/depositMonitor');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Apply general rate limiting to all routes
app.use(apiLimiter);

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/deposit', depositRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API info
app.get('/', (req, res) => {
  res.json({
    name: 'USDT Payment Processor API',
    version: '2.0.0',
    endpoints: {
      auth: {
        register: 'POST /api/v1/auth/register',
        login: 'POST /api/v1/auth/login',
        profile: 'GET /api/v1/auth/me',
      },
      deposit: {
        getAddress: 'GET /api/v1/deposit/address',
        verify: 'POST /api/v1/deposit/verify',
        status: 'GET /api/v1/deposit/status/:id',
        history: 'GET /api/v1/deposit/history',
      },
      wallet: {
        balance: 'GET /api/v1/wallet/balance',
        transactions: 'GET /api/v1/wallet/transactions',
        exchangeRate: 'GET /api/v1/wallet/exchange-rate',
      },
      admin: {
        consolidationStatus: 'GET /api/v1/admin/consolidation/status',
        sweepAll: 'POST /api/v1/admin/consolidation/sweep',
        sweepUser: 'POST /api/v1/admin/consolidation/sweep/:userId',
        sweepHistory: 'GET /api/v1/admin/consolidation/history',
        userWallet: 'GET /api/v1/admin/wallet/:userId',
      },
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    status: false, 
    message: 'Route not found' 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    status: false, 
    message: 'Internal server error' 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║     USDT Payment Processor API                    ║
║     Server running on port ${PORT}                    ║
║     Environment: ${process.env.NODE_ENV || 'development'}                  ║
╚═══════════════════════════════════════════════════╝
  `);
  console.log(`💱 Exchange Rate: 1 USDT = ${process.env.USDT_TO_KES_RATE} KES`);
  console.log(`🌐 API Docs: http://localhost:${PORT}/`);
  
  // Start deposit monitor (auto-detect incoming deposits)
  depositMonitor.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  depositMonitor.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  depositMonitor.stop();
  process.exit(0);
});

module.exports = app;


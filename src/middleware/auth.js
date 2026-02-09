const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: false,
        message: 'Access denied. No token provided.',
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Get user from database
    const user = db.prepare(
      'SELECT id, phone, username, balance_kes, is_active FROM users WHERE id = ? LIMIT 1'
    ).get(decoded.userId);

    if (!user) {
      return res.status(401).json({
        status: false,
        message: 'User not found',
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        status: false,
        message: 'Account is deactivated',
      });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      phone: user.phone,
      username: user.username,
      balance: parseFloat(user.balance_kes),
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: false,
        message: 'Invalid token',
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: false,
        message: 'Token expired',
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({
      status: false,
      message: 'Authentication error',
    });
  }
};

/**
 * Generate JWT token
 * @param {object} user - User object
 * @returns {string} JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      phone: user.phone,
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

module.exports = {
  authenticate,
  generateToken,
};

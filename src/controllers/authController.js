const bcrypt = require('bcrypt');
const db = require('../config/db');
const { generateToken } = require('../middleware/auth');
const hdWallet = require('../services/hdWalletService');

const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;

/**
 * Register a new user
 * POST /api/v1/auth/register
 */
const register = async (req, res) => {
  const { phone, password, username, referralCode } = req.body;

  try {
    // Check if user already exists
    const existing = db.prepare(
      'SELECT id FROM users WHERE phone = ? OR username = ? LIMIT 1'
    ).get(phone, username);

    if (existing) {
      return res.status(400).json({
        status: false,
        message: 'Phone or username already exists',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Generate unique Tron address for user (atomic transaction)
    const createUser = db.transaction(() => {
      // Get and increment next derivation index
      const config = db.prepare('SELECT next_derivation_index FROM wallet_config WHERE id = 1').get();
      const derivationIndex = config.next_derivation_index;
      
      // Derive Tron address from HD wallet
      const wallet = hdWallet.deriveAddress(derivationIndex);
      
      // Create user with 0 balance and their unique Tron address
      const result = db.prepare(
        `INSERT INTO users (phone, password_hash, username, referral_code, balance_kes, tron_address, derivation_index) 
         VALUES (?, ?, ?, ?, 0.00, ?, ?)`
      ).run(phone, passwordHash, username, referralCode || null, wallet.address, derivationIndex);

      // Increment the next derivation index
      db.prepare('UPDATE wallet_config SET next_derivation_index = ?, updated_at = datetime(\'now\') WHERE id = 1')
        .run(derivationIndex + 1);

      return {
        userId: result.lastInsertRowid,
        tronAddress: wallet.address,
      };
    });

    const { userId, tronAddress } = createUser();

    // Generate token
    const token = generateToken({ id: userId, phone });

    return res.status(201).json({
      status: true,
      message: 'Account created successfully',
      data: {
        token,
        user: {
          id: userId,
          phone,
          username,
          balance: 0,
          depositAddress: tronAddress,
        },
      },
    });
  } catch (err) {
    console.error('Error creating account:', err);
    return res.status(500).json({
      status: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Login user
 * POST /api/v1/auth/login
 */
const login = async (req, res) => {
  const { phone, password } = req.body;

  try {
    // Find user
    const user = db.prepare(
      'SELECT id, phone, username, password_hash, balance_kes, is_active, tron_address FROM users WHERE phone = ? LIMIT 1'
    ).get(phone);

    if (!user) {
      return res.status(401).json({
        status: false,
        message: 'Invalid credentials',
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        status: false,
        message: 'Account is deactivated',
      });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        status: false,
        message: 'Invalid credentials',
      });
    }

    // Generate token
    const token = generateToken({ id: user.id, phone: user.phone });

    return res.status(200).json({
      status: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          phone: user.phone,
          username: user.username,
          balance: parseFloat(user.balance_kes),
          depositAddress: user.tron_address,
        },
      },
    });
  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).json({
      status: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Get current user profile
 * GET /api/v1/auth/me
 */
const getMe = async (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, phone, username, balance_kes, tron_address, created_at FROM users WHERE id = ? LIMIT 1'
    ).get(req.user.id);

    return res.status(200).json({
      status: true,
      data: {
        id: user.id,
        phone: user.phone,
        username: user.username,
        balance: parseFloat(user.balance_kes),
        depositAddress: user.tron_address,
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    console.error('Error fetching profile:', err);
    return res.status(500).json({
      status: false,
      message: 'Internal server error',
    });
  }
};

module.exports = {
  register,
  login,
  getMe,
};

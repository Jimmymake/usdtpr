const Joi = require('joi');

/**
 * Validation middleware factory
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} property - Request property to validate ('body', 'query', 'params')
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        status: false,
        message: 'Validation failed',
        errors,
      });
    }

    // Replace with validated/sanitized value
    req[property] = value;
    next();
  };
};

// Validation schemas
const schemas = {
  // User registration
  register: Joi.object({
    phone: Joi.string()
      .pattern(/^[0-9]{10,15}$/)
      .required()
      .messages({
        'string.pattern.base': 'Phone must be 10-15 digits',
        'any.required': 'Phone is required',
      }),
    username: Joi.string()
      .alphanum()
      .min(3)
      .max(30)
      .required()
      .messages({
        'string.alphanum': 'Username must contain only letters and numbers',
        'string.min': 'Username must be at least 3 characters',
        'string.max': 'Username must be at most 30 characters',
        'any.required': 'Username is required',
      }),
    password: Joi.string()
      .min(6)
      .max(100)
      .required()
      .messages({
        'string.min': 'Password must be at least 6 characters',
        'any.required': 'Password is required',
      }),
    referralCode: Joi.string()
      .max(50)
      .optional()
      .allow('', null),
  }),

  // User login
  login: Joi.object({
    phone: Joi.string()
      .pattern(/^[0-9]{10,15}$/)
      .required()
      .messages({
        'string.pattern.base': 'Phone must be 10-15 digits',
        'any.required': 'Phone is required',
      }),
    password: Joi.string()
      .required()
      .messages({
        'any.required': 'Password is required',
      }),
  }),

  // Deposit verification
  verifyDeposit: Joi.object({
    txId: Joi.string()
      .pattern(/^[a-fA-F0-9]{64}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid transaction ID format. Must be 64 hexadecimal characters.',
        'any.required': 'Transaction ID is required',
      }),
  }),

  // Transaction history query
  transactionHistory: Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .default(1),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(20),
    type: Joi.string()
      .valid('deposit', 'withdrawal', 'bet', 'win', 'bonus', 'refund')
      .optional(),
  }),
};

module.exports = {
  validate,
  schemas,
};


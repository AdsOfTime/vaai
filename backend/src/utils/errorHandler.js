const { logError, logSecurityEvent, createLogContext } = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode, code = null, details = {}) {
    super(message);
    
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, field = null, value = null) {
    super(message, 400, 'VALIDATION_ERROR', { field, value });
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
    this.name = 'ConflictError';
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_ERROR');
    this.name = 'RateLimitError';
  }
}

class ExternalServiceError extends AppError {
  constructor(service, message, originalError = null) {
    super(`${service} service error: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR', {
      service,
      originalError: originalError ? {
        message: originalError.message,
        code: originalError.code,
        status: originalError.status
      } : null
    });
    this.name = 'ExternalServiceError';
  }
}

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  // Log the error
  logError(err, req, {
    body: req.body ? sanitizeRequestBody(req.body) : undefined,
    query: req.query,
    params: req.params
  });
  
  // If headers already sent, delegate to Express default error handler
  if (res.headersSent) {
    return next(err);
  }
  
  let error = { ...err };
  error.message = err.message;
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    error = handleValidationError(err);
  } else if (err.name === 'CastError') {
    error = handleCastError(err);
  } else if (err.code === 11000) {
    error = handleDuplicateFieldError(err);
  } else if (err.name === 'JsonWebTokenError') {
    error = handleJWTError(err);
  } else if (err.name === 'TokenExpiredError') {
    error = handleJWTExpiredError(err);
  } else if (err.name === 'MulterError') {
    error = handleMulterError(err);
  } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    error = handleConnectionError(err);
  } else if (err.response && err.response.status) {
    error = handleExternalApiError(err);
  }
  
  // Ensure we have a valid error object
  if (!(error instanceof AppError)) {
    error = new AppError(
      process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
      error.statusCode || 500,
      error.code || 'INTERNAL_SERVER_ERROR'
    );
  }
  
  // Log security events for certain error types
  if (error.statusCode === 401 || error.statusCode === 403) {
    logSecurityEvent(error.name, req, { statusCode: error.statusCode });
  }
  
  // Send error response
  const response = {
    error: error.message,
    code: error.code,
    timestamp: new Date().toISOString()
  };
  
  // Include additional details in development
  if (process.env.NODE_ENV === 'development') {
    response.details = error.details;
    response.stack = error.stack;
  }
  
  // Include request ID if available
  if (req.id || req.headers['x-request-id']) {
    response.requestId = req.id || req.headers['x-request-id'];
  }
  
  res.status(error.statusCode).json(response);
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Request ID middleware
const requestId = (req, res, next) => {
  req.id = req.headers['x-request-id'] || generateRequestId();
  res.setHeader('X-Request-ID', req.id);
  next();
};

// Not found handler
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl}`);
  next(error);
};

// Specific error handlers
const handleValidationError = (err) => {
  const errors = Object.values(err.errors || {}).map(val => val.message);
  return new ValidationError(`Invalid input data: ${errors.join('. ')}`);
};

const handleCastError = (err) => {
  return new ValidationError(`Invalid ${err.path}: ${err.value}`);
};

const handleDuplicateFieldError = (err) => {
  const field = Object.keys(err.keyValue || {})[0];
  return new ConflictError(`Duplicate ${field}. Please use another value.`);
};

const handleJWTError = () => {
  return new AuthenticationError('Invalid token. Please log in again.');
};

const handleJWTExpiredError = () => {
  return new AuthenticationError('Your token has expired. Please log in again.');
};

const handleMulterError = (err) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new ValidationError('File size too large');
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return new ValidationError('Too many files');
  }
  return new ValidationError(`File upload error: ${err.message}`);
};

const handleConnectionError = (err) => {
  return new ExternalServiceError('Database', 'Connection failed', err);
};

const handleExternalApiError = (err) => {
  const status = err.response.status;
  const service = getServiceFromUrl(err.config?.url);
  
  if (status >= 400 && status < 500) {
    return new ValidationError(`${service} API error: ${err.response.data?.message || err.message}`);
  }
  
  return new ExternalServiceError(service, err.response.data?.message || err.message, err);
};

// Utility functions
const generateRequestId = () => {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};

const sanitizeRequestBody = (body) => {
  if (!body || typeof body !== 'object') return body;
  
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
  const sanitized = { ...body };
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
};

const getServiceFromUrl = (url) => {
  if (!url) return 'External';
  
  if (url.includes('googleapis.com')) return 'Google';
  if (url.includes('openai.com')) return 'OpenAI';
  if (url.includes('cloudflare.com')) return 'Cloudflare';
  
  return 'External';
};

// Validation helpers
const validateRequired = (value, fieldName) => {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(`${fieldName} is required`);
  }
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format');
  }
};

const validateLength = (value, fieldName, min = 0, max = Infinity) => {
  if (typeof value === 'string' && (value.length < min || value.length > max)) {
    throw new ValidationError(`${fieldName} must be between ${min} and ${max} characters`);
  }
};

const validateArray = (value, fieldName, minLength = 0, maxLength = Infinity) => {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`);
  }
  if (value.length < minLength || value.length > maxLength) {
    throw new ValidationError(`${fieldName} must have between ${minLength} and ${maxLength} items`);
  }
};

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  
  // Middleware
  errorHandler,
  asyncHandler,
  requestId,
  notFoundHandler,
  
  // Validation helpers
  validateRequired,
  validateEmail,
  validateLength,
  validateArray,
  
  // Utilities
  generateRequestId,
  sanitizeRequestBody
};
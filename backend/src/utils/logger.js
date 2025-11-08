const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define log colors
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

winston.addColors(logColors);

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length) {
      metaStr = ` ${JSON.stringify(meta)}`;
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
  levels: logLevels,
  format: logFormat,
  defaultMeta: {
    service: 'vaai-backend',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.uncolorize(),
        winston.format.json()
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: winston.format.combine(
        winston.format.uncolorize(),
        winston.format.json()
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ],
  
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      format: winston.format.combine(
        winston.format.uncolorize(),
        winston.format.json()
      )
    })
  ],
  
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      format: winston.format.combine(
        winston.format.uncolorize(),
        winston.format.json()
      )
    })
  ]
});

// Add HTTP request logging
const morganStream = {
  write: (message) => {
    logger.http(message.trim());
  }
};

// Helper functions for structured logging
const createLogContext = (req, additional = {}) => {
  const context = {
    requestId: req.id || req.headers['x-request-id'],
    userId: req.user?.id,
    teamId: req.headers['x-team-id'],
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    ...additional
  };
  
  // Remove undefined values
  return Object.fromEntries(
    Object.entries(context).filter(([_, value]) => value !== undefined)
  );
};

// Specialized logging functions
const logApiCall = (req, endpoint, data = {}) => {
  logger.info(`API Call: ${endpoint}`, createLogContext(req, data));
};

const logBackgroundJob = (jobName, status, data = {}) => {
  logger.info(`Background Job: ${jobName}`, {
    jobName,
    status,
    timestamp: new Date().toISOString(),
    ...data
  });
};

const logGoogleApiCall = (apiName, method, success, responseTime, error = null) => {
  const level = success ? 'info' : 'error';
  const message = `Google API: ${apiName}.${method}`;
  const meta = {
    apiName,
    method,
    success,
    responseTime,
    timestamp: new Date().toISOString()
  };
  
  if (error) {
    meta.error = {
      message: error.message,
      code: error.code,
      status: error.status
    };
  }
  
  logger[level](message, meta);
};

const logOpenAiCall = (model, tokens, success, responseTime, error = null) => {
  const level = success ? 'info' : 'error';
  const message = `OpenAI API: ${model}`;
  const meta = {
    model,
    tokens: tokens || 0,
    success,
    responseTime,
    timestamp: new Date().toISOString()
  };
  
  if (error) {
    meta.error = {
      message: error.message,
      type: error.type,
      code: error.code
    };
  }
  
  logger[level](message, meta);
};

const logDatabaseOperation = (operation, table, success, responseTime, error = null) => {
  const level = success ? 'debug' : 'error';
  const message = `Database: ${operation} ${table}`;
  const meta = {
    operation,
    table,
    success,
    responseTime,
    timestamp: new Date().toISOString()
  };
  
  if (error) {
    meta.error = {
      message: error.message,
      code: error.code,
      errno: error.errno
    };
  }
  
  logger[level](message, meta);
};

const logSecurityEvent = (event, req, details = {}) => {
  logger.warn(`Security Event: ${event}`, createLogContext(req, {
    event,
    details,
    timestamp: new Date().toISOString()
  }));
};

// Error logging with sanitization
const logError = (error, req = null, additional = {}) => {
  const errorMeta = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    ...additional
  };
  
  if (req) {
    Object.assign(errorMeta, createLogContext(req));
  }
  
  // Sanitize sensitive information
  if (errorMeta.stack) {
    errorMeta.stack = errorMeta.stack.replace(/\b[\w._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[email]');
    errorMeta.stack = errorMeta.stack.replace(/\b[A-Za-z0-9]{20,}\b/g, '[token]');
  }
  
  logger.error('Application Error', errorMeta);
};

// Performance monitoring
const createTimer = (name) => {
  const start = process.hrtime.bigint();
  return {
    end: (success = true, meta = {}) => {
      const end = process.hrtime.bigint();
      const responseTime = Number(end - start) / 1000000; // Convert to milliseconds
      
      logger.info(`Performance: ${name}`, {
        name,
        responseTime: Math.round(responseTime),
        success,
        timestamp: new Date().toISOString(),
        ...meta
      });
      
      return responseTime;
    }
  };
};

module.exports = {
  logger,
  morganStream,
  createLogContext,
  logApiCall,
  logBackgroundJob,
  logGoogleApiCall,
  logOpenAiCall,
  logDatabaseOperation,
  logSecurityEvent,
  logError,
  createTimer
};
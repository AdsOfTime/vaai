const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();

// Import logging and error handling
const { logger, morganStream, logApiCall, logBackgroundJob } = require('./utils/logger');
const { 
  errorHandler, 
  requestId, 
  notFoundHandler,
  AppError 
} = require('./utils/errorHandler');

const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/emails');
const calendarRoutes = require('./routes/calendar');
const briefingRoutes = require('./routes/briefing');
const actionRoutes = require('./routes/actions');
const followUpRoutes = require('./routes/followUps');
const meetingBriefRoutes = require('./routes/meetingBriefs');
const assistantRoutes = require('./routes/assistant');
const tasksRoutes = require('./routes/tasks');
const teamRoutes = require('./routes/teams');
const monetizationRoutes = require('./routes/monetization');
const gmailComposeRoutes = require('./routes/gmailCompose');
const googleDocsRoutes = require('./routes/googleDocs');
const googleSheetsRoutes = require('./routes/googleSheets');
const advancedAIRoutes = require('./routes/advancedAI');
const { initDatabase } = require('./database/init');
const { getAllTeams } = require('./database/teams');
const { discoverFollowUpsForTeam } = require('./services/followUpDetector');
const { processDueFollowUps } = require('./services/followUpScheduler');
const { generateMeetingBriefsForTeam } = require('./services/meetingPrepGenerator');

const app = express();
const PORT = process.env.PORT || 3001;

// Request ID middleware (before logging)
app.use(requestId);

// HTTP request logging
app.use(morgan('combined', { stream: morganStream }));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.openai.com", "https://accounts.google.com", "https://www.googleapis.com"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',')
  : process.env.NODE_ENV === 'production' 
    ? ['https://your-domain.com'] 
    : ['http://localhost:3000', 'http://localhost:3002'];

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Team-Id', 'X-Request-ID']
}));

// Enhanced rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl
    });
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
});
app.use(limiter);

// Body parsing middleware with enhanced security
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf, encoding) => {
    try {
      JSON.parse(buf);
    } catch (err) {
      throw new AppError('Invalid JSON format', 400, 'INVALID_JSON');
    }
  }
}));
app.use(express.urlencoded({ 
  extended: true,
  limit: '10mb'
}));

// Routes
app.use('/auth', authRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/briefing', briefingRoutes);
app.use('/api/actions', actionRoutes);
app.use('/api/follow-ups', followUpRoutes);
app.use('/api/meeting-briefs', meetingBriefRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/monetization', monetizationRoutes);
app.use('/api/gmail/compose', gmailComposeRoutes);
app.use('/api/google/docs', googleDocsRoutes);
app.use('/api/google/sheets', googleSheetsRoutes);
app.use('/api/advanced-ai', advancedAIRoutes);

// Health check with enhanced information
app.get('/health', (req, res) => {
  const healthData = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    requestId: req.id
  };
  
  logger.debug('Health check requested', { 
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.json(healthData);
});

// 404 handler (must be before error handler)
app.use(notFoundHandler);

// Global error handling middleware
app.use(errorHandler);

// Initialize database and start server
async function startServer() {
  try {
    logger.info('Initializing VAAI Backend...');
    
    // Initialize database
    await initDatabase();
    logger.info('Database initialized successfully');
    
    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`VAAI Backend running on port ${PORT}`, {
        port: PORT,
        environment: process.env.NODE_ENV,
        corsOrigins,
        logLevel: logger.level
      });
    });
    
    // Graceful shutdown handling
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
    
    // Start background jobs
    startBackgroundJobs();
    logger.info('Background jobs started');
    
  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

let discoveryLock = false;
let schedulerLock = false;
let meetingPrepLock = false;

async function runFollowUpDiscovery() {
  if (discoveryLock) return;
  discoveryLock = true;
  
  const startTime = Date.now();
  logBackgroundJob('follow-up-discovery', 'started');
  
  try {
    const teams = await getAllTeams();
    let processedTeams = 0;
    let totalFollowUps = 0;
    
    for (const team of teams) {
      const result = await discoverFollowUpsForTeam(team.id);
      processedTeams++;
      totalFollowUps += result?.count || 0;
    }
    
    const duration = Date.now() - startTime;
    logBackgroundJob('follow-up-discovery', 'completed', {
      processedTeams,
      totalFollowUps,
      duration
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logBackgroundJob('follow-up-discovery', 'failed', {
      error: error.message,
      duration
    });
    logger.error('Follow-up discovery job failed', { error: error.message, stack: error.stack });
  } finally {
    discoveryLock = false;
  }
}

async function runFollowUpScheduler() {
  if (schedulerLock) return;
  schedulerLock = true;
  
  const startTime = Date.now();
  logBackgroundJob('follow-up-scheduler', 'started');
  
  try {
    const result = await processDueFollowUps();
    const duration = Date.now() - startTime;
    
    logBackgroundJob('follow-up-scheduler', 'completed', {
      processedFollowUps: result?.processed || 0,
      sentEmails: result?.sent || 0,
      duration
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logBackgroundJob('follow-up-scheduler', 'failed', {
      error: error.message,
      duration
    });
    logger.error('Follow-up scheduler job failed', { error: error.message, stack: error.stack });
  } finally {
    schedulerLock = false;
  }
}

async function runMeetingPrep() {
  if (meetingPrepLock) return;
  meetingPrepLock = true;
  
  const startTime = Date.now();
  logBackgroundJob('meeting-prep', 'started');
  
  try {
    const teams = await getAllTeams();
    let processedTeams = 0;
    let generatedBriefs = 0;
    
    for (const team of teams) {
      const result = await generateMeetingBriefsForTeam(team.id);
      processedTeams++;
      generatedBriefs += result?.count || 0;
    }
    
    const duration = Date.now() - startTime;
    logBackgroundJob('meeting-prep', 'completed', {
      processedTeams,
      generatedBriefs,
      duration
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logBackgroundJob('meeting-prep', 'failed', {
      error: error.message,
      duration
    });
    logger.error('Meeting prep job failed', { error: error.message, stack: error.stack });
  } finally {
    meetingPrepLock = false;
  }
}

function startBackgroundJobs() {
  const discoveryMinutes = Number.parseInt(process.env.FOLLOW_UP_DISCOVERY_INTERVAL_MINUTES, 10) || 30;
  const schedulerMinutes = Number.parseInt(process.env.FOLLOW_UP_SCHEDULER_INTERVAL_MINUTES, 10) || 5;
  const meetingPrepMinutes = Number.parseInt(process.env.MEETING_PREP_INTERVAL_MINUTES, 10) || 60;

  logger.info('Configuring background jobs', {
    followUpDiscoveryInterval: `${discoveryMinutes} minutes`,
    followUpSchedulerInterval: `${schedulerMinutes} minutes`,
    meetingPrepInterval: `${meetingPrepMinutes} minutes`
  });

  // Delayed initial runs to allow server to fully start
  setTimeout(() => {
    runFollowUpDiscovery();
    runFollowUpScheduler();
    runMeetingPrep();
  }, 10000);

  // Set up intervals
  const discoveryInterval = setInterval(runFollowUpDiscovery, discoveryMinutes * 60 * 1000);
  const schedulerInterval = setInterval(runFollowUpScheduler, schedulerMinutes * 60 * 1000);
  const meetingPrepInterval = setInterval(runMeetingPrep, meetingPrepMinutes * 60 * 1000);

  // Store intervals for cleanup
  process.backgroundIntervals = {
    discovery: discoveryInterval,
    scheduler: schedulerInterval,
    meetingPrep: meetingPrepInterval
  };

  // Clean up intervals on shutdown
  process.on('SIGTERM', () => {
    Object.values(process.backgroundIntervals).forEach(clearInterval);
  });
  
  process.on('SIGINT', () => {
    Object.values(process.backgroundIntervals).forEach(clearInterval);
  });
}

startServer();

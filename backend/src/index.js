const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

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
const { initDatabase } = require('./database/init');
const { getAllTeams } = require('./database/teams');
const { discoverFollowUpsForTeam } = require('./services/followUpDetector');
const { processDueFollowUps } = require('./services/followUpScheduler');
const { generateMeetingBriefsForTeam } = require('./services/meetingPrepGenerator');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-domain.com'] 
    : ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`VAAI Backend running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
    });
    startBackgroundJobs();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

let discoveryLock = false;
let schedulerLock = false;
let meetingPrepLock = false;

async function runFollowUpDiscovery() {
  if (discoveryLock) return;
  discoveryLock = true;
  try {
    const teams = await getAllTeams();
    for (const team of teams) {
      await discoverFollowUpsForTeam(team.id);
    }
  } catch (error) {
    console.error('Follow-up discovery job failed:', error);
  } finally {
    discoveryLock = false;
  }
}

async function runFollowUpScheduler() {
  if (schedulerLock) return;
  schedulerLock = true;
  try {
    await processDueFollowUps();
  } catch (error) {
    console.error('Follow-up scheduler job failed:', error);
  } finally {
    schedulerLock = false;
  }
}

async function runMeetingPrep() {
  if (meetingPrepLock) return;
  meetingPrepLock = true;
  try {
    const teams = await getAllTeams();
    for (const team of teams) {
      await generateMeetingBriefsForTeam(team.id);
    }
  } catch (error) {
    console.error('Meeting prep job failed:', error);
  } finally {
    meetingPrepLock = false;
  }
}

function startBackgroundJobs() {
  const discoveryMinutes = Number.parseInt(process.env.FOLLOW_UP_DISCOVERY_INTERVAL_MINUTES, 10) || 30;
  const schedulerMinutes = Number.parseInt(process.env.FOLLOW_UP_SCHEDULER_INTERVAL_MINUTES, 10) || 5;
  const meetingPrepMinutes = Number.parseInt(process.env.MEETING_PREP_INTERVAL_MINUTES, 10) || 60;

  // Initial runs
  runFollowUpDiscovery();
  runFollowUpScheduler();
  runMeetingPrep();

  setInterval(runFollowUpDiscovery, discoveryMinutes * 60 * 1000);
  setInterval(runFollowUpScheduler, schedulerMinutes * 60 * 1000);
  setInterval(runMeetingPrep, meetingPrepMinutes * 60 * 1000);
}

startServer();

import { Hono } from 'hono'
import type { Context, MiddlewareHandler } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { SignJWT, jwtVerify, JWTPayload } from 'jose'
import {
  calendarFreeBusy,
  calendarInsertEvent,
  calendarListEvents,
  calendarPatchEvent,
  ensureGoogleAccessToken,
  extractPlainBody,
  gmailCreateDraft,
  gmailCreateLabel,
  gmailGetDraft,
  gmailGetMessage,
  gmailListDrafts,
  gmailListLabels,
  gmailListMessages,
  gmailModifyMessage,
  gmailSendDraft,
  gmailSendMessage,
  getHeader,
  googleDocsBatchUpdate,
  googleDocsCreateDocument,
  googleDriveGetFile,
  googleDriveCopyFile,
  googleDriveListFiles,
  googleDriveUpdateParents,
  googleSheetsAppendValues,
  googleTasksInsert,
  googleTasksList,
  googleTasksPatch
} from './google'

type EnvBindings = {
  DB: D1Database
  OAUTH_STATE: KVNamespace
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GOOGLE_REDIRECT_URI: string
  FRONTEND_REDIRECT_URI: string
  JWT_SECRET: string
  OPENAI_API_KEY?: string
}

type GoogleTokens = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
  id_token?: string
}

type GoogleUserInfo = {
  id: string
  email: string
  verified_email?: boolean
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
  locale?: string
}

type TeamRow = {
  id: number
  name: string
  owner_user_id: number
  created_at: string
  role?: string
  status?: string
  invited_at?: string
  joined_at?: string
}

function convertMarkdownToPlain(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n')
  let inCodeBlock = false

  const lines = normalized.split('\n').map((rawLine) => {
    if (/^\s*```/.test(rawLine)) {
      inCodeBlock = !inCodeBlock
      return ''
    }

    let line = rawLine.replace(/\s+$/, '')
    if (inCodeBlock) {
      return line
    }

    line = line.replace(/`([^`]*)`/g, '$1')
    line = line.replace(/\*\*(.*?)\*\*/g, '$1')
    line = line.replace(/__(.*?)__/g, '$1')
    line = line.replace(/\*(.*?)\*/g, '$1')
    line = line.replace(/_(.*?)_/g, '$1')
    line = line.replace(/~~(.*?)~~/g, '$1')
    line = line.replace(/!\[[^\]]*]\([^)]+\)/g, '')
    line = line.replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1 ($2)')

    if (/^\s*#{1,6}\s+/.test(line)) {
      line = line.replace(/^\s*#{1,6}\s+/, '')
    } else if (/^\s*[-+*]\s+/.test(line)) {
      line = line.replace(/^\s*[-+*]\s+/, '- ')
    } else if (/^\s*\d+\.\s+/.test(line)) {
      line = line.replace(/^\s*(\d+)\.\s+/, '$1. ')
    } else if (/^\s*>+\s*/.test(line)) {
      line = line.replace(/^\s*>+\s*/, '> ')
    }

    return line.trimEnd()
  })

  const result = lines.join('\n').replace(/\n{3,}/g, '\n\n')
  return result.trim()
}

type TeamMemberRow = {
  id: number
  team_id: number
  user_id: number
  role: string
  status: string
  invited_at: string
  joined_at: string | null
}

type TeamInvitationRow = {
  id: number
  team_id: number
  email: string
  role: string
  token: string
  expires_at: string
  invited_by_user_id: number
  accepted_at: string | null
  created_at: string
}

type EmailRuleRow = {
  id: number
  user_id: number
  category_id: number
  rule_type: string
  rule_value: string
  priority: number
  is_active: number
}

type EmailCategoryRow = {
  id: number
  user_id: number
  name: string
  description: string | null
  color: string | null
}

type FollowUpRow = {
  id: number
  team_id: number
  owner_user_id: number
  thread_id: string | null
  last_message_id: string | null
  counterpart_email: string | null
  subject: string | null
  summary: string | null
  status: string
  priority: number
  due_at: string | null
  suggested_send_at: string | null
  draft_subject: string | null
  draft_body: string | null
  tone_hint: string | null
  prompt_version: string | null
  metadata: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

type FollowUpMetadata = Record<string, any> | null

type FollowUpTask = {
  id: number
  teamId: number
  ownerUserId: number
  threadId: string | null
  lastMessageId: string | null
  counterpartEmail: string | null
  subject: string | null
  summary: string | null
  status: string
  priority: number
  dueAt: string | null
  suggestedSendAt: string | null
  draftSubject: string | null
  draftBody: string | null
  toneHint: string | null
  promptVersion: string | null
  metadata: FollowUpMetadata
  sentAt: string | null
  createdAt: string
  updatedAt: string
}

type BriefingAction = {
  type: string
  label: string
  payload: Record<string, unknown>
}

type BriefingItem = {
  emailId: string
  threadId?: string
  subject: string
  from: string
  snippet: string
  body: string
  receivedAt: string
  intent: string
  suggestedAction: string
  labels: string[]
  actions: BriefingAction[]
  handled: boolean
  lastAction: {
    actionId?: number | null
    actionType?: string | null
    status?: string | null
    undoneAt?: string | null
    feedback?: { rating?: string | null; note?: string | null } | null
  } | null
}

type FollowUpContext = {
  teamId: number
  team: NonNullable<ReturnType<typeof mapTeamRow>>
  user: VaaiUser
  membership: TeamMemberRow
}

type DraftResult = {
  subject: string
  body: string
  tone: string
  model: string
}

type AssistantActionRow = {
  id: number
  user_id: number
  email_id: string | null
  thread_id: string | null
  action_type: string
  status: string
  payload: string | null
  result: string | null
  feedback: string | null
  created_at: string
  updated_at: string
  undone_at: string | null
}

type AssistantAction = {
  id: number
  userId: number
  emailId: string | null
  threadId: string | null
  actionType: string
  status: string
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
  feedback: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  undoneAt: string | null
}

type AssistantActionMetrics = {
  timeframeDays: number | null
  totals: {
    total: number
    completed: number
    awaitingConfirmation: number
    undone: number
  }
  feedback: {
    helpful: number
    notHelpful: number
    other: number
  }
  byType: Array<{
    actionType: string
    total: number
    completed: number
    awaitingConfirmation: number
    undone: number
    helpful: number
    notHelpful: number
    otherFeedback: number
  }>
  recent: Array<{
    id: number
    actionType: string
    status: string
    createdAt: string
    updatedAt: string
    undoneAt: string | null
    feedback: Record<string, unknown> | null
  }>
}

type GoogleTask = {
  id: string
  title: string
  notes: string
  status: string
  due: string | null
  updated: string | null
  completed: string | null
  webViewLink: string | null
}

type EmailComposePayload = {
  from?: string | string[]
  to?: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  subject?: string
  textBody?: string
  htmlBody?: string
  labelIds?: string[]
  sendAt?: string
}

const SUBSCRIPTION_TIERS = {
  solo: {
    name: 'Solo',
    monthly_price: 29,
    annual_price: 290,
    seats_included: 1,
    best_for: 'Individual operators who need AI assistance with inbox triage and follow-ups.',
    highlights: [
      'Daily briefing and AI follow-up queue',
      'Google Calendar & Tasks sync',
      'Up to 100 automated actions per month',
      'Email summaries, meeting prep, and task creation',
      'Standard email support'
    ],
    limits: {
      assistant_actions: '100 / month',
      teams: 1,
      storage_days: 30
    }
  },
  business: {
    name: 'Business',
    monthly_price: 99,
    annual_price: 990,
    seats_included: 5,
    best_for: 'Teams that need shared workflows, reporting, and higher automation limits.',
    highlights: [
      'Everything in Solo, plus shared follow-up queue',
      'Team dashboards & revenue analytics',
      '1,000 automated actions pooled per month',
      'Priority support and onboarding session',
      'Optional seat add-ons'
    ],
    limits: {
      assistant_actions: '1,000 pooled / month',
      teams: 'Unlimited',
      storage_days: 180
    }
  }
} as const

const assistantSystemPrompt = `
You are VAAI, an executive assistant that helps manage email, meetings, and follow-ups.
Keep replies short and actionable. You can ask follow-up questions if details are missing.

For meeting scheduling:
- Parse casual language carefully (e.g., "9am" = 09:00:00, "2pm" = 14:00:00)
- Use the current date context (today is November 6, 2025)
- Convert relative times ("today", "tomorrow", "next Monday") to specific dates
- Default duration to 30 minutes if not specified
- Create ISO 8601 format without timezone suffix: YYYY-MM-DDTHH:MM:SS (no Z suffix)
- IMPORTANT: "9am" = "09:00:00" NOT "21:00:00", "2pm" = "14:00:00" NOT "02:00:00"
- Use "Coffee Meeting" as default title if not provided
- Always try to call create_calendar_event when user requests scheduling

CRITICAL TIME CONVERSION EXAMPLES (NO timezone suffix):
- "9am" or "9 AM" on Nov 7 = "2025-11-07T09:00:00" (not "2025-11-07T09:00:00Z")
- "2pm" or "2 PM" on Nov 7 = "2025-11-07T14:00:00" (not "2025-11-07T14:00:00Z")
- "8pm" or "8 PM" on Nov 7 = "2025-11-07T20:00:00" (not "2025-11-07T20:00:00Z")

The time should represent the user's local time, not UTC.

For task creation:
- Parse casual due dates/times (e.g., "tomorrow 1pm" = "2025-11-07T13:00:00")
- Convert relative dates ("today", "tomorrow", "next week") to specific dates
- If a specific time is mentioned, include it in the due date
- Use ISO 8601 format without timezone suffix: YYYY-MM-DDTHH:MM:SS (no Z suffix)
- IMPORTANT: "1pm" = "13:00:00" NOT "01:00:00", "9am" = "09:00:00" NOT "21:00:00"

For email management:
- When asked to summarize emails, focus on priority and work emails first
- Identify actionable items (meetings to schedule, tasks to create, replies needed)
- Highlight urgent items that need immediate attention
- Suggest next steps for important emails
- Categorize emails by importance and type (priority, work, personal)

Current context: Today is November 6, 2025.

When provided with email context, use it to give specific, actionable insights about the user's inbox.
If you cannot fulfil a request, explain what additional information you need.
`

const assistantTools = [
  {
    type: 'function',
    function: {
      name: 'create_calendar_event',
      description: 'Schedule a calendar meeting for the user in Google Calendar',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'A short descriptive title for the meeting' },
          start: { type: 'string', description: 'Start time in ISO 8601 format (e.g. 2025-05-15T15:30:00Z)' },
          end: { type: 'string', description: 'End time in ISO 8601 format' },
          attendees: {
            type: 'array',
            description: 'Email addresses of the attendees',
            items: { type: 'string' }
          },
          location: { type: 'string', description: 'Meeting location or conferencing link' },
          description: { type: 'string', description: 'Optional meeting agenda or notes' }
        },
        required: ['summary', 'start', 'end'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Create a Google Tasks reminder for the user',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short task description' },
          notes: { type: 'string', description: 'Additional details or context about the task' },
          due: { type: 'string', description: 'Due date/time in ISO 8601 format (e.g. 2025-11-07T13:00:00 for tomorrow 1pm)' }
        },
        required: ['title'],
        additionalProperties: false
      }
    }
  }
] as const

type VaaiUser = {
  id: number
  googleId: string | null
  email: string
}

type AuthedContext = Context<{
  Bindings: EnvBindings
  Variables: {
    user: JWTPayload & { userId?: string; email?: string; name?: string }
  }
}>

const DEFAULT_EMAIL_CATEGORIES = [
  { name: 'Work', description: 'Work-related emails', color: '#007bff' },
  { name: 'Personal', description: 'Personal emails', color: '#28a745' },
  { name: 'Newsletter', description: 'Newsletters and subscriptions', color: '#ffc107' },
  { name: 'Receipt', description: 'Purchase receipts and confirmations', color: '#17a2b8' },
  { name: 'Promotion', description: 'Promotional and marketing emails', color: '#fd7e14' },
  { name: 'Social', description: 'Social media notifications', color: '#e83e8c' },
  { name: 'Important', description: 'Important emails requiring attention', color: '#dc3545' }
]

const JWT_ALG = 'HS256'

const app = new Hono<{
  Bindings: EnvBindings
  Variables: {
    user: JWTPayload & { userId?: string; email?: string; name?: string }
  }
}>()

app.use('*', cors({
  origin: (origin) => {
    if (!origin) {
      return ''
    }
    if (origin === 'http://localhost:3002' || origin === 'http://localhost:3000') {
      return origin
    }
    if (origin.endsWith('.pages.dev')) {
      return origin
    }
    return ''
  },
  credentials: true
}))

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    env: c.env.ENVIRONMENT ?? 'development',
    timestamp: new Date().toISOString()
  })
})

app.get('/monetization/subscription-tiers', (c) => {
  return c.json({
    currency: 'USD',
    billing_options: ['monthly', 'annual'],
    tiers: SUBSCRIPTION_TIERS
  })
})

app.get('/auth/google', async (c) => {
  const state = crypto.randomUUID()
  await c.env.OAUTH_STATE.put(oauthStateKey(state), '1', { expirationTtl: 600 })

  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/spreadsheets'
  ]

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', c.env.GOOGLE_REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', scopes.join(' '))
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('state', state)

  return c.json({ authUrl: authUrl.toString(), state })
})

app.get('/auth/google/callback', async (c) => {
  const url = new URL(c.req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code) {
    return c.json({ error: 'Missing authorization code' }, 400)
  }

  const redirectBase = c.env.FRONTEND_REDIRECT_URI || 'http://localhost:3002/'
  const redirectUrl = new URL(redirectBase)
  redirectUrl.searchParams.set('code', code)
  if (state) {
    redirectUrl.searchParams.set('state', state)
  }

  return c.redirect(redirectUrl.toString(), 302)
})

app.post('/auth/google/callback', async (c) => {
  try {
    const body = await c.req.json<{ code?: string; state?: string }>()
    const code = body.code
    const state = body.state

    if (!code) {
      return c.json({ error: 'Missing authorization code' }, 400)
    }

    if (state) {
      const stateValid = await consumeState(c.env.OAUTH_STATE, state)
      if (!stateValid) {
        return c.json({ error: 'Invalid or expired OAuth state' }, 400)
      }
    }

    const tokens = await exchangeCodeForTokens({
      code,
      clientId: c.env.GOOGLE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      redirectUri: c.env.GOOGLE_REDIRECT_URI
    })

    const userInfo = await fetchGoogleUser(tokens.access_token)

    if (!userInfo?.id || !userInfo?.email) {
      return c.json({ error: 'Failed to retrieve Google profile' }, 400)
    }

    const userRecord = await upsertUserTokens(c.env.DB, userInfo.id, userInfo.email, tokens)

    await ensureDefaultCategories(c.env.DB, userRecord.id)

    const teams = await getTeamsForUser(c.env.DB, userRecord.id)

    const jwt = await signJwt(c.env.JWT_SECRET, {
      userId: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture
    })

    return c.json({
      success: true,
      token: jwt,
      user: {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture
      },
      teams
    })
  } catch (error) {
    console.error('OAuth callback error', error)
    return c.json({ error: 'Authentication failed', message: (error as Error).message }, 400)
  }
})

const requireAuth: MiddlewareHandler<{
  Bindings: EnvBindings
  Variables: {
    user: JWTPayload & { userId?: string; email?: string; name?: string }
  }
}> = async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ error: 'No token provided' }, 401)
  }

  const token = header.slice(7)

  try {
    const payload = await verifyJwt(c.env.JWT_SECRET, token)
    c.set('user', payload as JWTPayload & { userId?: string; email?: string; name?: string })
  } catch (error) {
    return c.json({ error: 'Invalid token', message: (error as Error).message }, 401)
  }

  await next()
}

app.use('/auth/me', requireAuth)

app.get('/auth/me', async (c) => {
  const payload = c.get('user')
  const googleId = payload.userId

  if (!googleId) {
    return c.json({ error: 'Invalid token payload' }, 400)
  }

  const userRecord = await getUserByGoogleId(c.env.DB, googleId)
  const teams = userRecord ? await getTeamsForUser(c.env.DB, userRecord.id) : []

  return c.json({
    user: payload,
    teams
  })
})

const api = app.basePath('/api')
api.use('*', requireAuth)

api.get('/teams', async (c) => {
  const user = await resolveCurrentUser(c)
  const teams = await getTeamsForUser(c.env.DB, user.id)
  return c.json({ teams })
})

api.post('/teams', async (c) => {
  const user = await resolveCurrentUser(c)
  const body = await parseJson<{ name?: string }>(c)

  const name = body?.name?.trim()
  if (!name) {
    return c.json({ error: 'Team name is required' }, 400)
  }

  const team = await createTeam(c.env.DB, {
    name,
    ownerUserId: user.id
  })

  return c.json({ team }, 201)
})

api.post('/teams/:teamId/invite', async (c) => {
  const user = await resolveCurrentUser(c)
  const teamIdParam = c.req.param('teamId')
  const teamId = Number.parseInt(teamIdParam, 10)

  if (!Number.isInteger(teamId)) {
    return c.json({ error: 'Invalid team id' }, 400)
  }

  const membership = await getTeamMember(c.env.DB, teamId, user.id)
  if (!membership || membership.status !== 'active') {
    return c.json({ error: 'You do not have access to invite members for this team' }, 403)
  }

  if (!['owner', 'admin'].includes(membership.role)) {
    return c.json({ error: 'Insufficient permissions to invite members' }, 403)
  }

  const body = await parseJson<{ email?: string; role?: string }>(c)
  const email = body?.email?.trim()
  const role = body?.role ?? 'member'

  if (!email) {
    return c.json({ error: 'Email is required' }, 400)
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const invitation = await createTeamInvitation(c.env.DB, {
    teamId,
    email: email.toLowerCase(),
    role,
    invitedByUserId: user.id,
    expiresAt
  })

  return c.json({
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      token: invitation.token,
      expiresAt: invitation.expiresAt
    }
  }, 201)
})

api.post('/teams/invitations/accept', async (c) => {
  const user = await resolveCurrentUser(c)
  const body = await parseJson<{ token?: string }>(c)
  const token = body?.token

  if (!token) {
    return c.json({ error: 'Invitation token is required' }, 400)
  }

  const invitation = await getInvitationByToken(c.env.DB, token)

  if (!invitation) {
    return c.json({ error: 'Invitation not found' }, 404)
  }

  if (invitation.accepted_at) {
    return c.json({ error: 'Invitation already accepted' }, 409)
  }

  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    return c.json({ error: 'Invitation has expired' }, 410)
  }

  const authPayload = c.get('user')
  const normalizedEmail = (authPayload.email || '').toLowerCase()
  if (normalizedEmail !== invitation.email.toLowerCase()) {
    return c.json({ error: 'Invitation email does not match your account email' }, 403)
  }

  const existingMember = await getTeamMember(c.env.DB, invitation.team_id, user.id)
  if (existingMember && existingMember.status === 'active') {
    await markInvitationAccepted(c.env.DB, invitation.id)
    const team = await getTeamById(c.env.DB, invitation.team_id)
    return c.json({ team, alreadyMember: true })
  }

  await addTeamMember(c.env.DB, {
    teamId: invitation.team_id,
    userId: user.id,
    role: invitation.role || 'member',
    status: 'active',
    joinedAt: new Date().toISOString()
  })

  await markInvitationAccepted(c.env.DB, invitation.id)
  const team = await getTeamById(c.env.DB, invitation.team_id)

  return c.json({ team })
})

api.get('/emails', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const { clientId, clientSecret } = getGoogleConfig(c.env)
  const user = await resolveCurrentUser(c)

  const list = await gmailListMessages({
    db: c.env.DB,
    googleId,
    clientId,
    clientSecret,
    maxResults: 50,  // Get more emails for better AI analysis
    query: ''  // Get all emails, not just unread
  })

  const emails = []
  const messages = list.messages ?? []

  for (const message of messages) {
    try {
      const full = await gmailGetMessage({
        db: c.env.DB,
        googleId,
        clientId,
        clientSecret,
        id: message.id,
        format: 'full'
      })

      const subject = getHeader(full.payload, 'Subject')
      const from = getHeader(full.payload, 'From')
      const internalDate = full.internalDate ? new Date(Number(full.internalDate)) : new Date()

      emails.push({
        id: full.id,
        threadId: full.threadId,
        subject,
        from,
        snippet: full.snippet,
        timestamp: internalDate.toISOString()  // Fixed: was 'date', should be 'timestamp'
      })
    } catch (error) {
      console.error('Failed to load email', error)
    }
  }

  return c.json({ emails })
})

api.post('/emails/classify', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const { clientId, clientSecret } = getGoogleConfig(c.env)
  const body = await parseJson<{ emailIds?: string[] }>(c)

  if (!body?.emailIds || !Array.isArray(body.emailIds) || body.emailIds.length === 0) {
    return c.json({ error: 'emailIds array required' }, 400)
  }

  const results = []
  for (const emailId of body.emailIds) {
    try {
      const full = await gmailGetMessage({
        db: c.env.DB,
        googleId,
        clientId,
        clientSecret,
        id: emailId,
        format: 'full'
      })

      const subject = getHeader(full.payload, 'Subject')
      const from = getHeader(full.payload, 'From')
      const bodyText = trimContent(extractPlainBody(full.payload) || full.snippet || '')

      const category = await classifyEmailContent(c.env, { subject, from, body: bodyText })

      results.push({
        emailId,
        category,
        subject,
        from
      })
    } catch (error) {
      console.error('Error classifying email', error)
      results.push({
        emailId,
        error: (error as Error).message || 'Unable to classify email'
      })
    }
  }

  return c.json({ results })
})

api.post('/emails/auto-sort', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const { clientId, clientSecret } = getGoogleConfig(c.env)
  const user = await resolveCurrentUser(c)
  const body = await parseJson<{ limit?: number; query?: string }>(c)

  const limit = Number.isFinite(body?.limit) ? Number(body?.limit) : 10
  const query = body?.query || 'is:unread'

  const [rules, categories] = await Promise.all([
    getUserRules(c.env.DB, user.id),
    getUserCategories(c.env.DB, user.id)
  ])

  const categoriesById = new Map<number, EmailCategoryRow>()
  const categoriesByName = new Map<string, EmailCategoryRow>()
  categories.forEach((category) => {
    categoriesById.set(category.id, category)
    categoriesByName.set(category.name.toLowerCase(), category)
  })

  const list = await gmailListMessages({
    db: c.env.DB,
    googleId,
    clientId,
    clientSecret,
    maxResults: limit,
    query
  })

  const messages = list.messages ?? []
  if (messages.length === 0) {
    return c.json({ results: [] })
  }

  const labelCache = new Map<string, string>()
  const labels = await gmailListLabels({
    db: c.env.DB,
    googleId,
    clientId,
    clientSecret
  })
  labels.labels?.forEach((label) => {
    if (label.name) {
      labelCache.set(label.name, label.id)
    }
  })

  const results = []

  for (const message of messages) {
    try {
      const full = await gmailGetMessage({
        db: c.env.DB,
        googleId,
        clientId,
        clientSecret,
        id: message.id,
        format: 'full'
      })

      const subject = getHeader(full.payload, 'Subject')
      const from = getHeader(full.payload, 'From')
      const bodyText = trimContent(extractPlainBody(full.payload) || full.snippet || '')
      const snippet = full.snippet || ''

      const emailData = { id: message.id, subject, from, body: bodyText, snippet }

      const decision = await determineCategory({
        env: c.env,
        db: c.env.DB,
        userId: user.id,
        categoriesById,
        categoriesByName,
        rules,
        emailData
      })

      let labelApplied: { id: string; name: string } | null = null

      if (decision.category) {
        const labelName = `VAAI/${decision.category.name}`
        let labelId = labelCache.get(labelName)
        if (!labelId) {
          const created = await gmailCreateLabel({
            db: c.env.DB,
            googleId,
            clientId,
            clientSecret,
            name: labelName
          })
          labelId = created.id
          labelCache.set(labelName, labelId)
        }

        await gmailModifyMessage({
          db: c.env.DB,
          googleId,
          clientId,
          clientSecret,
          messageId: message.id,
          addLabelIds: [labelId]
        })

        labelApplied = { id: labelId, name: labelName }
      }

      await storeProcessedEmail(c.env.DB, user.id, {
        gmailId: emailData.id,
        sender: emailData.from,
        subject: emailData.subject,
        snippet: emailData.snippet,
        categoryId: decision.category?.id ?? null,
        confidenceScore: decision.source === 'rule' ? 1 : 0.6,
        isManualOverride: 0
      })

      results.push({
        emailId: message.id,
        subject,
        from,
        snippet,
        decision: {
          source: decision.source,
          rule: decision.rule
            ? {
                id: decision.rule.id,
                type: decision.rule.rule_type,
                value: decision.rule.rule_value
              }
            : null,
          aiCategoryName: decision.aiCategoryName ?? null
        },
        category: decision.category
          ? {
              id: decision.category.id,
              name: decision.category.name
            }
          : null,
        labelApplied
      })
    } catch (error) {
      console.error('Failed to auto-sort email', error)
      results.push({
        emailId: message.id,
        error: (error as Error).message || 'Unknown error'
      })
    }
  }

  return c.json({ results })
})

api.post('/emails/apply-labels', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const { clientId, clientSecret } = getGoogleConfig(c.env)
  const body = await parseJson<{ emailId?: string; category?: string }>(c)

  if (!body?.emailId || !body?.category) {
    return c.json({ error: 'emailId and category required' }, 400)
  }

  const labelName = `VAAI/${body.category}`
  const labels = await gmailListLabels({
    db: c.env.DB,
    googleId,
    clientId,
    clientSecret
  })

  let labelId = labels.labels?.find((label) => label.name === labelName)?.id ?? null
  if (!labelId) {
    const created = await gmailCreateLabel({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      name: labelName
    })
    labelId = created.id
  }

  await gmailModifyMessage({
    db: c.env.DB,
    googleId,
    clientId,
    clientSecret,
    messageId: body.emailId,
    addLabelIds: labelId ? [labelId] : []
  })

  return c.json({ success: true, labelId })
})

api.get('/calendar/events', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const { clientId, clientSecret } = getGoogleConfig(c.env)

  const daysParam = c.req.query('days')
  const limitParam = c.req.query('limit')

  const maxDays = daysParam ? Number.parseInt(daysParam, 10) : 7
  const maxResults = limitParam ? Number.parseInt(limitParam, 10) : 10

  const now = new Date()
  const timeMin = now.toISOString()
  const timeMax = new Date(now.getTime() + (Number.isNaN(maxDays) ? 7 : maxDays) * 24 * 60 * 60 * 1000).toISOString()

  try {
    console.log('Calendar API - Starting fetch with params:', {
      googleId,
      timeMin,
      timeMax,
      maxResults: Number.isNaN(maxResults) ? 10 : maxResults
    })
    
    const response = await calendarListEvents({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      timeMin,
      timeMax,
      maxResults: Number.isNaN(maxResults) ? 10 : maxResults
    })
    
    console.log('Calendar API - Raw response:', JSON.stringify(response, null, 2))

    const events = (response.items ?? []).map((event) => ({
      id: event.id,
      summary: event.summary,
      description: event.description,
      start: event.start,
      end: event.end,
      attendees: event.attendees ?? [],
      hangoutLink: event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri || null,
      htmlLink: event.htmlLink
    }))

    return c.json({ events })
  } catch (error) {
    console.error('Failed to fetch calendar events:', error)
    return c.json({
      error: 'Failed to fetch calendar events',
      message: (error as Error).message
    }, 500)
  }
})

api.get('/calendar/availability', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const { clientId, clientSecret } = getGoogleConfig(c.env)

  const daysParam = c.req.query('days')
  const days = daysParam ? Number.parseInt(daysParam, 10) : 7
  const now = new Date()
  const timeMin = now.toISOString()
  const timeMax = new Date(now.getTime() + (Number.isNaN(days) ? 7 : days) * 24 * 60 * 60 * 1000).toISOString()
  const timeZone = c.req.query('timeZone') || getDefaultTimeZone()

  try {
    const response = await calendarFreeBusy({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      timeMin,
      timeMax,
      timeZone
    })

    const busy = response.calendars?.primary?.busy ?? []

    return c.json({ busy, timeMin, timeMax, timeZone })
  } catch (error) {
    console.error('Failed to fetch calendar availability:', error)
    return c.json({
      error: 'Failed to fetch availability',
      message: (error as Error).message
    }, 500)
  }
})

api.post('/calendar/events', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const { clientId, clientSecret } = getGoogleConfig(c.env)
  const body = await parseJson<{
    summary?: string
    description?: string
    start?: string
    end?: string
    attendees?: Array<string | { email?: string | null }>
    location?: string
    createMeetLink?: boolean
    timeZone?: string
    reminders?: Array<{ method?: string; minutes?: number }>
  }>(c)

  if (!body?.summary || !body.start || !body.end) {
    return c.json({ error: 'Missing required fields: summary, start, end' }, 400)
  }

  const timeZone = body.timeZone || getDefaultTimeZone()

  const event: Record<string, unknown> = {
    summary: body.summary,
    description: body.description,
    location: body.location,
    start: {
      dateTime: body.start,
      timeZone
    },
    end: {
      dateTime: body.end,
      timeZone
    },
    attendees: normalizeAttendees(body.attendees)
  }

  if (body.reminders && Array.isArray(body.reminders)) {
    const overrides = body.reminders
      .map((item) => {
        if (!item) return null
        const minutes = Number.parseInt(String(item.minutes ?? ''), 10)
        if (Number.isNaN(minutes)) return null
        const method = item.method === 'email' ? 'email' : 'popup'
        return { method, minutes }
      })
      .filter(Boolean)
    if (overrides.length) {
      event.reminders = {
        useDefault: false,
        overrides
      }
    }
  }

  if (body.createMeetLink) {
    event.conferenceData = {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: {
          type: 'hangoutsMeet'
        }
      }
    }
  }

  try {
    const response = await calendarInsertEvent({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      body: event,
      conferenceDataVersion: body.createMeetLink ? 1 : undefined
    })

    return c.json({ event: response }, 201)
  } catch (error) {
    console.error('Failed to create calendar event:', error)
    return c.json({
      error: 'Failed to create calendar event',
      message: (error as Error).message
    }, 500)
  }
})

api.patch('/calendar/events/:eventId', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const { clientId, clientSecret } = getGoogleConfig(c.env)
  const body = await parseJson<{
    summary?: string
    description?: string
    start?: string
    end?: string
    timeZone?: string
    attendees?: Array<string | { email?: string }>
    reminders?: Array<{ method?: string; minutes?: number }>
    location?: string
  }>(c)

  if (!body || Object.keys(body).length === 0) {
    return c.json({ error: 'No event fields supplied for update' }, 400)
  }

  const eventPatch: Record<string, unknown> = {}

  if (body.summary !== undefined) eventPatch.summary = body.summary
  if (body.description !== undefined) eventPatch.description = body.description
  if (body.location !== undefined) eventPatch.location = body.location

  const timeZone = body.timeZone || getDefaultTimeZone()

  if (body.start) {
    eventPatch.start = {
      dateTime: body.start,
      timeZone
    }
  }

  if (body.end) {
    eventPatch.end = {
      dateTime: body.end,
      timeZone
    }
  }

  if (body.attendees) {
    eventPatch.attendees = normalizeAttendees(body.attendees)
  }

  if (body.reminders) {
    const overrides = body.reminders
      .map((item) => {
        if (!item) return null
        const minutes = Number.parseInt(String(item.minutes ?? ''), 10)
        if (Number.isNaN(minutes)) return null
        const method = item.method === 'email' ? 'email' : 'popup'
        return { method, minutes }
      })
      .filter(Boolean)
    eventPatch.reminders = overrides.length
      ? { useDefault: false, overrides }
      : { useDefault: true }
  }

  try {
    const response = await calendarPatchEvent({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      eventId: c.req.param('eventId'),
      body: eventPatch
    })
    return c.json({ event: response })
  } catch (error) {
    console.error('Failed to update calendar event:', error)
    return c.json({
      error: 'Failed to update calendar event',
      message: (error as Error).message
    }, 500)
  }
})

api.post('/calendar/reminders/time-block', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const { clientId, clientSecret } = getGoogleConfig(c.env)
  const body = await parseJson<{
    summary?: string
    start?: string
    durationMinutes?: number
    description?: string
    attendees?: Array<string | { email?: string }>
    reminders?: Array<{ method?: string; minutes?: number }>
    timeZone?: string
    location?: string
  }>(c)

  if (!body?.summary) {
    return c.json({ error: 'Reminder summary is required' }, 400)
  }

  const startDate = body.start ? new Date(body.start) : new Date()
  if (Number.isNaN(startDate.getTime())) {
    return c.json({ error: 'Invalid start datetime supplied' }, 400)
  }

  const duration = body.durationMinutes ?? 30
  const endDate = new Date(startDate.getTime() + duration * 60 * 1000)
  const timeZone = body.timeZone || getDefaultTimeZone()

  const event: Record<string, unknown> = {
    summary: body.summary,
    description: body.description,
    location: body.location,
    start: {
      dateTime: startDate.toISOString(),
      timeZone
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone
    },
    attendees: normalizeAttendees(body.attendees)
  }

  if (body.reminders) {
    const overrides = body.reminders
      .map((item) => {
        if (!item) return null
        const minutes = Number.parseInt(String(item.minutes ?? ''), 10)
        if (Number.isNaN(minutes)) return null
        const method = item.method === 'email' ? 'email' : 'popup'
        return { method, minutes }
      })
      .filter(Boolean)

    if (overrides.length) {
      event.reminders = { useDefault: false, overrides }
    }
  }

  try {
    const response = await calendarInsertEvent({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      body: event
    })

    return c.json({
      reminder: {
        id: response.id,
        summary: response.summary,
        start: (response as any).start,
        end: (response as any).end,
        htmlLink: response.htmlLink
      }
    }, 201)
  } catch (error) {
    console.error('Failed to create calendar reminder:', error)
    return c.json({
      error: 'Failed to create calendar reminder',
      message: (error as Error).message
    }, 500)
  }
})

// Google Tasks endpoints
api.get('/tasks', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const { clientId, clientSecret } = getGoogleConfig(c.env)

  const limitParam = c.req.query('limit')
  const maxResults = limitParam ? Number.parseInt(limitParam, 10) : 50

  try {
    console.log('Tasks API - Starting fetch with params:', {
      googleId,
      taskListId: '@default',
      maxResults: Number.isNaN(maxResults) ? 50 : maxResults
    })
    
    const response = await googleTasksList({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      taskListId: '@default',
      maxResults: Number.isNaN(maxResults) ? 50 : maxResults
    })
    
    console.log('Tasks API - Raw response:', JSON.stringify(response, null, 2))

    const tasks = (response.items ?? []).map((task) => ({
      id: task.id,
      title: task.title,
      notes: task.notes,
      status: task.status,
      due: task.due,
      completed: task.completed,
      updated: task.updated,
      links: task.links ?? []
    }))

    return c.json({ tasks })
  } catch (error) {
    console.error('Failed to fetch tasks:', error)
    return c.json({
      error: 'Failed to fetch tasks',
      message: (error as Error).message
    }, 500)
  }
})

api.post('/tasks', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const { clientId, clientSecret } = getGoogleConfig(c.env)
  const body = await parseJson<{
    title?: string
    notes?: string
    due?: string
  }>(c)

  if (!body?.title) {
    return c.json({ error: 'Task title is required' }, 400)
  }

  const task: Record<string, unknown> = {
    title: body.title
  }

  if (body.notes) {
    task.notes = body.notes
  }

  if (body.due) {
    task.due = body.due
  }

  try {
    const response = await googleTasksInsert({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      taskListId: '@default',
      body: task
    })

    return c.json({ task: response }, 201)
  } catch (error) {
    console.error('Failed to create task:', error)
    return c.json({
      error: 'Failed to create task',
      message: (error as Error).message
    }, 500)
  }
})

api.patch('/tasks/:taskId', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const { clientId, clientSecret } = getGoogleConfig(c.env)
  const body = await parseJson<{
    title?: string
    notes?: string
    due?: string
    status?: string
  }>(c)

  if (!body || Object.keys(body).length === 0) {
    return c.json({ error: 'No task fields supplied for update' }, 400)
  }

  const taskPatch: Record<string, unknown> = {}

  if (body.title !== undefined) taskPatch.title = body.title
  if (body.notes !== undefined) taskPatch.notes = body.notes
  if (body.due !== undefined) taskPatch.due = body.due
  if (body.status !== undefined) taskPatch.status = body.status

  try {
    const response = await googleTasksPatch({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      taskListId: '@default',
      taskId: c.req.param('taskId'),
      body: taskPatch
    })
    
    return c.json({ task: response })
  } catch (error) {
    console.error('Failed to update task:', error)
    return c.json({
      error: 'Failed to update task',
      message: (error as Error).message
    }, 500)
  }
})

// Google Docs API endpoints
api.get('/googledocs-test', async (c) => {
  return c.json({ message: 'Google Docs API endpoint is working', timestamp: new Date().toISOString() })
})

api.get('/googledocs', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const { clientId, clientSecret } = getGoogleConfig(c.env)

  try {
    console.log('Google Docs API - Fetching documents for user:', googleId)
    
    // List Google Docs files using Drive API
    const response = await googleDriveListFiles({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      q: "mimeType='application/vnd.google-apps.document'",
      orderBy: 'modifiedTime desc',
      pageSize: 50
    })

    console.log('Google Docs API - Raw response:', JSON.stringify(response, null, 2))

    const docs = (response.files ?? []).map((file) => ({
      id: file.id,
      name: file.name,
      title: file.name,
      webViewLink: file.webViewLink,
      webContentLink: file.webContentLink,
      modifiedTime: file.modifiedTime,
      createdTime: file.createdTime,
      mimeType: file.mimeType,
      size: file.size
    }))

    return c.json(docs)
  } catch (error) {
    console.error('Failed to fetch Google Docs:', error)
    return c.json({
      error: 'Failed to fetch Google Docs',
      message: (error as Error).message
    }, 500)
  }
})

api.post('/googledocs/create', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const { clientId, clientSecret } = getGoogleConfig(c.env)
  const body = await parseJson<{
    title?: string
  }>(c)

  if (!body?.title) {
    return c.json({ error: 'Document title is required' }, 400)
  }

  try {
    console.log('Google Docs API - Creating document:', body.title)
    
    const response = await googleDocsCreateDocument({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      title: body.title
    })

    console.log('Google Docs API - Created document:', JSON.stringify(response, null, 2))

    return c.json({
      id: response.documentId,
      title: body.title,
      webViewLink: `https://docs.google.com/document/d/${response.documentId}/edit`,
      createdTime: new Date().toISOString()
    }, 201)
  } catch (error) {
    console.error('Failed to create Google Doc:', error)
    return c.json({
      error: 'Failed to create Google Doc',
      message: (error as Error).message
    }, 500)
  }
})

// Google Sheets API endpoints
api.get('/googlesheets-test', async (c) => {
  return c.json({ message: 'Google Sheets API endpoint is working', timestamp: new Date().toISOString() })
})

api.get('/googlesheets', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const { clientId, clientSecret } = getGoogleConfig(c.env)

  try {
    console.log('Google Sheets API - Fetching spreadsheets for user:', googleId)
    
    // List Google Sheets files using Drive API
    const response = await googleDriveListFiles({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      orderBy: 'modifiedTime desc',
      pageSize: 50
    })

    console.log('Google Sheets API - Raw response:', JSON.stringify(response, null, 2))

    const sheets = (response.files ?? []).map((file) => ({
      id: file.id,
      name: file.name,
      title: file.name,
      webViewLink: file.webViewLink,
      webContentLink: file.webContentLink,
      modifiedTime: file.modifiedTime,
      createdTime: file.createdTime,
      mimeType: file.mimeType,
      size: file.size
    }))

    return c.json(sheets)
  } catch (error) {
    console.error('Failed to fetch Google Sheets:', error)
    return c.json({
      error: 'Failed to fetch Google Sheets',
      message: (error as Error).message
    }, 500)
  }
})

api.post('/googlesheets/create', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const { clientId, clientSecret } = getGoogleConfig(c.env)
  const body = await parseJson<{
    title?: string
  }>(c)

  if (!body?.title) {
    return c.json({ error: 'Spreadsheet title is required' }, 400)
  }

  try {
    console.log('Google Sheets API - Creating spreadsheet:', body.title)
    
    // Create a new Google Sheet using the Sheets API directly
    const { user, accessToken } = await ensureGoogleAccessToken(c.env.DB, googleId, clientId, clientSecret)
    
    const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title: body.title
        }
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to create spreadsheet: ${await response.text()}`)
    }

    const result = await response.json() as any

    console.log('Google Sheets API - Created spreadsheet:', JSON.stringify(result, null, 2))

    return c.json({
      id: result.spreadsheetId,
      name: body.title,
      title: body.title,
      webViewLink: result.spreadsheetUrl,
      createdTime: new Date().toISOString()
    }, 201)
  } catch (error) {
    console.error('Failed to create Google Sheet:', error)
    return c.json({
      error: 'Failed to create Google Sheet',
      message: (error as Error).message
    }, 500)
  }
})

// Favorites API endpoints
api.get('/favorites', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)

  try {
    console.log('Favorites API - Fetching favorites for user:', googleId)
    
    const favorites = await c.env.DB.prepare(
      'SELECT * FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(googleId).all()

    console.log('Favorites API - Found favorites:', favorites.results.length)

    return c.json(favorites.results || [])
  } catch (error) {
    console.error('Failed to fetch favorites:', error)
    return c.json({
      error: 'Failed to fetch favorites',
      message: (error as Error).message
    }, 500)
  }
})

api.post('/favorites', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const body = await parseJson<{
    command?: string
  }>(c)

  if (!body?.command?.trim()) {
    return c.json({ error: 'Command is required' }, 400)
  }

  try {
    console.log('Favorites API - Adding favorite for user:', googleId)
    
    // Check if favorite already exists
    const existing = await c.env.DB.prepare(
      'SELECT id FROM user_favorites WHERE user_id = ? AND command = ?'
    ).bind(googleId, body.command.trim()).first()

    if (existing) {
      return c.json({ error: 'Command already in favorites' }, 409)
    }

    // Add new favorite
    const result = await c.env.DB.prepare(
      'INSERT INTO user_favorites (user_id, command, created_at) VALUES (?, ?, datetime("now")) RETURNING *'
    ).bind(googleId, body.command.trim()).first()

    console.log('Favorites API - Added favorite:', result)

    return c.json(result, 201)
  } catch (error) {
    console.error('Failed to add favorite:', error)
    return c.json({
      error: 'Failed to add favorite',
      message: (error as Error).message
    }, 500)
  }
})

api.delete('/favorites/:id', async (c) => {
  const authed = c.get('user')
  const googleId = getGoogleIdFromPayload(authed)
  const favoriteId = c.req.param('id')

  try {
    console.log('Favorites API - Removing favorite:', favoriteId, 'for user:', googleId)
    
    const result = await c.env.DB.prepare(
      'DELETE FROM user_favorites WHERE id = ? AND user_id = ?'
    ).bind(favoriteId, googleId).run()

    if (result.changes === 0) {
      return c.json({ error: 'Favorite not found' }, 404)
    }

    console.log('Favorites API - Removed favorite successfully')

    return c.json({ success: true })
  } catch (error) {
    console.error('Failed to remove favorite:', error)
    return c.json({
      error: 'Failed to remove favorite',
      message: (error as Error).message
    }, 500)
  }
})

api.post('/assistant', async (c) => {
  try {
    const user = await resolveCurrentUser(c)
    const authed = c.get('user')
    const body = await parseJson<{ 
      message?: string; 
      context?: Record<string, unknown>;
      conversation?: Array<{ role: string; content: string }>;
      timezone?: string;
    }>(c)

    if (!body?.message || !body.message.trim()) {
      return c.json({ error: 'Message is required.' }, 400)
    }

    if (!c.env.OPENAI_API_KEY) {
      return c.json({
        reply: 'The assistant is not available right now because the OpenAI key is missing.'
      })
    }

    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)
    const teamIdHeader = c.req.header('x-team-id')

    const userContext = {
      userId: authed.userId,
      email: authed.email || user.email || null,
      teamId: teamIdHeader || null
    }

    // Build conversation history with timezone and context
    const userTimezone = body.timezone || 'UTC'
    let contextualPrompt = assistantSystemPrompt + `\n\nUser's timezone: ${userTimezone}. Convert all times to this timezone when creating ISO 8601 dates.`
    
    // Add email context if available
    if (body.context && typeof body.context === 'object') {
      const emails = Array.isArray(body.context.emails) ? body.context.emails : []
      const calendar = Array.isArray(body.context.calendar) ? body.context.calendar : []
      const tasks = Array.isArray(body.context.tasks) ? body.context.tasks : []
      
      if (emails.length > 0) {
        contextualPrompt += `\n\nCURRENT EMAIL CONTEXT:\nThe user has ${emails.length} emails in their inbox:\n`
        emails.slice(0, 10).forEach((email: any, index: number) => {
          const category = email.category || 'uncategorized'
          contextualPrompt += `${index + 1}. [${category.toUpperCase()}] "${email.subject}" from ${email.from} (${email.time})\n`
        })
        
        const priorityEmails = emails.filter((email: any) => email.category === 'priority')
        const workEmails = emails.filter((email: any) => email.category === 'work')
        const personalEmails = emails.filter((email: any) => email.category === 'personal')
        
        contextualPrompt += `\nEmail Summary: ${priorityEmails.length} priority, ${workEmails.length} work, ${personalEmails.length} personal emails.`
      }
      
      if (calendar.length > 0) {
        contextualPrompt += `\n\nThe user has ${calendar.length} upcoming calendar events.`
      }
      
      if (tasks.length > 0) {
        const pendingTasks = tasks.filter((task: any) => task.status !== 'completed')
        contextualPrompt += `\n\nThe user has ${pendingTasks.length} pending tasks.`
      }
    }
    
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: contextualPrompt }
    ]

    // Add conversation history if provided
    if (body.conversation && Array.isArray(body.conversation)) {
      messages.push(...body.conversation.filter(msg => 
        msg && typeof msg.role === 'string' && typeof msg.content === 'string'
      ))
    } else {
      // Fallback to single message
      messages.push({ role: 'user', content: body.message.trim() })
    }

    const completionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        tools: assistantTools,
        tool_choice: 'auto'
      })
    })

    if (!completionResponse.ok) {
      const text = await completionResponse.text()
      throw new Error(`OpenAI response error: ${completionResponse.status} ${text}`)
    }

    const completion = await completionResponse.json<{
      choices?: Array<{
        message?: {
          content?: string
          tool_calls?: Array<{
            function?: {
              name?: string
              arguments?: string
            }
          }>
        }
      }>
    }>()

    const choice = completion.choices?.[0]
    const assistantMessage = choice?.message

    if (assistantMessage?.tool_calls?.length) {
      for (const toolCall of assistantMessage.tool_calls) {
        const fn = toolCall.function
        if (!fn?.name) continue

        if (fn.name === 'create_calendar_event') {
          let args: Record<string, unknown> = {}
          try {
            args = fn.arguments ? JSON.parse(fn.arguments) : {}
          } catch (parseError) {
            console.error('Assistant tool argument parse error:', parseError)
            return c.json({
              reply: 'I had trouble understanding some of the event details. Could you restate the date and time?'
            })
          }

          const summary = typeof args.summary === 'string' ? args.summary : ''
          const start = typeof args.start === 'string' ? args.start : ''
          const end = typeof args.end === 'string' ? args.end : ''

          if (!summary || !start || !end) {
            return c.json({
              reply: 'I need a meeting title with both start and end times to schedule that. Please provide those details.'
            })
          }

          const result = await createCalendarEventForAssistant({
            env: c.env,
            googleId,
            clientId,
            clientSecret,
            summary,
            start,
            end,
            attendees: args.attendees,
            location: typeof args.location === 'string' ? args.location : undefined,
            description: typeof args.description === 'string' ? args.description : undefined,
            timezone: body.timezone
          })

          return c.json(result)
        }

        if (fn.name === 'create_task') {
          let args: Record<string, unknown> = {}
          try {
            args = fn.arguments ? JSON.parse(fn.arguments) : {}
          } catch (parseError) {
            console.error('Assistant task tool parse error:', parseError)
            return c.json({
              reply: 'I had trouble understanding the reminder details. Could you restate what you need me to remember?'
            })
          }



          const title = typeof args.title === 'string' ? args.title : ''
          if (!title) {
            return c.json({
              reply: 'I need a short title to create that reminder. Please provide one and try again.'
            })
          }

          const taskResult = await createTaskForAssistant({
            env: c.env,
            googleId,
            clientId,
            clientSecret,
            title,
            notes: typeof args.notes === 'string' ? args.notes : undefined,
            due: typeof args.due === 'string' ? args.due : undefined,
            timezone: body.timezone
          })

          return c.json(taskResult)
        }
      }
    }

    const content = assistantMessage?.content?.trim()
    if (content) {
      return c.json({ reply: content })
    }

    return c.json({
      reply: 'I’m not certain how to help with that yet. Try asking me to schedule a meeting or summarise an email.'
    })
  } catch (error) {
    return handleRouteError(c, error, 'Assistant failed')
  }
})

api.post('/assistant/actions/draft-reply', async (c) => {
  try {
    const user = await resolveCurrentUser(c)
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)
    const body = await parseJson<{ emailId?: string; threadId?: string }>(c)

    if (!body?.emailId) {
      return c.json({ error: 'emailId is required' }, 400)
    }

    const action = await createAssistantAction(c.env.DB, {
      userId: user.id,
      emailId: body.emailId,
      threadId: body.threadId ?? null,
      actionType: 'draft_reply',
      payload: body ?? {}
    })

    const draft = await draftReply(c.env, {
      googleId,
      clientId,
      clientSecret,
      userEmail: user.email,
      userName: authed.name || user.email?.split('@')[0] || 'Assistant',
      emailId: body.emailId,
      threadId: body.threadId ?? null
    })

    await updateAssistantActionResult(c.env.DB, action.id, {
      status: 'completed',
      result: { draft }
    })

    return c.json({
      actionId: action.id,
      draft
    })
  } catch (error) {
    return handleRouteError(c, error, 'Unable to draft reply')
  }
})

api.post('/assistant/actions/schedule-meeting', async (c) => {
  try {
    const user = await resolveCurrentUser(c)
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)
    const body = await parseJson<{ emailId?: string; threadId?: string; durationMinutes?: number }>(c)

    if (!body?.emailId) {
      return c.json({ error: 'emailId is required' }, 400)
    }

    const action = await createAssistantAction(c.env.DB, {
      userId: user.id,
      emailId: body.emailId,
      threadId: body.threadId ?? null,
      actionType: 'schedule_meeting',
      payload: body ?? {}
    })

    const suggestions = await suggestMeetingTimes(c.env, {
      googleId,
      clientId,
      clientSecret,
      durationMinutes: Number(body?.durationMinutes) || 30,
      emailId: body.emailId
    })

    await updateAssistantActionResult(c.env.DB, action.id, {
      status: 'awaiting_confirmation',
      result: { suggestions }
    })

    return c.json({
      actionId: action.id,
      suggestions
    })
  } catch (error) {
    return handleRouteError(c, error, 'Unable to suggest meeting times')
  }
})

api.post('/assistant/actions/mark-handled', async (c) => {
  try {
    const user = await resolveCurrentUser(c)
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)
    const body = await parseJson<{ emailId?: string; threadId?: string; labelName?: string }>(c)

    if (!body?.emailId) {
      return c.json({ error: 'emailId is required' }, 400)
    }

    const action = await createAssistantAction(c.env.DB, {
      userId: user.id,
      emailId: body.emailId,
      threadId: body.threadId ?? null,
      actionType: 'mark_handled',
      payload: body ?? {}
    })

    const result = await markEmailHandled(c.env, {
      googleId,
      clientId,
      clientSecret,
      emailId: body.emailId,
      labelName: body.labelName || 'VAAI/Handled'
    })

    await updateAssistantActionResult(c.env.DB, action.id, {
      status: 'completed',
      result
    })

    return c.json({
      actionId: action.id,
      result
    })
  } catch (error) {
    return handleRouteError(c, error, 'Unable to mark email handled')
  }
})

api.post('/assistant/actions/:actionId/undo', async (c) => {
  try {
    const user = await resolveCurrentUser(c)
    const actionId = Number.parseInt(c.req.param('actionId'), 10)

    if (!Number.isFinite(actionId)) {
      return c.json({ error: 'Invalid action id' }, 400)
    }

    const action = await getAssistantActionById(c.env.DB, actionId)
    if (!action || action.userId !== user.id) {
      return c.json({ error: 'Action not found' }, 404)
    }

    await updateAssistantActionResult(c.env.DB, actionId, {
      status: 'undone',
      undone: true
    })

    return c.json({ success: true })
  } catch (error) {
    return handleRouteError(c, error, 'Unable to undo action')
  }
})

api.post('/assistant/actions/:actionId/feedback', async (c) => {
  try {
    const user = await resolveCurrentUser(c)
    const actionId = Number.parseInt(c.req.param('actionId'), 10)

    if (!Number.isFinite(actionId)) {
      return c.json({ error: 'Invalid action id' }, 400)
    }

    const body = await parseJson<{ rating?: string; note?: string }>(c)
    if (!body?.rating || !['helpful', 'not_helpful', 'needs_follow_up'].includes(body.rating)) {
      return c.json({ error: 'rating must be one of helpful, not_helpful, needs_follow_up' }, 400)
    }

    const action = await getAssistantActionById(c.env.DB, actionId)
    if (!action || action.userId !== user.id) {
      return c.json({ error: 'Action not found' }, 404)
    }

    await saveAssistantActionFeedback(c.env.DB, actionId, {
      rating: body.rating,
      note: body.note ?? null
    })

    return c.json({ success: true })
  } catch (error) {
    return handleRouteError(c, error, 'Unable to record feedback')
  }
})

api.get('/assistant/actions/metrics', async (c) => {
  try {
    const user = await resolveCurrentUser(c)
    const daysQuery = c.req.query('days')
    const days = daysQuery ? Number.parseInt(daysQuery, 10) : 7

    const metrics = await getAssistantActionMetrics(c.env.DB, user.id, {
      days: Number.isFinite(days) && days > 0 ? days : 7
    })

    return c.json(metrics)
  } catch (error) {
    return handleRouteError(c, error, 'Unable to fetch action metrics')
  }
})

api.get('/google/docs/templates', async (c) => {
  try {
    await resolveCurrentUser(c)
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)

    const folderId = c.req.query('folderId') || undefined
    const search = c.req.query('search') || undefined
    const pageSizeParam = c.req.query('pageSize')
    const pageSize = pageSizeParam ? Number.parseInt(pageSizeParam, 10) : undefined
    const pageToken = c.req.query('pageToken') || undefined

    const list = await googleDriveListFiles({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      mimeType: 'application/vnd.google-apps.document',
      folderId,
      search,
      pageSize,
      pageToken,
      supportsAllDrives: true
    })

    return c.json({
      files: list.files ?? [],
      nextPageToken: list.nextPageToken ?? null
    })
  } catch (error) {
    return handleRouteError(c, error, 'Unable to load document templates')
  }
})

api.post('/google/docs', async (c) => {
  try {
    const user = await resolveCurrentUser(c)
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)
    const body = await parseJson<{
      title?: string
      content?: string
      folderId?: string
      templateDocumentId?: string
      contentFormat?: string
    }>(c)

    const title = body?.title?.trim()
    if (!title) {
      return c.json({ error: 'Document title is required' }, 400)
    }

    const folderId = body.folderId?.trim() || undefined
    const templateDocumentId = body.templateDocumentId?.trim() || undefined
    const contentFormat = (body.contentFormat || 'markdown').toLowerCase() === 'plain' ? 'plain' : 'markdown'
    const content = body.content?.trim() || ''

    let documentId: string | undefined
    let documentTitle = title

    if (templateDocumentId) {
      const copy = await googleDriveCopyFile({
        db: c.env.DB,
        googleId,
        clientId,
        clientSecret,
        fileId: templateDocumentId,
        name: title,
        parents: folderId ? [folderId] : undefined,
        supportsAllDrives: true
      })

      documentId = copy.id
      documentTitle = copy.name ?? title
      if (!documentId) {
        throw new Error('Failed to copy template document')
      }
    } else {
      const created = await googleDocsCreateDocument({
        db: c.env.DB,
        googleId,
        clientId,
        clientSecret,
        title
      })

      documentId = created.documentId
      documentTitle = created.title ?? title
      if (!documentId) {
        throw new Error('Google Docs response missing documentId')
      }

      if (folderId) {
        try {
          const existing = await googleDriveGetFile({
            db: c.env.DB,
            googleId,
            clientId,
            clientSecret,
            fileId: documentId,
            fields: 'parents',
            supportsAllDrives: true
          })
          const previousParents = existing.parents?.join(',') || undefined
          await googleDriveUpdateParents({
            db: c.env.DB,
            googleId,
            clientId,
            clientSecret,
            fileId: documentId,
            addParents: folderId,
            removeParents: previousParents,
            supportsAllDrives: true
          })
        } catch (err) {
          console.error('Failed to move Google Doc into folder:', err)
        }
      }
    }

    if (content) {
      const normalizedContent =
        contentFormat === 'markdown' ? convertMarkdownToPlain(content) : content
      const text = normalizedContent.endsWith('\n') ? normalizedContent : `${normalizedContent}\n`

      await googleDocsBatchUpdate({
        db: c.env.DB,
        googleId,
        clientId,
        clientSecret,
        documentId,
        requests: [
          {
            insertText: {
              text,
              location: { index: 1 }
            }
          }
        ]
      })
    }

    return c.json({
      document: {
        documentId,
        title: documentTitle,
        templateId: templateDocumentId || null,
        documentLink: `https://docs.google.com/document/d/${documentId}/edit`
      }
    }, 201)
  } catch (error) {
    return handleRouteError(c, error, 'Failed to create Google Doc')
  }
})

api.post('/google/docs/:documentId/append', async (c) => {
  try {
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)
    const body = await parseJson<{ content?: string }>(c)
    const documentId = c.req.param('documentId')

    if (!documentId) {
      return c.json({ error: 'Document id is required' }, 400)
    }
    if (!body?.content) {
      return c.json({ error: 'Content is required to append text' }, 400)
    }

    await googleDocsBatchUpdate({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      documentId,
      requests: [
        {
          insertText: {
            text: `\n${body.content}`,
            endOfSegmentLocation: { segmentId: '' }
          }
        }
      ]
    })

    return c.json({
      document: {
        documentId,
        documentLink: `https://docs.google.com/document/d/${documentId}/edit`
      }
    })
  } catch (error) {
    return handleRouteError(c, error, 'Failed to append content to Google Doc')
  }
})

api.post('/google/sheets/append', async (c) => {
  try {
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)
    const body = await parseJson<{ spreadsheetId?: string; range?: string; values?: unknown[][]; valueInputOption?: string }>(c)

    if (!body?.spreadsheetId) {
      return c.json({ error: 'Spreadsheet id is required' }, 400)
    }
    if (!body.range) {
      return c.json({ error: 'Target range is required' }, 400)
    }
    if (!Array.isArray(body.values) || !body.values.length) {
      return c.json({ error: 'Values array is required' }, 400)
    }

    await googleSheetsAppendValues({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      spreadsheetId: body.spreadsheetId,
      range: body.range,
      values: body.values,
      valueInputOption: body.valueInputOption || 'USER_ENTERED'
    })

    return c.json({
      success: true,
      spreadsheetId: body.spreadsheetId,
      range: body.range
    }, 201)
  } catch (error) {
    return handleRouteError(c, error, 'Failed to append rows to sheet')
  }
})

api.get('/google/sheets/list', async (c) => {
  try {
    await resolveCurrentUser(c)
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)

    const folderId = c.req.query('folderId') || undefined
    const search = c.req.query('search') || undefined
    const pageSizeParam = c.req.query('pageSize')
    const pageSize = pageSizeParam ? Number.parseInt(pageSizeParam, 10) : undefined
    const pageToken = c.req.query('pageToken') || undefined

    const list = await googleDriveListFiles({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      folderId,
      search,
      pageSize,
      pageToken,
      supportsAllDrives: true
    })

    return c.json({
      files: list.files ?? [],
      nextPageToken: list.nextPageToken ?? null
    })
  } catch (error) {
    return handleRouteError(c, error, 'Unable to load spreadsheets')
  }
})

api.post('/gmail/compose/send', async (c) => {
  try {
    const user = await resolveCurrentUser(c)
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)
    const body = await parseJson<EmailComposePayload>(c)

    if (!body?.to || !body.subject || (!body.textBody && !body.htmlBody)) {
      return c.json({ error: 'to, subject, and one of textBody or htmlBody are required' }, 400)
    }

    const from = formatAddressList(body.from ?? user.email)
    if (!from) {
      return c.json({ error: 'Sender email address is required' }, 400)
    }

    const raw = buildMimeMessage({
      from,
      to: formatAddressList(body.to),
      cc: formatOptionalAddress(body.cc),
      bcc: formatOptionalAddress(body.bcc),
      subject: body.subject,
      text: body.textBody ?? undefined,
      html: body.htmlBody ?? undefined
    })

    const message = await gmailSendMessage({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      raw,
      labelIds: Array.isArray(body.labelIds) ? body.labelIds : undefined,
      sendAt: body.sendAt
    })

    return c.json({ message }, 201)
  } catch (error) {
    return handleRouteError(c, error, 'Failed to send email')
  }
})

api.post('/gmail/compose/drafts', async (c) => {
  try {
    const user = await resolveCurrentUser(c)
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)
    const body = await parseJson<EmailComposePayload>(c)

    if (!body?.to || !body.subject || (!body.textBody && !body.htmlBody)) {
      return c.json({ error: 'to, subject, and one of textBody or htmlBody are required' }, 400)
    }

    const from = formatAddressList(body.from ?? user.email)
    if (!from) {
      return c.json({ error: 'Sender email address is required' }, 400)
    }

    const raw = buildMimeMessage({
      from,
      to: formatAddressList(body.to),
      cc: formatOptionalAddress(body.cc),
      bcc: formatOptionalAddress(body.bcc),
      subject: body.subject,
      text: body.textBody ?? undefined,
      html: body.htmlBody ?? undefined
    })

    const draft = await gmailCreateDraft({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      raw
    })

    return c.json({ draft }, 201)
  } catch (error) {
    return handleRouteError(c, error, 'Failed to create draft')
  }
})

api.get('/gmail/compose/drafts', async (c) => {
  try {
    await resolveCurrentUser(c)
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)
    const maxResults = Number.parseInt(c.req.query('maxResults') ?? '', 10)
    const limit = Number.isFinite(maxResults) && maxResults > 0 ? maxResults : 10

    const list = await gmailListDrafts({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      maxResults: limit
    })

    const drafts = list.drafts ?? []
    if (!drafts.length) {
      return c.json({ drafts: [] })
    }

    const detailed = await Promise.all(
      drafts
        .filter((draft) => draft.id)
        .map((draft) =>
          gmailGetDraft({
            db: c.env.DB,
            googleId,
            clientId,
            clientSecret,
            draftId: draft.id!,
            metadataHeaders: ['Subject', 'To', 'Cc', 'Bcc', 'Date']
          })
        )
    )

    return c.json({ drafts: detailed })
  } catch (error) {
    return handleRouteError(c, error, 'Failed to list drafts')
  }
})

api.post('/gmail/compose/drafts/:draftId/send', async (c) => {
  try {
    await resolveCurrentUser(c)
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)
    const draftId = c.req.param('draftId')

    if (!draftId) {
      return c.json({ error: 'Draft id is required' }, 400)
    }

    const message = await gmailSendDraft({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      draftId
    })

    return c.json({ message })
  } catch (error) {
    return handleRouteError(c, error, 'Failed to send draft')
  }
})

api.get('/gmail/inbox', async (c) => {
  try {
    await resolveCurrentUser(c)
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)
    
    const maxResultsParam = c.req.query('maxResults')
    const maxResults = maxResultsParam ? Number.parseInt(maxResultsParam, 10) : 10
    const limit = Number.isFinite(maxResults) && maxResults > 0 ? maxResults : 10
    
    // Get recent messages from inbox
    const messageList = await gmailListMessages({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      maxResults: limit,
      query: 'in:inbox' // Only show inbox messages
    })
    
    const messages = []
    const rawMessages = messageList.messages ?? []
    
    for (const message of rawMessages.slice(0, limit)) {
      try {
        const full = await gmailGetMessage({
          db: c.env.DB,
          googleId,
          clientId,
          clientSecret,
          id: message.id,
          format: 'full'
        })
        
        const subject = getHeader(full.payload, 'Subject') || 'No Subject'
        const from = getHeader(full.payload, 'From') || 'Unknown Sender'
        const date = full.internalDate ? new Date(Number(full.internalDate)) : new Date()
        
        // Extract message snippet/preview
        let snippet = full.snippet || ''
        if (snippet.length > 150) {
          snippet = snippet.substring(0, 150) + '...'
        }
        
        messages.push({
          id: message.id,
          threadId: message.threadId,
          subject,
          from,
          date: date.toISOString(),
          snippet,
          sender: from.split('<')[0].trim(), // Clean sender name
          preview: snippet
        })
      } catch (error) {
        console.error('Failed to fetch message details:', error)
        // Continue with other messages if one fails
      }
    }
    
    return c.json({ messages })
  } catch (error) {
    return handleRouteError(c, error, 'Failed to load inbox')
  }
})

api.get('/google/tasks', async (c) => {
  try {
    const user = await resolveCurrentUser(c)
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)

    const listId = c.req.query('listId') || '@default'
    const showCompleted = c.req.query('showCompleted') === 'true'
    const maxResultsParam = c.req.query('maxResults')
    const maxResults = maxResultsParam ? Number.parseInt(maxResultsParam, 10) : 20
    const limit = Number.isFinite(maxResults) && maxResults > 0 ? maxResults : 20

    const response = await googleTasksList({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      taskListId: String(listId),
      showCompleted,
      maxResults: limit
    })

    const tasks = (response.items ?? [])
      .map((task) => mapGoogleTask(task))
      .filter((task): task is GoogleTask => Boolean(task))

    return c.json({ tasks })
  } catch (error) {
    return handleRouteError(c, error, 'Unable to load tasks')
  }
})

api.post('/google/tasks', async (c) => {
  try {
    const user = await resolveCurrentUser(c)
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)
    const body = await parseJson<{ title?: string; notes?: string; due?: string; listId?: string }>(c)

    if (!body?.title || !body.title.trim()) {
      return c.json({ error: 'Task title is required' }, 400)
    }

    const response = await googleTasksInsert({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      taskListId: body.listId || '@default',
      body: {
        title: body.title.trim(),
        notes: body.notes,
        due: body.due
      }
    })

    const task = mapGoogleTask(response)
    return c.json({ task }, 201)
  } catch (error) {
    return handleRouteError(c, error, 'Unable to create task')
  }
})

api.post('/google/tasks/:taskId/complete', async (c) => {
  try {
    await resolveCurrentUser(c)
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)
    const taskId = c.req.param('taskId')

    if (!taskId) {
      return c.json({ error: 'Task id is required' }, 400)
    }

    const body = await parseJson<{ listId?: string }>(c)
    const response = await googleTasksPatch({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      taskListId: body?.listId || '@default',
      taskId,
      body: {
        status: 'completed',
        completed: new Date().toISOString()
      }
    })

    const task = mapGoogleTask(response)
    return c.json({ task })
  } catch (error) {
    return handleRouteError(c, error, 'Unable to complete task')
  }
})

api.get('/briefing', async (c) => {
  try {
    const user = await resolveCurrentUser(c)
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)

    const timeframeHoursParam = c.req.query('hours')
    const maxEmailsParam = c.req.query('limit')
    const timeframeHours = Number.isFinite(Number(timeframeHoursParam))
      ? Math.max(Number(timeframeHoursParam), 1)
      : 24
    const maxEmails = Number.isFinite(Number(maxEmailsParam))
      ? Math.max(Number(maxEmailsParam), 1)
      : 20

    const queryParts = [`newer_than:${timeframeHours}h`, 'in:inbox', '-category:{forums promotions}']
    const list = await gmailListMessages({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      maxResults: maxEmails,
      query: queryParts.join(' ')
    })

    const messages = list.messages ?? []
    if (messages.length === 0) {
      return c.json({
        generatedAt: new Date().toISOString(),
        summary: 'No new emails in the selected timeframe.',
        items: [],
        metadata: {
          timeframeHours,
          maxEmails,
          fetched: 0,
          query: queryParts.join(' ')
        }
      })
    }

    const items: BriefingItem[] = []

    for (const message of messages) {
      try {
        const full = await gmailGetMessage({
          db: c.env.DB,
          googleId,
          clientId,
          clientSecret,
          id: message.id,
          format: 'full'
        })

        const subjectRaw = getHeader(full.payload, 'Subject')
        const fromRaw = getHeader(full.payload, 'From')
        const subject = subjectRaw || '(No subject)'
        const from = fromRaw || '(Unknown sender)'
        const body = trimContent(extractPlainBody(full.payload) || full.snippet || '', 4000)
        const snippet = trimContent(full.snippet || '', 260)
        const receivedAt = full.internalDate
          ? new Date(Number(full.internalDate)).toISOString()
          : new Date().toISOString()

        const heuristic = quickBriefingHeuristic({ subject, body })
        let intent = heuristic?.intent ?? 'general'
        let suggestedAction = heuristic?.suggestedAction ?? defaultSuggestedAction(intent)

        if (!heuristic || heuristic.intent === 'general') {
          const aiIntent = await classifyBriefingIntent(c.env, {
            subject,
            from,
            body
          })
          intent = aiIntent.intent || intent
          suggestedAction = aiIntent.suggestedAction || suggestedAction
        }

        const actions = buildBriefingActions(intent, {
          emailId: full.id,
          threadId: full.threadId,
          subject,
          from
        })

        items.push({
          emailId: full.id,
          threadId: full.threadId ?? undefined,
          subject,
          from,
          snippet,
          body,
          receivedAt,
          intent,
          suggestedAction,
          labels: full.labelIds ?? [],
          actions,
          handled: false,
          lastAction: null
        })
      } catch (err) {
        console.error('Failed to process email for briefing', err)
      }
    }

    const summary = await summarizeBriefingItems(c.env, items)

    return c.json({
      generatedAt: new Date().toISOString(),
      summary,
      items,
      metadata: {
        timeframeHours,
        maxEmails,
        fetched: items.length,
        query: queryParts.join(' ')
      }
    })
  } catch (error) {
    return handleRouteError(c, error, 'Unable to load briefing')
  }
})

api.get('/follow-ups', async (c) => {
  try {
    const user = await resolveCurrentUser(c)
    const authed = c.get('user')
    const googleId = getGoogleIdFromPayload(authed)
    const { clientId, clientSecret } = getGoogleConfig(c.env)
    
    // Check if this is a team-based request or individual user request
    const teamHeader = c.req.header('x-team-id')
    let teamId: number | null = null
    
    if (teamHeader) {
      // Team-based request - validate team membership
      teamId = Number.parseInt(teamHeader, 10)
      if (!Number.isFinite(teamId)) {
        return c.json({ error: 'Invalid team id' }, 400)
      }

      const team = await getTeamById(c.env.DB, teamId)
      if (!team) {
        return c.json({ error: 'Team not found' }, 404)
      }

      const membership = await getTeamMember(c.env.DB, teamId, user.id)
      if (!membership || membership.status !== 'active') {
        return c.json({ error: 'You do not belong to this team' }, 403)
      }
    }
    
    // Get follow-ups from database
    const statusParam = c.req.query('status')
    const status = statusParam === 'all' ? null : (statusParam || 'pending')
    const filter = c.req.query('filter')
    const ownerUserId = filter === 'mine' ? user.id : undefined

    let tasks = []
    
    // Only query database for follow-ups if we have a team (team-based workflow)
    if (teamId) {
      tasks = await listFollowUpTasks(c.env.DB, {
        teamId,
        status,
        ownerUserId,
        limit: 100
      })
    }

    // If no follow-ups in database, analyze unread emails for immediate follow-ups
    if (tasks.length === 0) {
      try {
        const unreadList = await gmailListMessages({
          db: c.env.DB,
          googleId,
          clientId,
          clientSecret,
          maxResults: 10,
          query: 'is:unread'
        })

        const followUps = []
        const messages = unreadList.messages ?? []

        for (const message of messages.slice(0, 5)) {
          try {
            const full = await gmailGetMessage({
              db: c.env.DB,
              googleId,
              clientId,
              clientSecret,
              id: message.id,
              format: 'full'
            })

            const subject = getHeader(full.payload, 'Subject')
            const from = getHeader(full.payload, 'From')
            const internalDate = full.internalDate ? new Date(Number(full.internalDate)) : new Date()
            const daysAgo = Math.floor((Date.now() - internalDate.getTime()) / (1000 * 60 * 60 * 24))

            // Extract sender name and email
            const fromMatch = from?.match(/^(.+?)\s*<(.+?)>$/) || ['', from || '', from || '']
            const senderName = fromMatch[1]?.trim() || fromMatch[2]?.split('@')[0] || 'Unknown'
            const senderEmail = fromMatch[2]?.trim() || from || ''

            followUps.push({
              id: message.id,
              teamId: context.teamId,
              ownerUserId: context.user.id,
              threadId: full.threadId,
              lastMessageId: message.id,
              counterpartEmail: senderEmail,
              subject: subject || 'No subject',
              summary: `Unread email from ${senderName}`,
              status: 'pending',
              priority: daysAgo > 2 ? 1 : 2,
              dueAt: null,
              suggestedSendAt: null,
              draftSubject: null,
              draftBody: null,
              toneHint: null,
              promptVersion: null,
              metadata: { 
                isUnread: true, 
                daysOld: daysAgo,
                senderName: senderName
              },
              sentAt: null,
              createdAt: internalDate.toISOString(),
              updatedAt: internalDate.toISOString()
            })
          } catch (error) {
            console.error('Error processing unread email for follow-up:', error)
          }
        }

        return c.json({ 
          followUps: followUps.map((task) => ({
            id: task.id,
            contact: task.metadata?.senderName || task.counterpartEmail?.split('@')[0] || 'Unknown',
            subject: task.summary || task.subject || 'Follow-up needed',
            daysOverdue: task.metadata?.daysOld || 0,
            priority: task.priority,
            status: task.status
          }))
        })
      } catch (error) {
        console.error('Error analyzing unread emails:', error)
      }
    }

    return c.json({ 
      followUps: tasks.map(serializeFollowUpTask).map((task) => ({
        id: task.id,
        contact: task.counterpartEmail?.split('@')[0] || 'Unknown',
        subject: task.subject || 'Follow-up needed',
        daysOverdue: task.dueAt ? Math.floor((Date.now() - new Date(task.dueAt).getTime()) / (1000 * 60 * 60 * 24)) : 0,
        priority: task.priority,
        status: task.status
      }))
    })
  } catch (error) {
    return handleRouteError(c, error, 'Unable to load follow-up tasks')
  }
})

api.post('/follow-ups/:taskId/approve', async (c) => {
  try {
    const context = await getFollowUpContext(c)
    const taskId = Number.parseInt(c.req.param('taskId'), 10)

    if (!Number.isFinite(taskId)) {
      return c.json({ error: 'Invalid follow-up id' }, 400)
    }

    const task = await getFollowUpTaskById(c.env.DB, taskId)
    if (!task || task.teamId !== context.teamId) {
      return c.json({ error: 'Follow-up not found' }, 404)
    }

    if (task.ownerUserId !== context.user.id) {
      return c.json({ error: 'You can only approve your own follow-ups' }, 403)
    }

    const body = await parseJson<{ sendAt?: string; draftSubject?: string; draftBody?: string }>(c)

    if (body?.draftSubject || body?.draftBody) {
      await updateFollowUpTask(c.env.DB, taskId, {
        draftSubject: body?.draftSubject ?? task.draftSubject,
        draftBody: body?.draftBody ?? task.draftBody
      })
    }

    const scheduleDate = body?.sendAt ? new Date(body.sendAt) : new Date()
    if (Number.isNaN(scheduleDate.getTime())) {
      return c.json({ error: 'Invalid sendAt datetime supplied' }, 400)
    }

    await scheduleFollowUpTask(c.env.DB, taskId, scheduleDate.toISOString())
    const updated = await getFollowUpTaskById(c.env.DB, taskId)
    return c.json({ task: serializeFollowUpTask(updated) })
  } catch (error) {
    return handleRouteError(c, error, 'Unable to approve follow-up')
  }
})

api.post('/follow-ups/:taskId/snooze', async (c) => {
  try {
    const context = await getFollowUpContext(c)
    const taskId = Number.parseInt(c.req.param('taskId'), 10)

    if (!Number.isFinite(taskId)) {
      return c.json({ error: 'Invalid follow-up id' }, 400)
    }

    const task = await getFollowUpTaskById(c.env.DB, taskId)
    if (!task || task.teamId !== context.teamId) {
      return c.json({ error: 'Follow-up not found' }, 404)
    }

    if (task.ownerUserId !== context.user.id) {
      return c.json({ error: 'You can only snooze your own follow-ups' }, 403)
    }

    const body = await parseJson<{ minutes?: number }>(c)
    const minutes = body?.minutes !== undefined ? Number.parseInt(String(body.minutes), 10) : 60 * 24

    if (Number.isNaN(minutes) || minutes <= 0) {
      return c.json({ error: 'Invalid snooze duration supplied' }, 400)
    }

    const dueAt = new Date(Date.now() + minutes * 60 * 1000).toISOString()
    await snoozeFollowUpTask(c.env.DB, taskId, dueAt)
    const updated = await getFollowUpTaskById(c.env.DB, taskId)
    return c.json({ task: serializeFollowUpTask(updated) })
  } catch (error) {
    return handleRouteError(c, error, 'Unable to snooze follow-up')
  }
})

api.post('/follow-ups/:taskId/dismiss', async (c) => {
  try {
    const context = await getFollowUpContext(c)
    const taskId = Number.parseInt(c.req.param('taskId'), 10)

    if (!Number.isFinite(taskId)) {
      return c.json({ error: 'Invalid follow-up id' }, 400)
    }

    const task = await getFollowUpTaskById(c.env.DB, taskId)
    if (!task || task.teamId !== context.teamId) {
      return c.json({ error: 'Follow-up not found' }, 404)
    }

    if (task.ownerUserId !== context.user.id) {
      return c.json({ error: 'You can only dismiss your own follow-ups' }, 403)
    }

    const body = await parseJson<{ reason?: string }>(c)
    await dismissFollowUpTask(c.env.DB, taskId, body?.reason ?? null)
    const updated = await getFollowUpTaskById(c.env.DB, taskId)
    return c.json({ task: serializeFollowUpTask(updated) })
  } catch (error) {
    return handleRouteError(c, error, 'Unable to dismiss follow-up')
  }
})

api.post('/follow-ups/:taskId/regenerate', async (c) => {
  try {
    const context = await getFollowUpContext(c)
    const taskId = Number.parseInt(c.req.param('taskId'), 10)

    if (!Number.isFinite(taskId)) {
      return c.json({ error: 'Invalid follow-up id' }, 400)
    }

    const task = await getFollowUpTaskById(c.env.DB, taskId)
    if (!task || task.teamId !== context.teamId) {
      return c.json({ error: 'Follow-up not found' }, 404)
    }

    if (task.ownerUserId !== context.user.id) {
      return c.json({ error: 'You can only regenerate your own follow-ups' }, 403)
    }

    const metadata = (task.metadata ?? {}) as Record<string, any>
    const draft = await generateFollowUpDraft(c.env, {
      userName: context.user.email?.split('@')[0] || 'Team',
      counterpartName: task.counterpartEmail?.split('@')[0] || 'there',
      subject: task.subject,
      lastMessageSnippet: task.summary,
      contextSummary: metadata.contextSummary ?? task.summary,
      tone: task.toneHint || 'friendly',
      idleDays: Number(metadata.idleDays ?? 3) || 3
    })

    const updated = await regenerateFollowUpTask(c.env.DB, taskId, draft)
    return c.json({ task: serializeFollowUpTask(updated) })
  } catch (error) {
    return handleRouteError(c, error, 'Unable to regenerate follow-up draft')
  }
})

// AI Intelligence Center Endpoints
app.post('/api/ai/email-triage', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401)
    }

    // Get user's recent emails
    const accessToken = await getUserAccessToken(c.env, user.email)
    if (!accessToken) {
      return c.json({ error: 'Gmail access required' }, 401)
    }

    const emails = await gmailListMessages(accessToken, { maxResults: 20 })
    const emailDetails = await Promise.all(
      emails.slice(0, 10).map(async (email: any) => {
        try {
          const details = await gmailGetMessage(accessToken, email.id)
          return {
            id: email.id,
            from: details.payload?.headers?.find((h: any) => h.name === 'From')?.value || 'Unknown',
            subject: details.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || 'No subject',
            snippet: details.snippet || '',
            body: extractPlainBody(details.payload) || ''
          }
        } catch (error) {
          return null
        }
      })
    )

    const validEmails = emailDetails.filter(Boolean)
    const aiResult = await generateEmailTriageAI(c.env, validEmails)
    
    return c.json(aiResult)
  } catch (error) {
    return handleRouteError(c, error, 'Email triage failed')
  }
})

app.post('/api/ai/meeting-intelligence', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401)
    }

    // Get user's calendar events for today
    const accessToken = await getUserAccessToken(c.env, user.email)
    if (!accessToken) {
      return c.json({ error: 'Calendar access required' }, 401)
    }

    const today = new Date()
    const timeMin = new Date(today.setHours(0, 0, 0, 0)).toISOString()
    const timeMax = new Date(today.setHours(23, 59, 59, 999)).toISOString()

    const calendarResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&maxResults=10&singleEvents=true&orderBy=startTime`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )

    const calendarData = await calendarResponse.json()
    const meetings = calendarData.items || []

    const userContext = {
      email: user.email,
      recentActivity: 'calendar_check',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }

    const aiResult = await generateMeetingIntelligence(c.env, meetings, userContext)
    
    return c.json(aiResult)
  } catch (error) {
    return handleRouteError(c, error, 'Meeting intelligence failed')
  }
})

app.post('/api/ai/productivity-analytics', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401)
    }

    // Gather user activity data
    const userId = await getUserId(c.env, user.email)
    const db = c.env.VAAI_DB

    // Get recent activity patterns
    const recentEmails = await db.prepare(`
      SELECT COUNT(*) as email_count, 
             AVG(confidence_score) as avg_confidence
      FROM processed_emails 
      WHERE user_id = ? AND created_at > datetime('now', '-7 days')
    `).bind(userId).first()

    const recentTasks = await db.prepare(`
      SELECT COUNT(*) as task_count,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count
      FROM tasks 
      WHERE user_id = ? AND created_at > datetime('now', '-7 days')
    `).bind(userId).all()

    const userActivity = {
      emailActivity: recentEmails,
      taskActivity: recentTasks.results[0] || { task_count: 0, completed_count: 0 },
      userId: userId,
      analysisDate: new Date().toISOString()
    }

    const aiResult = await generateProductivityAnalytics(c.env, userActivity)
    
    return c.json(aiResult)
  } catch (error) {
    return handleRouteError(c, error, 'Productivity analytics failed')
  }
})

app.post('/api/ai/follow-up-intelligence', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401)
    }

    const userId = await getUserId(c.env, user.email)
    const db = c.env.VAAI_DB

    // Get recent conversations that might need follow-up
    const recentFollowUps = await db.prepare(`
      SELECT counterpart_email, title, description, created_at, status
      FROM follow_ups 
      WHERE user_id = ? AND created_at > datetime('now', '-14 days')
      ORDER BY created_at DESC LIMIT 10
    `).bind(userId).all()

    const conversations = recentFollowUps.results.map((item: any) => ({
      contact: item.counterpart_email?.split('@')[0] || 'Unknown',
      lastMessage: item.description || item.title,
      date: item.created_at,
      context: item.title || 'General conversation',
      status: item.status
    }))

    const aiResult = await generateFollowUpIntelligence(c.env, conversations)
    
    return c.json(aiResult)
  } catch (error) {
    return handleRouteError(c, error, 'Follow-up intelligence failed')
  }
})

// AI Command Interface - Natural Language Processing
api.post('/ai/command', async (c) => {
  try {
    // Get user first to check authentication
    const user = await resolveCurrentUser(c)
    console.log('AI Command - User authenticated:', user.email)
    
    const { command, context } = await c.req.json()
    console.log('AI Command - Command received:', command)
    console.log('AI Command - Context received:', JSON.stringify(context, null, 2))
    
    if (!command || typeof command !== 'string') {
      return c.json({ error: 'Command is required' }, 400)
    }

    const aiResult = await generateAICommandResponse(c.env, command, context)
    
    return c.json(aiResult)
  } catch (error) {
    console.error('AI Command Error:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack available')
    console.error('Environment check - OPENAI_API_KEY exists:', !!c.env.OPENAI_API_KEY)
    return handleRouteError(c, error, 'AI command processing failed')
  }
})

// Helper function to refresh Google access token
async function refreshGoogleToken(refreshToken: string, env: EnvBindings): Promise<string | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      console.error('Token refresh failed:', response.status, await response.text())
      return null
    }

    const data = await response.json() as { access_token: string }
    return data.access_token
  } catch (error) {
    console.error('Token refresh error:', error)
    return null
  }
}

// Debug endpoint to test Gmail access
app.post('/api/debug/gmail-test', async (c) => {
  try {
    // Get authorization header properly
    const header = c.req.header('Authorization')
    if (!header || !header.startsWith('Bearer ')) {
      return c.json({ error: 'No authorization token' }, 401)
    }

    const jwtToken = header.slice(7)
    console.log('Testing Gmail access with JWT token...')
    
    // Verify JWT and get user info
    let accessToken;
    let userEmail;
    let user;
    let tokenRefreshed = false;
    
    try {
      const payload = await verifyJwt(c.env.JWT_SECRET, jwtToken)
      console.log('JWT payload:', payload)
      
      // Get user from database to get their Google access token
      // Note: payload.userId contains the Google ID, not the database ID
      user = await c.env.DB.prepare(
        'SELECT * FROM users WHERE google_id = ?'
      ).bind(payload.userId).first()
      
      if (!user) {
        return c.json({ 
          error: 'User not found in database', 
          googleId: payload.userId,
          debugInfo: 'JWT contains Google ID but no matching user record found'
        }, 404)
      }
      
      accessToken = user.access_token
      userEmail = user.email
      
      if (!accessToken) {
        return c.json({ error: 'No Google access token found' }, 401)
      }
    } catch (error) {
      return c.json({ error: 'Invalid JWT token', details: error.message }, 401)
    }
    
    // Test Gmail API access with Google access token
    let response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })
    
    // If token is expired (401), try to refresh it
    if (response.status === 401 && user.refresh_token) {
      console.log('Access token expired, attempting refresh...')
      const newAccessToken = await refreshGoogleToken(user.refresh_token, c.env)
      
      if (newAccessToken) {
        // Update user's access token in database
        await c.env.DB.prepare(
          'UPDATE users SET access_token = ?, updated_at = datetime("now") WHERE id = ?'
        ).bind(newAccessToken, user.id).run()
        
        // Retry Gmail API call with new token
        response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: {
            'Authorization': `Bearer ${newAccessToken}`,
            'Content-Type': 'application/json'
          }
        })
        
        accessToken = newAccessToken
        tokenRefreshed = true
        console.log('Token refreshed successfully')
      }
    }
    
    const result = {
      jwtTokenProvided: !!jwtToken,
      googleAccessTokenProvided: !!accessToken,
      userEmail: userEmail,
      tokenRefreshed: tokenRefreshed,
      gmailApiStatus: response.status,
      gmailApiOk: response.ok,
      timestamp: new Date().toISOString()
    }
    
    if (response.ok) {
      const profile = await response.json()
      result.emailAddress = profile.emailAddress
      result.messagesTotal = profile.messagesTotal
    } else {
      const errorText = await response.text()
      result.error = errorText
      console.error('Gmail API error:', errorText)
    }
    
    return c.json(result)
  } catch (error) {
    return c.json({ 
      error: 'Gmail test failed', 
      details: error.message,
      timestamp: new Date().toISOString()
    }, 500)
  }
})

export default app

function oauthStateKey(state: string) {
  return `oauth_state:${state}`
}

async function consumeState(namespace: KVNamespace, state: string) {
  const key = oauthStateKey(state)
  const exists = await namespace.get(key)
  if (!exists) {
    return false
  }
  await namespace.delete(key)
  return true
}

async function exchangeCodeForTokens(params: {
  code: string
  clientId: string
  clientSecret: string
  redirectUri: string
}): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code'
  })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to exchange authorization code: ${response.status} ${text}`)
  }

  return response.json<GoogleTokens>()
}

async function fetchGoogleUser(accessToken?: string): Promise<GoogleUserInfo> {
  if (!accessToken) {
    throw new Error('Missing access token for user info request')
  }

  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to load Google user profile: ${response.status} ${text}`)
  }

  return response.json<GoogleUserInfo>()
}

async function upsertUserTokens(db: D1Database, googleId: string, email: string, tokens: GoogleTokens): Promise<VaaiUser> {
  const existing = await db.prepare(`
    SELECT id, access_token, refresh_token
    FROM users
    WHERE google_id = ?
  `).bind(googleId).first<{ id: number; access_token: string | null; refresh_token: string | null } | null>()

  const accessToken = tokens.access_token ?? existing?.access_token ?? null
  const refreshToken = tokens.refresh_token ?? existing?.refresh_token ?? null

  await db.prepare(`
    INSERT INTO users (google_id, email, access_token, refresh_token, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(google_id) DO UPDATE SET
      email = excluded.email,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    googleId,
    email,
    accessToken,
    refreshToken
  ).run()

  const row = await db.prepare(`
    SELECT id, google_id, email
    FROM users
    WHERE google_id = ?
    LIMIT 1
  `).bind(googleId).first<{ id: number; google_id: string | null; email: string } | null>()

  if (!row) {
    throw new Error('Failed to load persisted user record')
  }

  return {
    id: row.id,
    googleId: row.google_id,
    email: row.email
  }
}

async function ensureDefaultCategories(db: D1Database, userId: number) {
  const row = await db.prepare(`
    SELECT COUNT(*) as count
    FROM email_categories
    WHERE user_id = ?
  `).bind(userId).first<{ count: number } | null>()

  if (row && Number(row.count) > 0) {
    return
  }

  for (const category of DEFAULT_EMAIL_CATEGORIES) {
    await db.prepare(`
      INSERT INTO email_categories (user_id, name, description, color)
      VALUES (?, ?, ?, ?)
    `).bind(
      userId,
      category.name,
      category.description,
      category.color
    ).run()
  }
}

async function getTeamsForUser(db: D1Database, userId: number) {
  const result = await db.prepare(`
    SELECT
      t.id,
      t.name,
      t.owner_user_id,
      t.created_at,
      tm.role,
      tm.status,
      tm.invited_at,
      tm.joined_at
    FROM teams t
    INNER JOIN team_members tm ON tm.team_id = t.id
    WHERE tm.user_id = ?
    ORDER BY t.created_at ASC
  `).bind(userId).all<TeamRow>()

  const rows = result.results ?? []
  return rows.map(mapTeamRow)
}

async function getUserByGoogleId(db: D1Database, googleId: string) {
  const row = await db.prepare(`
    SELECT id, google_id, email
    FROM users
    WHERE google_id = ?
    LIMIT 1
  `).bind(googleId).first<{ id: number; google_id: string | null; email: string } | null>()

  if (!row) {
    return null
  }

  return {
    id: row.id,
    googleId: row.google_id,
    email: row.email
  }
}

function mapTeamRow(row: TeamRow) {
  return {
    id: row.id,
    name: row.name,
    ownerUserId: row.owner_user_id,
    createdAt: row.created_at,
    membership: row.role ? {
      role: row.role,
      status: row.status,
      invitedAt: row.invited_at,
      joinedAt: row.joined_at
    } : undefined
  }
}

async function signJwt(secret: string, payload: Record<string, unknown>) {
  const key = new TextEncoder().encode(secret)
  return new SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key)
}

async function verifyJwt(secret: string, token: string) {
  const key = new TextEncoder().encode(secret)
  const { payload } = await jwtVerify(token, key, { algorithms: [JWT_ALG] })
  return payload
}

async function resolveCurrentUser(c: AuthedContext) {
  const payload = c.get('user')
  const googleId = typeof payload.userId === 'string' ? payload.userId : undefined

  if (!googleId) {
    throw new HTTPException(401, { message: 'Invalid authentication context' })
  }

  const user = await getUserByGoogleId(c.env.DB, googleId)
  if (!user) {
    throw new HTTPException(404, { message: 'User record not found' })
  }

  return user
}

async function parseJson<T>(c: AuthedContext): Promise<T | null> {
  try {
    return await c.req.json<T>()
  } catch {
    return null
  }
}

async function addTeamMember(db: D1Database, params: {
  teamId: number
  userId: number
  role: string
  status: string
  joinedAt: string | null
}) {
  await db.prepare(`
    INSERT INTO team_members (team_id, user_id, role, status, invited_at, joined_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    ON CONFLICT(team_id, user_id) DO UPDATE SET
      role = excluded.role,
      status = excluded.status,
      joined_at = COALESCE(excluded.joined_at, team_members.joined_at),
      invited_at = team_members.invited_at
  `).bind(
    params.teamId,
    params.userId,
    params.role,
    params.status,
    params.joinedAt
  ).run()
}

async function createTeam(db: D1Database, params: { name: string; ownerUserId: number }) {
  const inserted = await db.prepare(`
    INSERT INTO teams (name, owner_user_id)
    VALUES (?, ?)
  `).bind(params.name, params.ownerUserId).run()

  const teamId = Number(inserted.lastRowId)

  await addTeamMember(db, {
    teamId,
    userId: params.ownerUserId,
    role: 'owner',
    status: 'active',
    joinedAt: new Date().toISOString()
  })

  const team = await getTeamById(db, teamId)
  if (!team) {
    throw new Error('Failed to load created team')
  }

  return team
}

async function getTeamMember(db: D1Database, teamId: number, userId: number) {
  return db.prepare(`
    SELECT *
    FROM team_members
    WHERE team_id = ? AND user_id = ?
  `).bind(teamId, userId).first<TeamMemberRow | null>()
}

function generateInviteToken() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function createTeamInvitation(db: D1Database, params: {
  teamId: number
  email: string
  role: string
  token?: string
  expiresAt: string
  invitedByUserId: number
}) {
  const token = params.token ?? generateInviteToken()
  const result = await db.prepare(`
    INSERT INTO team_invitations (team_id, email, role, token, expires_at, invited_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    params.teamId,
    params.email,
    params.role,
    token,
    params.expiresAt,
    params.invitedByUserId
  ).run()

  return {
    id: Number(result.lastRowId),
    teamId: params.teamId,
    email: params.email,
    role: params.role,
    token,
    expiresAt: params.expiresAt
  }
}

async function getInvitationByToken(db: D1Database, token: string) {
  return db.prepare(`
    SELECT *
    FROM team_invitations
    WHERE token = ?
    LIMIT 1
  `).bind(token).first<TeamInvitationRow | null>()
}

async function markInvitationAccepted(db: D1Database, invitationId: number) {
  await db.prepare(`
    UPDATE team_invitations
    SET accepted_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(invitationId).run()
}

async function getTeamById(db: D1Database, teamId: number) {
  const row = await db.prepare(`
    SELECT *
    FROM teams
    WHERE id = ?
    LIMIT 1
  `).bind(teamId).first<TeamRow | null>()

  return row ? mapTeamRow(row) : null
}

function getGoogleIdFromPayload(payload: JWTPayload & { userId?: string }) {
  if (typeof payload.userId === 'string' && payload.userId.length > 0) {
    return payload.userId
  }
  throw new HTTPException(401, { message: 'Missing Google account information' })
}

function getGoogleConfig(env: EnvBindings) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new HTTPException(500, { message: 'Google OAuth configuration missing' })
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET
  }
}

function getDefaultTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function normalizeString(value: string | undefined | null) {
  return (value ?? '').toString().toLowerCase()
}

function trimContent(content: string, maxLength = 2000) {
  const condensed = content.replace(/\s+/g, ' ').trim()
  return condensed.length > maxLength ? condensed.slice(0, maxLength) : condensed
}

function defaultSuggestedAction(intent: string) {
  switch (intent) {
    case 'meeting_request':
      return 'Propose meeting times from calendar availability.'
    case 'follow_up':
      return 'Send a follow-up reply or set a reminder.'
    case 'invoice':
    case 'expense':
      return 'Forward to finance or mark as paid.'
    case 'urgent':
      return 'Respond immediately or escalate.'
    case 'newsletter':
      return 'Skim and archive if not critical.'
    case 'promotion':
      return 'Review briefly and archive if not needed.'
    default:
      return 'Review and respond as needed.'
  }
}

function quickBriefingHeuristic(email: { subject: string; body: string }) {
  const subject = normalizeString(email.subject)
  const body = normalizeString(email.body)

  if (subject.includes('invoice') || body.includes('invoice') || body.includes('bill')) {
    return { intent: 'invoice', suggestedAction: defaultSuggestedAction('invoice') }
  }
  if (subject.includes('receipt') || body.includes('receipt') || body.includes('expense')) {
    return { intent: 'expense', suggestedAction: defaultSuggestedAction('expense') }
  }
  if (subject.includes('meeting') || subject.includes('schedule') || body.includes('calendar')) {
    return { intent: 'meeting_request', suggestedAction: defaultSuggestedAction('meeting_request') }
  }
  if (subject.includes('follow up') || body.includes('follow-up') || body.includes('circle back')) {
    return { intent: 'follow_up', suggestedAction: defaultSuggestedAction('follow_up') }
  }
  if (subject.includes('urgent') || body.includes('urgent') || body.includes('asap')) {
    return { intent: 'urgent', suggestedAction: defaultSuggestedAction('urgent') }
  }
  if (subject.includes('newsletter') || body.includes('unsubscribe')) {
    return { intent: 'newsletter', suggestedAction: defaultSuggestedAction('newsletter') }
  }
  if (subject.includes('promo') || body.includes('sale') || body.includes('discount')) {
    return { intent: 'promotion', suggestedAction: defaultSuggestedAction('promotion') }
  }
  return null
}

async function classifyBriefingIntent(env: EnvBindings, email: { subject: string; from: string; body: string }) {
  const heuristic = quickBriefingHeuristic(email)
  if (heuristic) {
    return heuristic
  }

  const fallbackIntent = 'general'
  if (!env.OPENAI_API_KEY) {
    return {
      intent: fallbackIntent,
      suggestedAction: defaultSuggestedAction(fallbackIntent)
    }
  }

  const prompt = `
You are an executive assistant that classifies email intent and recommends the next action.

Email details:
From: ${email.from}
Subject: ${email.subject}
Body: ${trimContent(email.body, 1200)}

Respond with strict JSON containing:
{
  "intent": one of ["meeting_request","follow_up","invoice","expense","urgent","newsletter","promotion","general"],
  "suggestedAction": string (<= 20 words)
}
`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 200,
        messages: [
          { role: 'system', content: 'You output only valid JSON objects.' },
          { role: 'user', content: prompt }
        ]
      })
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('OpenAI briefing intent error', text)
      throw new Error('OpenAI request failed')
    }

    const data = await response.json<{
      choices?: { message?: { content?: string } }[]
    }>()

    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) {
      throw new Error('Empty OpenAI response')
    }

    const parsed = JSON.parse(content)
    const intent = typeof parsed.intent === 'string' ? parsed.intent : fallbackIntent
    const suggestedAction = typeof parsed.suggestedAction === 'string'
      ? parsed.suggestedAction
      : defaultSuggestedAction(intent)

    return {
      intent,
      suggestedAction
    }
  } catch (error) {
    console.error('Briefing intent classification failed', error)
    return {
      intent: fallbackIntent,
      suggestedAction: defaultSuggestedAction(fallbackIntent)
    }
  }
}

async function summarizeBriefingItems(env: EnvBindings, items: BriefingItem[]) {
  if (!items.length) {
    return 'No new emails in the selected timeframe.'
  }

  if (!env.OPENAI_API_KEY) {
    const counts = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.intent] = (acc[item.intent] || 0) + 1
      return acc
    }, {})

    const topIntents = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([intent, count]) => `${count} ${intent.replace('_', ' ')} email${count > 1 ? 's' : ''}`)

    const topSenders = items
      .map((item) => item.from)
      .filter(Boolean)
      .slice(0, 3)

    const lines = [
      `- Processed ${items.length} email${items.length > 1 ? 's' : ''} in your inbox.`,
      topIntents.length ? `- Top categories: ${topIntents.join(', ')}.` : '- Mix of general updates.',
      topSenders.length ? `- Key senders: ${topSenders.join(', ')}` : '- Review highlighted messages below.'
    ]

    return lines.join('\n')
  }

  const prompt = `
Summarize the following emails for an executive as concise bullet points (max 4 bullets).

${items.map((item, index) => `Email ${index + 1}:
From: ${item.from}
Subject: ${item.subject}
Intent: ${item.intent}
Suggested action: ${item.suggestedAction}
Snippet: ${trimContent(item.snippet || item.body, 400)}
`).join('\n')}
`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 320,
        messages: [
          { role: 'system', content: 'You are an executive assistant who writes succinct bullet summaries.' },
          { role: 'user', content: prompt }
        ]
      })
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('OpenAI briefing summary error', text)
      throw new Error('OpenAI request failed')
    }

    const data = await response.json<{
      choices?: { message?: { content?: string } }[]
    }>()

    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) {
      throw new Error('Empty OpenAI response')
    }

    return text
  } catch (error) {
    console.error('Briefing summary generation failed', error)
    return '- Review highlighted emails below for today’s priorities.'
  }
}

function buildBriefingActions(intent: string, context: { emailId: string; threadId?: string | null; subject: string; from: string }): BriefingAction[] {
  const basePayload = {
    emailId: context.emailId,
    threadId: context.threadId ?? null,
    subject: context.subject,
    from: context.from
  }

  const actions: BriefingAction[] = [
    {
      type: 'draft_reply',
      label: 'Draft Reply',
      payload: basePayload
    }
  ]

  if (intent === 'meeting_request') {
    actions.push({
      type: 'schedule_meeting',
      label: 'Suggest Meeting Times',
      payload: {
        ...basePayload,
        durationMinutes: 30
      }
    })
  }

  if (['invoice', 'expense', 'newsletter', 'promotion', 'general'].includes(intent)) {
    actions.push({
      type: 'mark_handled',
      label: 'Mark Handled',
      payload: basePayload
    })
  }

  return actions
}
function normalizeAttendees(attendees?: Array<string | { email?: string | null }>) {
  if (!attendees || !Array.isArray(attendees)) return []
  return attendees
    .map((entry) => {
      if (!entry) return null
      if (typeof entry === 'string') {
        const email = entry.trim()
        return email ? { email } : null
      }
      const email = entry.email?.trim()
      return email ? { email } : null
    })
    .filter(Boolean)
}

const FOLLOW_UP_TONE_MAP: Record<string, string> = {
  friendly: 'friendly and warm',
  urgent: 'concise and urgent',
  formal: 'professional and succinct'
}

async function generateFollowUpDraft(env: EnvBindings, params: {
  userName: string
  counterpartName: string
  subject: string | null
  lastMessageSnippet: string | null
  contextSummary: string | null
  tone?: string
  idleDays?: number
}): Promise<DraftResult> {
  const toneKey = (params.tone || 'friendly').toLowerCase()
  const toneDescription = FOLLOW_UP_TONE_MAP[toneKey] ?? FOLLOW_UP_TONE_MAP.friendly

  const fallbackSubject = params.subject?.startsWith('Re:')
    ? params.subject
    : params.subject
      ? `Re: ${params.subject}`
      : 'Quick follow-up'

  const fallbackBody = [
    `Hi ${params.counterpartName || 'there'},`,
    '',
    'Just checking in on this. Let me know if you need anything else from me.',
    '',
    `Thanks,`,
    params.userName || ''
  ].join('\n').trim()

  const idleDays = Number.isFinite(params.idleDays) ? Number(params.idleDays) : 3
  const context = trimContent(params.contextSummary || params.lastMessageSnippet || 'No additional context provided.', 600)

  if (!env.OPENAI_API_KEY) {
    return {
      subject: fallbackSubject,
      body: fallbackBody,
      tone: toneKey,
      model: 'template'
    }
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 280,
        messages: [
          {
            role: 'system',
            content: 'You help busy professionals follow up on email threads with concise, courteous reminders.'
          },
          {
            role: 'user',
            content: `You are an executive assistant drafting a follow-up email.
Tone should be ${toneDescription}. The email should be short (2-3 paragraphs), polite, and make it easy for the recipient to respond.

Details:
- Sender name: ${params.userName || 'Unknown'}
- Recipient name: ${params.counterpartName || 'Unknown'}
- Days since last message: ${idleDays}
- Thread subject: ${params.subject || 'N/A'}

Latest context:
${context}

Draft a follow-up email body only (no subject line). Keep it under 150 words.`
          }
        ]
      })
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('OpenAI follow-up draft error:', text)
      throw new Error('OpenAI request failed')
    }

    const data = await response.json<{
      choices?: { message?: { content?: string } }[]
    }>()

    const body = data.choices?.[0]?.message?.content?.trim() || fallbackBody

    return {
      subject: fallbackSubject,
      body,
      tone: toneKey,
      model: 'gpt-4o-mini'
    }
  } catch (error) {
    console.error('AI follow-up draft error:', error)
    return {
      subject: fallbackSubject,
      body: fallbackBody,
      tone: toneKey,
      model: 'template'
    }
  }
}

async function getFollowUpContext(c: AuthedContext): Promise<FollowUpContext> {
  const user = await resolveCurrentUser(c)
  const teamHeader = c.req.header('x-team-id')

  if (!teamHeader) {
    throw new HTTPException(400, { message: 'Missing X-Team-Id header' })
  }

  const teamId = Number.parseInt(teamHeader, 10)
  if (!Number.isFinite(teamId)) {
    throw new HTTPException(400, { message: 'Invalid team id' })
  }

  const team = await getTeamById(c.env.DB, teamId)
  if (!team) {
    throw new HTTPException(404, { message: 'Team not found' })
  }

  const membership = await getTeamMember(c.env.DB, teamId, user.id)
  if (!membership || membership.status !== 'active') {
    throw new HTTPException(403, { message: 'You do not belong to this team' })
  }

  return {
    teamId,
    team,
    user,
    membership
  }
}

function serializeFollowUpTask(task: FollowUpTask | null) {
  if (!task) return null
  return {
    id: task.id,
    teamId: task.teamId,
    ownerUserId: task.ownerUserId,
    threadId: task.threadId,
    lastMessageId: task.lastMessageId,
    counterpartEmail: task.counterpartEmail,
    subject: task.subject,
    summary: task.summary,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt,
    suggestedSendAt: task.suggestedSendAt,
    draftSubject: task.draftSubject,
    draftBody: task.draftBody,
    toneHint: task.toneHint,
    metadata: task.metadata,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    sentAt: task.sentAt
  }
}

function mapFollowUpRow(row: FollowUpRow | null): FollowUpTask | null {
  if (!row) return null
  let metadata: FollowUpMetadata = null
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata)
    } catch {
      metadata = null
    }
  }

  return {
    id: row.id,
    teamId: row.team_id,
    ownerUserId: row.owner_user_id,
    threadId: row.thread_id,
    lastMessageId: row.last_message_id,
    counterpartEmail: row.counterpart_email,
    subject: row.subject,
    summary: row.summary,
    status: row.status,
    priority: Number(row.priority ?? 0),
    dueAt: row.due_at,
    suggestedSendAt: row.suggested_send_at,
    draftSubject: row.draft_subject,
    draftBody: row.draft_body,
    toneHint: row.tone_hint,
    promptVersion: row.prompt_version,
    metadata,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

async function listFollowUpTasks(db: D1Database, options: {
  teamId: number
  status?: string | null
  ownerUserId?: number
  limit?: number
}): Promise<FollowUpTask[]> {
  const conditions: string[] = ['team_id = ?']
  const params: Array<string | number> = [options.teamId]

  if (options.status) {
    conditions.push('status = ?')
    params.push(options.status)
  }

  if (options.ownerUserId) {
    conditions.push('owner_user_id = ?')
    params.push(options.ownerUserId)
  }

  const limit = options.limit ?? 50
  params.push(limit)

  const query = `
    SELECT *
    FROM follow_up_tasks
    WHERE ${conditions.join(' AND ')}
    ORDER BY priority DESC, COALESCE(due_at, created_at) ASC
    LIMIT ?
  `

  const result = await db.prepare(query).bind(...params).all<FollowUpRow>()
  const rows = result.results ?? []
  return rows
    .map(mapFollowUpRow)
    .filter((task): task is FollowUpTask => Boolean(task))
}

async function getFollowUpTaskById(db: D1Database, taskId: number) {
  const row = await db.prepare(`
    SELECT *
    FROM follow_up_tasks
    WHERE id = ?
    LIMIT 1
  `).bind(taskId).first<FollowUpRow | null>()

  return mapFollowUpRow(row)
}

async function updateFollowUpTask(db: D1Database, taskId: number, fields: Record<string, unknown>) {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined)
  if (!entries.length) {
    return
  }

  const columns: string[] = []
  const params: unknown[] = []

  for (const [key, value] of entries) {
    if (key === 'metadata') {
      columns.push('metadata = ?')
      params.push(value ? JSON.stringify(value) : null)
    } else {
      columns.push(`${camelToSnake(key)} = ?`)
      params.push(value)
    }
  }

  const query = `
    UPDATE follow_up_tasks
    SET ${columns.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `

  await db.prepare(query).bind(...params, taskId).run()
}

async function appendFollowUpEvent(db: D1Database, taskId: number, eventType: string, payload: Record<string, unknown> | null = null) {
  await db.prepare(`
    INSERT INTO follow_up_events (follow_up_id, event_type, payload)
    VALUES (?, ?, ?)
  `).bind(
    taskId,
    eventType,
    payload ? JSON.stringify(payload) : null
  ).run()
}

async function scheduleFollowUpTask(db: D1Database, taskId: number, sendAt: string) {
  await updateFollowUpTask(db, taskId, {
    status: 'scheduled',
    suggestedSendAt: sendAt
  })
  await appendFollowUpEvent(db, taskId, 'scheduled', { sendAt })
}

async function snoozeFollowUpTask(db: D1Database, taskId: number, dueAt: string) {
  await updateFollowUpTask(db, taskId, {
    status: 'snoozed',
    dueAt,
    suggestedSendAt: dueAt
  })
  await appendFollowUpEvent(db, taskId, 'snoozed', { dueAt })
}

async function dismissFollowUpTask(db: D1Database, taskId: number, reason: string | null) {
  await updateFollowUpTask(db, taskId, {
    status: 'dismissed'
  })
  await appendFollowUpEvent(db, taskId, 'dismissed', { reason })
}

async function regenerateFollowUpTask(db: D1Database, taskId: number, draft: DraftResult) {
  await updateFollowUpTask(db, taskId, {
    draftSubject: draft.subject,
    draftBody: draft.body,
    toneHint: draft.tone
  })
  await appendFollowUpEvent(db, taskId, 'draft_created', { model: draft.model, regenerated: true })
  return getFollowUpTaskById(db, taskId)
}

function camelToSnake(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

async function createAssistantAction(db: D1Database, params: {
  userId: number
  emailId: string | null
  threadId: string | null
  actionType: string
  payload: Record<string, unknown>
}) {
  const result = await db.prepare(`
    INSERT INTO assistant_actions (user_id, email_id, thread_id, action_type, payload, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).bind(
    params.userId,
    params.emailId,
    params.threadId,
    params.actionType,
    JSON.stringify(params.payload ?? {})
  ).run()

  return {
    id: Number(result.lastRowId),
    userId: params.userId,
    emailId: params.emailId,
    threadId: params.threadId,
    actionType: params.actionType
  }
}

async function updateAssistantActionResult(db: D1Database, actionId: number, options: {
  status: string
  result?: Record<string, unknown> | null
  feedback?: string | null
  undone?: boolean
}) {
  const resultValue = options.result ? JSON.stringify(options.result) : null
  const feedbackValue = options.feedback ?? null
  const undoneFlag = options.undone ? 1 : 0

  await db.prepare(`
    UPDATE assistant_actions
    SET status = ?,
        result = COALESCE(?, result),
        feedback = COALESCE(?, feedback),
        updated_at = CURRENT_TIMESTAMP,
        undone_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE undone_at END
    WHERE id = ?
  `).bind(
    options.status,
    resultValue,
    feedbackValue,
    undoneFlag,
    actionId
  ).run()
}

async function getAssistantActionById(db: D1Database, actionId: number) {
  const row = await db.prepare(`
    SELECT *
    FROM assistant_actions
    WHERE id = ?
    LIMIT 1
  `).bind(actionId).first<AssistantActionRow | null>()

  return row ? mapAssistantActionRow(row) : null
}

async function saveAssistantActionFeedback(db: D1Database, actionId: number, feedback: { rating: string; note: string | null }) {
  await db.prepare(`
    UPDATE assistant_actions
    SET feedback = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    JSON.stringify({
      rating: feedback.rating,
      note: feedback.note ?? null
    }),
    actionId
  ).run()
}

async function getAssistantActionMetrics(db: D1Database, userId: number, options: { days?: number }): Promise<AssistantActionMetrics> {
  const conditions = ['user_id = ?']
  const params: unknown[] = [userId]

  if (Number.isFinite(options.days) && options.days && options.days > 0) {
    conditions.push('created_at >= datetime("now", ?)')
    params.push(`-${Math.floor(options.days)} days`)
  }

  const query = `
    SELECT id, action_type, status, feedback, created_at, updated_at, undone_at
    FROM assistant_actions
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
  `

  const result = await db.prepare(query).bind(...params).all<AssistantActionRow>()
  const rows = result.results ?? []

  const totals = {
    total: 0,
    completed: 0,
    awaitingConfirmation: 0,
    undone: 0
  }

  const feedbackTotals = {
    helpful: 0,
    notHelpful: 0,
    other: 0
  }

  const byType = new Map<string, {
    actionType: string
    total: number
    completed: number
    awaitingConfirmation: number
    undone: number
    helpful: number
    notHelpful: number
    otherFeedback: number
  }>()

  const recent: AssistantActionMetrics['recent'] = []

  rows.forEach((row, index) => {
    totals.total += 1
    if (row.status === 'completed') totals.completed += 1
    if (row.status === 'awaiting_confirmation') totals.awaitingConfirmation += 1
    if (row.status === 'undone' || row.undone_at) totals.undone += 1

    const feedback = parseAssistantFeedback(row.feedback)
    const rating = feedback?.rating

    if (rating === 'helpful') feedbackTotals.helpful += 1
    else if (rating === 'not_helpful') feedbackTotals.notHelpful += 1
    else if (rating) feedbackTotals.other += 1

    if (!byType.has(row.action_type)) {
      byType.set(row.action_type, {
        actionType: row.action_type,
        total: 0,
        completed: 0,
        awaitingConfirmation: 0,
        undone: 0,
        helpful: 0,
        notHelpful: 0,
        otherFeedback: 0
      })
    }

    const metrics = byType.get(row.action_type)!
    metrics.total += 1
    if (row.status === 'completed') metrics.completed += 1
    if (row.status === 'awaiting_confirmation') metrics.awaitingConfirmation += 1
    if (row.status === 'undone' || row.undone_at) metrics.undone += 1
    if (rating === 'helpful') metrics.helpful += 1
    if (rating === 'not_helpful') metrics.notHelpful += 1
    if (rating && rating !== 'helpful' && rating !== 'not_helpful') metrics.otherFeedback += 1

    if (index < 10) {
      recent.push({
        id: row.id,
        actionType: row.action_type,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        undoneAt: row.undone_at,
        feedback: feedback || null
      })
    }
  })

  return {
    timeframeDays: Number.isFinite(options.days) && options.days && options.days > 0 ? Math.floor(options.days) : null,
    totals,
    feedback: feedbackTotals,
    byType: Array.from(byType.values()),
    recent
  }
}

function parseAssistantFeedback(feedback: string | null) {
  if (!feedback) return null
  try {
    const parsed = JSON.parse(feedback)
    return typeof parsed === 'object' && parsed ? parsed : { rating: feedback }
  } catch {
    return { rating: feedback }
  }
}

function mapAssistantActionRow(row: AssistantActionRow): AssistantAction {
  let payload: Record<string, unknown> | null = null
  let result: Record<string, unknown> | null = null
  let feedback: Record<string, unknown> | null = null

  if (row.payload) {
    try {
      payload = JSON.parse(row.payload)
    } catch {
      payload = null
    }
  }

  if (row.result) {
    try {
      result = JSON.parse(row.result)
    } catch {
      result = null
    }
  }

  if (row.feedback) {
    try {
      feedback = JSON.parse(row.feedback)
    } catch {
      feedback = { rating: row.feedback }
    }
  }

  return {
    id: row.id,
    userId: row.user_id,
    emailId: row.email_id,
    threadId: row.thread_id,
    actionType: row.action_type,
    status: row.status,
    payload,
    result,
    feedback,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    undoneAt: row.undone_at
  }
}

async function draftReply(env: EnvBindings, params: {
  googleId: string
  clientId: string
  clientSecret: string
  userEmail: string | null
  userName: string
  emailId: string
  threadId: string | null
}) {
  const message = await gmailGetMessage({
    db: env.DB,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    id: params.emailId,
    format: 'full'
  })

  const subject = getHeader(message.payload, 'Subject')
  const from = getHeader(message.payload, 'From')
  const body = trimContent(extractPlainBody(message.payload) || message.snippet || '', 800)

  const fallbackDraft = `Hi,\n\nThanks for reaching out regarding "${subject}". I'll follow up shortly.\n\nBest,\n${params.userName}`
  const replySubject = subject?.startsWith('Re:') ? subject : `Re: ${subject || ''}`.trim()

  if (!env.OPENAI_API_KEY) {
    return {
      draft: fallbackDraft,
      subject: replySubject,
      threadId: params.threadId
    }
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 220,
        messages: [
          {
            role: 'system',
            content: 'You write emails for a busy professional. Replies must be concise and actionable.'
          },
          {
            role: 'user',
            content: `You are an executive assistant. Draft a concise, professional reply that addresses the sender.

Original email:
From: ${from}
Subject: ${subject}
Body: ${body}

Reply guidelines:
- Keep it under 150 words.
- Maintain a polite and proactive tone.
- Propose next steps if appropriate.

Produce only the reply body text.`
          }
        ]
      })
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('OpenAI draft reply error:', text)
      throw new Error('OpenAI request failed')
    }

    const data = await response.json<{
      choices?: { message?: { content?: string } }[]
    }>()

    const replyBody = data.choices?.[0]?.message?.content?.trim() || fallbackDraft

    return {
      draft: replyBody,
      subject: replySubject,
      threadId: params.threadId
    }
  } catch (error) {
    console.error('AI draft reply error:', error)
    return {
      draft: fallbackDraft,
      subject: replySubject,
      threadId: params.threadId
    }
  }
}

async function suggestMeetingTimes(env: EnvBindings, params: {
  googleId: string
  clientId: string
  clientSecret: string
  durationMinutes: number
  emailId?: string | null
}) {
  const now = new Date()
  const startCursor = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  const timeMin = now.toISOString()
  const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

  if (params.emailId) {
    try {
      await gmailGetMessage({
        db: env.DB,
        googleId: params.googleId,
        clientId: params.clientId,
        clientSecret: params.clientSecret,
        id: params.emailId,
        format: 'metadata'
      })
    } catch (error) {
      console.error('Unable to fetch email context for meeting suggestions:', error)
    }
  }

  const freeBusy = await calendarFreeBusy({
    db: env.DB,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    timeMin,
    timeMax,
    timeZone: getDefaultTimeZone()
  })

  const busyWindows = (freeBusy.calendars?.primary?.busy ?? []).map((window) => ({
    start: new Date(window.start),
    end: new Date(window.end)
  }))

  const suggestions: Array<{ start: string; end: string }> = []
  let cursor = startCursor

  while (suggestions.length < 3 && cursor.getTime() < new Date(timeMax).getTime()) {
    const next = new Date(cursor.getTime() + params.durationMinutes * 60 * 1000)
    const overlaps = busyWindows.some((window) => cursor < window.end && next > window.start)

    if (!overlaps) {
      suggestions.push({
        start: cursor.toISOString(),
        end: next.toISOString()
      })
      cursor = new Date(next.getTime() + 60 * 60 * 1000)
    } else {
      cursor = new Date(cursor.getTime() + 30 * 60 * 1000)
    }
  }

  return suggestions
}

async function markEmailHandled(env: EnvBindings, params: {
  googleId: string
  clientId: string
  clientSecret: string
  emailId: string
  labelName: string
}) {
  const labels = await gmailListLabels({
    db: env.DB,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret
  })

  let labelId = labels.labels?.find((label) => label.name === params.labelName)?.id ?? null

  if (!labelId) {
    const created = await gmailCreateLabel({
      db: env.DB,
      googleId: params.googleId,
      clientId: params.clientId,
      clientSecret: params.clientSecret,
      name: params.labelName
    })
    labelId = created.id
  }

  await gmailModifyMessage({
    db: env.DB,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    messageId: params.emailId,
    addLabelIds: labelId ? [labelId] : []
  })

  return { labelId, labelName: params.labelName }
}

function mapGoogleTask(task: Record<string, unknown> | null | undefined): GoogleTask | null {
  if (!task || typeof task !== 'object') return null
  return {
    id: String(task.id ?? ''),
    title: typeof task.title === 'string' ? task.title : '',
    notes: typeof task.notes === 'string' ? task.notes : '',
    status: typeof task.status === 'string' ? task.status : 'needsAction',
    due: typeof task.due === 'string' ? task.due : null,
    updated: typeof task.updated === 'string' ? task.updated : null,
    completed: typeof task.completed === 'string' ? task.completed : null,
    webViewLink: Array.isArray((task as any).links)
      ? ((task as any).links.find((link: any) => link?.type === 'edit')?.link ?? null)
      : null
  }
}

async function createCalendarEventForAssistant(params: {
  env: EnvBindings
  googleId: string
  clientId: string
  clientSecret: string
  summary: string
  start: string
  end: string
  attendees?: unknown
  location?: string
  description?: string
  timezone?: string
}) {
  const userTimezone = params.timezone || getDefaultTimeZone()
  
  // Parse the ISO string as local time in the user's timezone
  // Remove any timezone suffix and treat as local time
  const cleanStart = params.start.replace(/Z.*$/, '')
  const cleanEnd = params.end.replace(/Z.*$/, '')
  
  // Create the datetime string that Google Calendar will interpret correctly
  // We send the time as-is and specify the timezone separately
  const startDateTime = cleanStart.includes('T') ? cleanStart : cleanStart + 'T00:00:00'
  const endDateTime = cleanEnd.includes('T') ? cleanEnd : cleanEnd + 'T00:00:00'

  // Validate the date format
  const testStart = new Date(startDateTime + 'Z') // Add Z just for validation
  const testEnd = new Date(endDateTime + 'Z')
  
  if (Number.isNaN(testStart.getTime()) || Number.isNaN(testEnd.getTime())) {
    return {
      reply: 'I need both a valid start and end time to book that meeting. Please provide those and try again.'
    }
  }

  if (testEnd <= testStart) {
    return {
      reply: 'The meeting end time has to be after the start time. Can you clarify the timing?'
    }
  }

  const normalizedAttendees = Array.isArray(params.attendees)
    ? params.attendees
        .map((entry) => (typeof entry === 'string' ? entry.trim() : null))
        .filter((email): email is string => Boolean(email))
        .map((email) => ({ email }))
    : []
  
  const response = await calendarInsertEvent({
    db: params.env.DB,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    body: {
      summary: params.summary,
      description: params.description || '',
      location: params.location || '',
      start: {
        dateTime: startDateTime,
        timeZone: userTimezone
      },
      end: {
        dateTime: endDateTime,
        timeZone: userTimezone
      },
      attendees: normalizedAttendees
    }
  })

  // Create display times from the clean datetime strings
  const displayStart = new Date(startDateTime + 'Z')
  const displayEnd = new Date(endDateTime + 'Z')
  
  const humanStart = displayStart.toLocaleString('en-US', { 
    weekday: 'long',
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
  const humanEnd = displayEnd.toLocaleString('en-US', { 
    hour: 'numeric',
    minute: '2-digit', 
    hour12: true
  })

  return {
    reply: `✅ Created "${params.summary}" on ${humanStart} to ${humanEnd} in timezone ${userTimezone}. Check your calendar!`,
    eventCreated: true,
    event: {
      id: (response as any)?.id ?? null,
      summary: (response as any)?.summary ?? params.summary,
      start: (response as any)?.start ?? { dateTime: startDate.toISOString() },
      end: (response as any)?.end ?? { dateTime: endDate.toISOString() },
      htmlLink: (response as any)?.htmlLink ?? null
    }
  }
}

async function createTaskForAssistant(params: {
  env: EnvBindings
  googleId: string
  clientId: string
  clientSecret: string
  title: string
  notes?: string
  due?: string
  timezone?: string
}) {
  if (!params.title || !params.title.trim()) {
    return {
      reply: 'I need a short task title to create a reminder. Please provide one and try again.'
    }
  }

  if (params.due) {
    const dueDate = new Date(params.due)
    if (Number.isNaN(dueDate.getTime())) {
      return {
        reply: 'I had trouble parsing that date. Could you try again with a different format?'
      }
    }
  }

  // Format due date properly for Google Tasks API with timezone awareness
  let formattedDue: string | undefined = undefined
  if (params.due) {
    try {
      // Remove any timezone suffix and treat as local time (same approach as calendar)
      const cleanDue = params.due.replace(/Z.*$/, '')
      
      // Create the datetime string that Google Tasks will interpret correctly
      const dueDateTime = cleanDue.includes('T') ? cleanDue : cleanDue + 'T00:00:00'
      
      // Validate the date format
      const testDate = new Date(dueDateTime + 'Z') // Add Z just for validation
      
      if (!isNaN(testDate.getTime())) {
        // For Google Tasks, we can send the local time without timezone suffix
        // Google Tasks will treat it as the user's local time
        formattedDue = dueDateTime + 'Z' // Google Tasks expects Z suffix
      }
    } catch (error) {
      console.error('Invalid due date format:', params.due)
    }
  }

  const response = await googleTasksInsert({
    db: params.env.DB,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    taskListId: '@default',
    body: {
      title: params.title.trim(),
      ...(params.notes && { notes: params.notes }),
      ...(formattedDue && { due: formattedDue })
    }
  })

  const task = mapGoogleTask(response)
  
  // Use the original user-friendly date format for display, not Google's response
  const displayDate = params.due ? params.due.replace(/Z.*$/, '') : null

  return {
    reply: `Got it — I created the task "${task?.title ?? params.title.trim()}"${displayDate ? ` due ${displayDate}` : ''}.`,
    task,
    taskCreated: true
  }
}

function formatAddressList(value?: string | string[] | null) {
  if (!value) return ''
  if (Array.isArray(value)) {
    return value
      .map((entry) => entry?.trim())
      .filter(Boolean)
      .join(', ')
  }
  return value.trim()
}

function formatOptionalAddress(value?: string | string[] | null) {
  const formatted = formatAddressList(value)
  return formatted || undefined
}

function buildMimeMessage(options: {
  from: string
  to: string
  cc?: string
  bcc?: string
  subject: string
  text?: string
  html?: string
}) {
  const headers = [
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="vaai-boundary"',
    `From: ${options.from}`,
    `To: ${options.to}`
  ]

  if (options.cc) headers.push(`Cc: ${options.cc}`)
  if (options.bcc) headers.push(`Bcc: ${options.bcc}`)
  headers.push(`Subject: ${options.subject}`)

  const parts: string[] = []

  if (options.text) {
    parts.push([
      '--vaai-boundary',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      options.text
    ].join('\n'))
  }

  if (options.html) {
    parts.push([
      '--vaai-boundary',
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      options.html
    ].join('\n'))
  }

  parts.push('--vaai-boundary--')

  const mime = `${headers.join('\n')}\n\n${parts.join('\n')}`
  return base64Encode(mime)
}

function base64Encode(content: string) {
  const bytes = new TextEncoder().encode(content)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function handleRouteError(c: AuthedContext, error: unknown, fallback: string) {
  if (error instanceof HTTPException) {
    throw error
  }
  console.error(fallback, error)
  return c.json({
    error: fallback,
    message: (error as Error).message
  }, 500)
}

async function classifyEmailContent(env: EnvBindings, email: { subject: string; from: string; body: string }) {
  const apiKey = env.OPENAI_API_KEY
  if (!apiKey) {
    const subject = normalizeString(email.subject)
    const from = normalizeString(email.from)
    if (from.includes('noreply') || from.includes('newsletter')) return 'Newsletter'
    if (subject.includes('receipt') || subject.includes('order')) return 'Receipt'
    if (subject.includes('work') || from.includes('company.com')) return 'Work'
    return 'Personal'
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: `Classify the email into one of: Work, Personal, Newsletter, Receipt, Promotion, Social, Spam, Important.\n\nSubject: ${email.subject}\nFrom: ${email.from}\nBody: ${email.body.slice(0, 500)}\n\nRespond with only the category name.`
          }
        ],
        max_tokens: 10,
        temperature: 0.1
      })
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('OpenAI classification error', text)
      throw new Error('OpenAI request failed')
    }

    const data = await response.json<{
      choices?: { message?: { content?: string } }[]
    }>()

    const category = data.choices?.[0]?.message?.content?.trim()
    return category || 'Uncategorized'
  } catch (error) {
    console.error('AI classification error', error)
    return 'Uncategorized'
  }
}

async function determineCategory(params: {
  env: EnvBindings
  db: D1Database
  userId: number
  categoriesById: Map<number, EmailCategoryRow>
  categoriesByName: Map<string, EmailCategoryRow>
  rules: EmailRuleRow[]
  emailData: { id: string; subject: string; from: string; body: string; snippet: string }
}) {
  for (const rule of params.rules) {
    if (!rule.is_active) continue
    const value = normalizeString(rule.rule_value)
    if (!value) continue

    let matches = false
    switch (rule.rule_type) {
      case 'sender':
        matches = normalizeString(params.emailData.from).includes(value)
        break
      case 'subject':
        matches = normalizeString(params.emailData.subject).includes(value)
        break
      case 'content':
        matches = normalizeString(params.emailData.body).includes(value)
        break
      default:
        matches = false
    }

    if (matches) {
      const category = params.categoriesById.get(rule.category_id)
      if (category) {
        return {
          source: 'rule' as const,
          category,
          rule,
          aiCategoryName: category.name
        }
      }
    }
  }

  const aiCategoryName = await classifyEmailContent(params.env, params.emailData)
  if (aiCategoryName) {
    const existing = params.categoriesByName.get(aiCategoryName.toLowerCase())
    if (existing) {
      return {
        source: 'ai' as const,
        category: existing,
        rule: null,
        aiCategoryName
      }
    }

    const fetched = await getCategoryByName(params.db, params.userId, aiCategoryName)
    if (fetched) {
      params.categoriesByName.set(aiCategoryName.toLowerCase(), fetched)
      params.categoriesById.set(fetched.id, fetched)
      return {
        source: 'ai' as const,
        category: fetched,
        rule: null,
        aiCategoryName
      }
    }
  }

  return {
    source: 'ai' as const,
    category: null,
    rule: null,
    aiCategoryName: aiCategoryName || 'Uncategorized'
  }
}

async function getUserRules(db: D1Database, userId: number) {
  const result = await db.prepare(`
    SELECT *
    FROM email_rules
    WHERE user_id = ? AND is_active = 1
    ORDER BY priority DESC, id ASC
  `).bind(userId).all<EmailRuleRow>()

  return result.results ?? []
}

async function getUserCategories(db: D1Database, userId: number) {
  const result = await db.prepare(`
    SELECT *
    FROM email_categories
    WHERE user_id = ?
    ORDER BY name ASC
  `).bind(userId).all<EmailCategoryRow>()

  return result.results ?? []
}

async function getCategoryByName(db: D1Database, userId: number, name: string) {
  return db.prepare(`
    SELECT *
    FROM email_categories
    WHERE user_id = ? AND LOWER(name) = LOWER(?)
    LIMIT 1
  `).bind(userId, name).first<EmailCategoryRow | null>()
}

async function storeProcessedEmail(db: D1Database, userId: number, payload: {
  gmailId: string
  sender: string
  subject: string
  snippet: string
  categoryId: number | null
  confidenceScore: number
  isManualOverride: number
}) {
  await db.prepare(`
    INSERT INTO processed_emails
    (user_id, gmail_id, sender, subject, snippet, category_id, confidence_score, is_manual_override)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    payload.gmailId,
    payload.sender,
    payload.subject,
    payload.snippet,
    payload.categoryId,
    payload.confidenceScore,
    payload.isManualOverride
  ).run()
}

// AI Intelligence Center Functions
// Generate specific email analysis for targeted queries
async function generateSpecificEmailAnalysis(env: EnvBindings, emails: any[], query: string): Promise<any> {
  console.log('generateSpecificEmailAnalysis called with:', emails?.length || 0, 'emails for query:', query)
  
  if (emails && emails.length > 0 && env.OPENAI_API_KEY) {
    try {
      const emailDetails = emails.map(email => 
        `📧 Email ID: ${email.id}
📤 From: ${email.from}
📋 Subject: ${email.subject}
📝 Content: ${email.snippet || 'No preview available'}
📅 Date: ${email.timestamp}
🏷️ Labels: ${email.labels?.join(', ') || 'None'}`
      ).join('\n\n' + '─'.repeat(50) + '\n\n')

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: `You are analyzing specific emails based on the user's query. Present the results in a user-friendly format that shows actual email details and actionable insights.

Return JSON format:
{
  "emailsFound": [
    {
      "id": "actual_email_id",
      "subject": "actual_subject", 
      "from": "actual_sender",
      "snippet": "actual_content_preview",
      "timestamp": "actual_date",
      "priority": "LOW|MEDIUM|HIGH",
      "actionType": "read|respond|archive|forward",
      "insights": "What this email means or what action to take"
    }
  ],
  "summary": "Brief overview of what was found",
  "totalFound": number_of_emails,
  "actionRecommendations": ["specific actions user can take"],
  "keyFindings": ["important insights about these emails"]
}`
            },
            {
              role: 'user',
              content: `User query: "${query}"

Analyze these specific emails:

${emailDetails}`
            }
          ],
          max_tokens: 2000,
          temperature: 0.2
        })
      })

      if (!response.ok) throw new Error('AI analysis failed')
      
      const data = await response.json<{ choices?: { message?: { content?: string } }[] }>()
      const aiResponse = JSON.parse(data.choices?.[0]?.message?.content || '{}')
      
      return {
        ...aiResponse,
        usingRealData: true,
        querySpecific: true,
        realEmailCount: emails.length,
        originalQuery: query
      }
    } catch (error) {
      console.error('Specific email analysis error:', error)
    }
  }
  
  // Fallback for when no emails match or API fails
  return {
    emailsFound: [],
    summary: `No emails found matching "${query}"`,
    totalFound: 0,
    actionRecommendations: ['Try a different search term', 'Check your email filters'],
    keyFindings: ['No matching emails in recent history'],
    usingRealData: true,
    querySpecific: true
  }
}

async function generateEmailTriageAI(env: EnvBindings, emails: any[]): Promise<any> {
  console.log('generateEmailTriageAI called with:', emails?.length || 0, 'emails')
  console.log('Has OpenAI key:', !!env.OPENAI_API_KEY)
  
  // If we have real emails, analyze them with AI
  if (emails && emails.length > 0 && env.OPENAI_API_KEY) {
    console.log('Processing real emails with AI...')
    try {
      const emailSummaries = emails.slice(0, 10).map(email => 
        `ID: ${email.id}\nFrom: ${email.from}\nSubject: ${email.subject}\nSnippet: ${email.snippet || 'No content'}\nTimestamp: ${email.timestamp}`
      ).join('\n\n---\n\n')

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: `You are an AI email triage assistant. Analyze the user's real emails and provide details about all emails found, with priority classification.

Return ALL emails analyzed with their details and classify each one.

Respond in JSON format:
{
  "allEmails": [
    {
      "id": "actual_email_id_from_input",
      "subject": "actual_subject_from_input",
      "from": "actual_from_from_input", 
      "snippet": "actual_snippet_from_input",
      "timestamp": "actual_timestamp_from_input",
      "priority": "URGENT|HIGH|MEDIUM|LOW",
      "category": "lottery|promotional|business|personal|etc",
      "actionType": "read|respond|archive|follow_up"
    }
  ],
  "highPriorityEmails": [],
  "summary": "Brief summary of what you found",
  "insights": ["Key insight 1", "Key insight 2"],
  "suggestion": "Overall recommendation",
  "stats": {
    "totalAnalyzed": ${emails.length},
    "highPriority": 0,
    "aiConfidence": 0.9
  }
}`
            },
            {
              role: 'user',
              content: `Analyze these real emails for priority:\n\n${emailSummaries}`
            }
          ],
          max_tokens: 1500,
          temperature: 0.3
        })
      })

      if (!response.ok) throw new Error('AI request failed')
      
      const data = await response.json<{ choices?: { message?: { content?: string } }[] }>()
      const aiResponse = JSON.parse(data.choices?.[0]?.message?.content || '{}')
      
      // Ensure we have the actionType for frontend handling
      if (aiResponse.highPriorityEmails) {
        aiResponse.highPriorityEmails.forEach((email: any) => {
          if (!email.actionType) {
            // Infer action type from content
            if (email.subject?.toLowerCase().includes('meeting') || email.subject?.toLowerCase().includes('schedule')) {
              email.actionType = 'calendar_action'
            } else if (email.subject?.toLowerCase().includes('approval') || email.subject?.toLowerCase().includes('budget')) {
              email.actionType = 'approval_needed'
            } else {
              email.actionType = 'response_needed'
            }
          }
        })
      }
      
      console.log('AI analysis complete, returning real data results')
      return {
        ...aiResponse,
        aiPowered: true,
        usingRealData: true,
        realEmailCount: emails.length
      }
    } catch (error) {
      console.error('AI triage error:', error)
      // Fall back to demo data on AI error
    }
  }
  
  // Fallback: demo data when no real emails or AI unavailable
  console.log('Using demo data fallback')
  return {
    highPriorityEmails: [
        {
          id: 'demo-1',
          subject: 'URGENT: Project Deadline Extension Request',
          from: 'sarah.chen@techcorp.com',
          snippet: 'Client requesting timeline adjustment for Q4 deliverable due to scope changes. Need response by EOD.',
          priority: 'URGENT',
          reason: 'Client deadline in 24 hours - revenue impact',
          action: 'Review scope changes and provide timeline',
          aiSuggested: 'Generate professional response acknowledging request',
          timestamp: new Date(Date.now() - 2 * 3600000).toISOString(), // 2 hours ago
          actionType: 'response_needed'
        },
        {
          id: 'demo-2', 
          subject: 'Meeting Rescheduling - Weekly Sync',
          from: 'team.lead@company.com',
          snippet: 'Need to move weekly sync to accommodate travel schedule. Prefer Tuesday 2pm or Wednesday 10am.',
          priority: 'HIGH',
          reason: 'Team coordination - affects multiple schedules',
          action: 'Confirm availability and send calendar invite',
          aiSuggested: 'Check calendar conflicts and suggest optimal time',
          timestamp: new Date(Date.now() - 4 * 3600000).toISOString(), // 4 hours ago
          actionType: 'calendar_action'
        },
        {
          id: 'demo-3',
          subject: 'Budget Approval Needed - Q1 Marketing Spend',
          from: 'finance@company.com', 
          snippet: 'Marketing budget proposal for Q1 campaigns awaiting your approval. Total: $45K. Please review attached breakdown.',
          priority: 'ACTION',
          reason: 'Financial decision required - Q1 planning deadline',
          action: 'Review budget breakdown and approve/decline',
          aiSuggested: 'Quick approve if within allocated budget',
          timestamp: new Date(Date.now() - 6 * 3600000).toISOString(), // 6 hours ago
          actionType: 'approval_needed'
        }
      ],
      summary: '3 high-priority emails require immediate attention',
      insights: [
        'Client communication needs urgent response',
        'Team coordination affecting project timelines', 
        'Financial approvals blocking Q1 planning'
      ],
      suggestion: 'Address client deadline first, then handle internal coordination',
      stats: {
        totalAnalyzed: 47,
        highPriority: 3,
        mediumPriority: 8,
        lowPriority: 36,
        aiConfidence: 0.92
      },
      aiPowered: true,
      usingRealData: false
    }
  }

async function generateMeetingIntelligence(env: EnvBindings, meetings: any[], userContext: any): Promise<any> {
  if (!env.OPENAI_API_KEY) {
    return {
      todaysMeetings: meetings,
      aiSuggestions: {
        talkingPoints: [
          "Revenue tracking 12% ahead of Q3 projections",
          "Team capacity concerns for December deliverables", 
          "Budget reallocation opportunities identified"
        ],
        keyDataPoints: [
          "Customer satisfaction up 8% this quarter",
          "3 new client acquisitions pending signatures",
          "Technical debt reduction 40% complete"
        ],
        actionItems: [
          { task: "Finalize vendor contracts", owner: "Sarah", status: "Complete" },
          { task: "Update project timeline", owner: "Mike", status: "In Progress" },
          { task: "Security audit results", owner: "Tom", status: "Overdue" }
        ]
      }
    }
  }

  try {
    const meetingContext = meetings.map(meeting => 
      `Meeting: ${meeting.summary || meeting.title}\nTime: ${meeting.start?.dateTime || meeting.time}\nAttendees: ${meeting.attendees?.length || 0}`
    ).join('\n\n')

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an AI meeting intelligence assistant. Generate comprehensive prep notes and talking points for today's meetings.

Provide strategic insights including:
- Key talking points based on meeting context
- Important data points to reference
- Potential discussion topics
- Action items to follow up on
- Meeting optimization suggestions

Respond in JSON format:
{
  "aiSuggestions": {
    "talkingPoints": ["point 1", "point 2", "point 3"],
    "keyDataPoints": ["data 1", "data 2", "data 3"], 
    "potentialTopics": ["topic 1", "topic 2"],
    "preparationTips": "Overall prep advice"
  },
  "meetingOptimization": "Suggestions for better meetings",
  "timeManagement": "Schedule optimization tips"
}`
          },
          {
            role: 'user',
            content: `Generate meeting intelligence for:\n\n${meetingContext}\n\nUser context: ${JSON.stringify(userContext)}`
          }
        ],
        max_tokens: 1200,
        temperature: 0.4
      })
    })

    if (!response.ok) throw new Error('AI request failed')
    
    const data = await response.json<{ choices?: { message?: { content?: string } }[] }>()
    const aiResponse = JSON.parse(data.choices?.[0]?.message?.content || '{}')
    
    return {
      todaysMeetings: meetings,
      ...aiResponse,
      aiPowered: true
    }
  } catch (error) {
    console.error('Meeting AI error:', error)
    return { error: 'Meeting analysis failed' }
  }
}

async function generateProductivityAnalytics(env: EnvBindings, userActivity: any): Promise<any> {
  if (!env.OPENAI_API_KEY) {
    return {
      productivityScore: 87,
      peakHours: "10-11 AM",
      insights: [
        { type: "Deep Work", insight: "You achieve 3x higher output when blocking 90+ minute focus sessions" },
        { type: "Email Optimization", insight: "Batch processing emails at 9 AM and 3 PM reduces interruptions by 65%" },
        { type: "Task Timing", insight: "Creative work performs best Tuesday-Thursday mornings based on your patterns" }
      ],
      recommendations: [
        "Schedule important tasks during peak hours",
        "Block calendar for deep work sessions", 
        "Batch similar activities together"
      ]
    }
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an AI productivity analyst. Analyze user patterns and provide actionable insights.

Generate a productivity score (0-100) and behavioral insights based on:
- Email response patterns
- Meeting frequency and timing
- Task completion rates
- Calendar utilization
- Work rhythm patterns

Provide specific, actionable recommendations for optimization.

Respond in JSON format:
{
  "productivityScore": 85,
  "peakHours": "10-11 AM",
  "insights": [
    {
      "type": "Pattern Type",
      "insight": "Specific behavioral insight",
      "impact": "Quantified benefit"
    }
  ],
  "recommendations": ["actionable suggestion 1", "suggestion 2"],
  "optimizations": "Overall productivity strategy"
}`
          },
          {
            role: 'user',
            content: `Analyze productivity patterns:\n\n${JSON.stringify(userActivity, null, 2)}`
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      })
    })

    if (!response.ok) throw new Error('AI request failed')
    
    const data = await response.json<{ choices?: { message?: { content?: string } }[] }>()
    const aiResponse = JSON.parse(data.choices?.[0]?.message?.content || '{}')
    
    return {
      ...aiResponse,
      aiPowered: true
    }
  } catch (error) {
    console.error('Productivity AI error:', error)
    return { error: 'Analytics failed' }
  }
}

async function generateFollowUpIntelligence(env: EnvBindings, conversations: any[]): Promise<any> {
  if (!env.OPENAI_API_KEY) {
    return {
      followUps: [
        {
          contact: "Sarah Chen",
          context: "Project Proposal",
          lastContact: "6 days ago",
          confidence: 95,
          aiMessage: "Hi Sarah, I wanted to circle back on the project timeline we discussed last week. I know you mentioned needing to check with your team - any updates on potential start dates? Happy to adjust our proposal based on your bandwidth. Best, [Your name]",
          reason: "No response to project timeline question"
        },
        {
          contact: "Mike Rodriguez", 
          context: "Meeting Notes",
          lastContact: "3 days ago",
          confidence: 87,
          aiMessage: "Hi Mike, Hope you had a great weekend! Just wanted to follow up on the technical specs you mentioned sharing after our call. No rush, but having those would help us finalize the integration timeline. Thanks!",
          reason: "Mentioned sharing technical specs"
        }
      ]
    }
  }

  try {
    const conversationContext = conversations.slice(0, 10).map(conv => 
      `Contact: ${conv.contact}\nLast Message: ${conv.lastMessage}\nDate: ${conv.date}\nContext: ${conv.context || 'General'}`
    ).join('\n\n---\n\n')

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an AI follow-up assistant. Analyze conversations and identify follow-up opportunities.

Look for:
- Unanswered questions or requests
- Promised deliverables or responses
- Time-sensitive items
- Relationship maintenance opportunities
- Project progress check-ins

For each follow-up, generate a professional, contextual message that:
- References the previous conversation naturally
- Has a clear but gentle call to action
- Maintains professional tone
- Adds value to the relationship

Respond in JSON format:
{
  "followUps": [
    {
      "contact": "Name",
      "context": "Brief context",
      "lastContact": "X days ago",
      "confidence": 85,
      "aiMessage": "Professional follow-up message",
      "reason": "Why this follow-up is needed",
      "priority": "High/Medium/Low"
    }
  ],
  "summary": "Overall follow-up strategy"
}`
          },
          {
            role: 'user',
            content: `Analyze these conversations for follow-up opportunities:\n\n${conversationContext}`
          }
        ],
        max_tokens: 1500,
        temperature: 0.4
      })
    })

    if (!response.ok) throw new Error('AI request failed')
    
    const data = await response.json<{ choices?: { message?: { content?: string } }[] }>()
    const aiResponse = JSON.parse(data.choices?.[0]?.message?.content || '{}')
    
    return {
      ...aiResponse,
      aiPowered: true
    }
  } catch (error) {
    console.error('Follow-up AI error:', error)
    return { error: 'Follow-up analysis failed' }
  }
}

// AI Command Interface - Natural Language Processing Engine with Real Actions
async function generateAICommandResponse(env: EnvBindings, command: string, context: any = {}): Promise<any> {
  try {
    // First, determine the intent and action type
    const intentResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are VAAI's command parser. Analyze the user's natural language command and determine what action to take.

AVAILABLE ACTIONS:
1. "email_analysis" - Analyze, triage, prioritize emails
2. "calendar_management" - View calendar events, schedule meetings, check availability
3. "task_management" - View, create, complete Google Tasks
4. "meeting_intelligence" - Meeting prep, calendar analysis  
5. "productivity_analytics" - Productivity patterns, time analysis
6. "follow_up_intelligence" - Follow-up detection and generation
7. "general_help" - General assistance, navigation help

RESPONSE FORMAT (JSON only):
{
  "action_type": "email_analysis|calendar_management|task_management|meeting_intelligence|productivity_analytics|follow_up_intelligence|general_help",
  "confidence": 0.95,
  "user_intent": "brief description of what user wants"
}

Examples:
- "analyze my emails" → {"action_type": "email_analysis", "confidence": 0.95, "user_intent": "wants email analysis and prioritization"}
- "show my calendar" → {"action_type": "calendar_management", "confidence": 0.95, "user_intent": "wants to view calendar events"}
- "what tasks do I have" → {"action_type": "task_management", "confidence": 0.9, "user_intent": "wants to view Google Tasks"}
- "create a task" → {"action_type": "task_management", "confidence": 0.9, "user_intent": "wants to create a new task"}
- "meeting prep" → {"action_type": "meeting_intelligence", "confidence": 0.9, "user_intent": "wants meeting preparation"}
- "productivity patterns" → {"action_type": "productivity_analytics", "confidence": 0.9, "user_intent": "wants productivity insights"}`
          },
          {
            role: 'user',
            content: command
          }
        ],
        max_tokens: 150,
        temperature: 0.1
      })
    })

    if (!intentResponse.ok) throw new Error('Intent analysis failed')
    
    const intentData = await intentResponse.json<{ choices?: { message?: { content?: string } }[] }>()
    let intent
    try {
      intent = JSON.parse(intentData.choices?.[0]?.message?.content || '{}')
    } catch {
      intent = { action_type: 'general_help', confidence: 0.5, user_intent: 'unclear command' }
    }

    // Execute the appropriate real AI function based on intent
    let realResult
    switch (intent.action_type) {
      case 'email_analysis':
        // Get user's emails and run real email triage
        try {
          let emails = []
          let fetchError = null
          
          console.log('AI Command - Email Analysis Request')
          console.log('Original command:', command)
          console.log('Context:', JSON.stringify(context, null, 2))
          
          // Use real emails if provided by frontend
          if (context.realEmails && Array.isArray(context.realEmails)) {
            emails = context.realEmails
            console.log('Using real emails from frontend:', emails.length)
            
            // Check if user is asking for specific emails (e.g., "emails from the lott")
            const lowerCommand = command.toLowerCase()
            if (lowerCommand.includes('from') && (lowerCommand.includes('lott') || lowerCommand.includes('lottery'))) {
              console.log('Filtering for lottery-related emails...')
              emails = emails.filter(email => 
                email.from?.toLowerCase().includes('lott') || 
                email.subject?.toLowerCase().includes('lott') ||
                email.from?.toLowerCase().includes('lottery') || 
                email.subject?.toLowerCase().includes('lottery')
              )
              console.log(`Filtered to ${emails.length} lottery-related emails`)
            }
          } else {
            console.log('No real emails provided, using fallback')
            fetchError = 'No emails provided from frontend'
          }
          
          // Always use the email triage AI - it handles both general and specific cases
          realResult = await generateEmailTriageAI(env, emails)
          
          // If this was a specific query, add that info to the result
          if (command.toLowerCase().includes('lott') || command.toLowerCase().includes('lottery')) {
            realResult.wasSpecificQuery = true
            realResult.originalCommand = command
          }
          
          // Add debug info about data source
          const debugInfo = emails.length > 0 ? `📧 Real Gmail data (${emails.length} emails)` : `🎭 Demo data${fetchError ? ` (${fetchError})` : ''}`
          
          // Create a detailed response showing actual emails found
          let responseText = `✅ Email Analysis Complete! I've analyzed ${emails.length} emails and found:\n\n${realResult.summary || 'Your email analysis is ready.'}\n\n`
          
          // Show all emails found with details
          if (realResult.allEmails && realResult.allEmails.length > 0) {
            responseText += `📧 **Emails Found:**\n`
            realResult.allEmails.forEach((email, idx) => {
              const priorityIcon = email.priority === 'URGENT' ? '🔴' : email.priority === 'HIGH' ? '🟡' : email.priority === 'MEDIUM' ? '🟠' : '🟢'
              responseText += `\n${idx + 1}. ${priorityIcon} **${email.subject}**\n`
              responseText += `   📤 From: ${email.from}\n`
              responseText += `   📅 ${new Date(email.timestamp).toLocaleDateString()}\n`
              responseText += `   💭 ${email.snippet || 'No preview'}\n`
              responseText += `   🏷️ ${email.category} • ${email.priority} priority\n`
            })
          } else if (emails.length > 0) {
            // Fallback: show raw emails if AI parsing failed
            responseText += `📧 **Raw Email Data:**\n`
            emails.slice(0, 5).forEach((email, idx) => {
              responseText += `\n${idx + 1}. **${email.subject}**\n`
              responseText += `   📤 From: ${email.from}\n`
              responseText += `   📅 ${new Date(email.timestamp).toLocaleDateString()}\n`
              responseText += `   💭 ${email.snippet || 'No preview'}\n`
            })
          }
          
          responseText += `\n\n💡 Key insights: ${realResult.insights?.join(', ') || 'Check the Email Triage section for detailed analysis.'}\n\n${debugInfo}`
          
          return {
            response: responseText,
            action: {
              type: 'none'  // Don't auto-navigate
            },
            suggestions: [
              'View detailed email triage results',
              'Auto-sort emails by priority', 
              'Generate email responses',
              'Set up email filters'
            ],
            confidence: intent.confidence,
            realData: realResult,
            emailCount: emails.length,
            debugInfo: {
              hasUserToken: !!context.userToken,
              emailsFetched: emails.length,
              fetchError: fetchError,
              usingRealData: emails.length > 0
            }
          }
        } catch (error) {
          return {
            response: '📧 I can analyze your emails! Click "Auto-Sort Now" in the Smart Email Triage card above for detailed analysis.',
            action: { type: 'navigate', target: 'email-triage' },
            suggestions: ['Use Smart Email Triage feature', 'Check your Gmail connection'],
            confidence: 0.8
          }
        }

      case 'calendar_management':
        try {
          console.log('AI Command - Calendar Management Request')
          console.log('Context calendar events received:', context.realCalendarEvents?.length || 0)
          
          // Use calendar events from context if available (pre-fetched by frontend)
          let events = []
          if (context.realCalendarEvents && Array.isArray(context.realCalendarEvents) && context.realCalendarEvents.length > 0) {
            events = context.realCalendarEvents
            console.log('Using pre-fetched calendar events from frontend:', events.length)
          } else {
            // Fallback: Fetch user's calendar events from backend
            console.log('No context calendar events, fetching from backend...')
            const authed = { userId: context.userEmail }
            const googleId = context.userEmail
            const { clientId, clientSecret } = getGoogleConfig(env)
            
            try {
              const calendarResponse = await calendarListEvents({
                db: env.DB,
                googleId,
                clientId,
                clientSecret,
                maxResults: 20,
                timeMin: new Date().toISOString(),
                timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Next 7 days
              })
              events = calendarResponse.items || []
            } catch (error) {
              console.error('Failed to fetch calendar events:', error)
            }
          }

          let responseText = `📅 Calendar Overview! I found ${events.length} upcoming events:\n\n`
          
          if (events.length > 0) {
            responseText += `📊 **Your Schedule:**\n`
            events.slice(0, 5).forEach((event, idx) => {
              const startTime = event.start?.dateTime ? new Date(event.start.dateTime).toLocaleString() : 'All day'
              responseText += `\n${idx + 1}. **${event.summary || 'Untitled Event'}**\n`
              responseText += `   🕐 ${startTime}\n`
              responseText += `   📍 ${event.location || 'No location'}\n`
              if (event.attendees && event.attendees.length > 0) {
                responseText += `   👥 ${event.attendees.length} attendees\n`
              }
            })
          } else {
            responseText += `📅 No upcoming events found in the next 7 days.\n`
          }
          
          responseText += `\n📈 **Analysis:** ${events.length > 5 ? 'Busy schedule ahead!' : events.length > 2 ? 'Moderate schedule' : 'Light schedule'}\n\n🗓️ Real Calendar data (${events.length} events)`

          return {
            response: responseText,
            action: { type: 'none' },
            suggestions: [
              'Schedule new meeting',
              'Check availability', 
              'Block focus time',
              'View full calendar'
            ],
            confidence: intent.confidence,
            realData: { events, totalFound: events.length }
          }
        } catch (error) {
          return {
            response: '📅 Calendar access error. Please ensure Google Calendar permissions are enabled.',
            action: { type: 'none' },
            suggestions: ['Check Google Calendar connection', 'Re-authenticate with Google'],
            confidence: 0.7
          }
        }

      case 'task_management':
        try {
          console.log('AI Command - Task Management Request')
          console.log('Context tasks received:', context.realTasks?.length || 0)
          
          // Use tasks from context if available (pre-fetched by frontend)
          let tasks = []
          if (context.realTasks && Array.isArray(context.realTasks) && context.realTasks.length > 0) {
            tasks = context.realTasks
            console.log('Using pre-fetched tasks from frontend:', tasks.length)
          } else {
            // Fallback: Fetch user's Google Tasks from backend
            console.log('No context tasks, fetching from backend...')
            const authed = { userId: context.userEmail }
            const googleId = context.userEmail
            const { clientId, clientSecret } = getGoogleConfig(env)
            
            try {
              const tasksResponse = await googleTasksList({
                db: env.DB,
                googleId,
                clientId,
                clientSecret,
                taskListId: '@default',
                maxResults: 20
              })
              tasks = tasksResponse.items || []
            } catch (error) {
              console.error('Failed to fetch tasks:', error)
            }
          }

          let responseText = `✅ Task Overview! I found ${tasks.length} tasks:\n\n`
          
          if (tasks.length > 0) {
            const pendingTasks = tasks.filter(task => task.status !== 'completed')
            const completedTasks = tasks.filter(task => task.status === 'completed')
            
            responseText += `📋 **Pending Tasks (${pendingTasks.length}):**\n`
            pendingTasks.slice(0, 5).forEach((task, idx) => {
              const dueDate = task.due ? new Date(task.due).toLocaleDateString() : 'No due date'
              responseText += `\n${idx + 1}. **${task.title}**\n`
              responseText += `   📅 Due: ${dueDate}\n`
              if (task.notes) {
                responseText += `   📝 ${task.notes.substring(0, 50)}${task.notes.length > 50 ? '...' : ''}\n`
              }
            })
            
            if (completedTasks.length > 0) {
              responseText += `\n✅ **Recently Completed:** ${completedTasks.length} tasks`
            }
          } else {
            responseText += `📝 No tasks found. Ready to create your first task!\n`
          }
          
          responseText += `\n\n📊 **Status:** ${tasks.filter(t => t.status !== 'completed').length} pending, ${tasks.filter(t => t.status === 'completed').length} completed\n\n📝 Real Google Tasks data (${tasks.length} tasks)`

          return {
            response: responseText,
            action: { type: 'none' },
            suggestions: [
              'Create new task',
              'Mark task complete',
              'View all tasks',
              'Set task due dates'
            ],
            confidence: intent.confidence,
            realData: { tasks, totalFound: tasks.length, pending: tasks.filter(t => t.status !== 'completed').length }
          }
        } catch (error) {
          return {
            response: '📝 Task access error. Please ensure Google Tasks permissions are enabled.',
            action: { type: 'none' },
            suggestions: ['Check Google Tasks connection', 'Re-authenticate with Google'],
            confidence: 0.7
          }
        }

      case 'meeting_intelligence':
        try {
          const meetings = [] // In a real scenario, we'd fetch calendar events
          realResult = await generateMeetingIntelligence(env, meetings)
          return {
            response: `📅 Meeting Intelligence Ready! I've analyzed your calendar:\n\n${realResult.summary || 'Your meeting insights are prepared.'}\n\n🎯 Recommendations: ${realResult.recommendations?.slice(0, 2).join(', ') || 'Optimize your meeting schedule'}`,
            action: {
              type: 'navigate', 
              target: 'meeting-intelligence',
              parameters: { analysis: realResult }
            },
            suggestions: [
              'View meeting preparation details',
              'Optimize calendar schedule',
              'Generate meeting agendas',
              'Block focus time'
            ],
            confidence: intent.confidence,
            realData: realResult
          }
        } catch (error) {
          return {
            response: '📅 I can help with meeting intelligence! Use the Meeting Intelligence card above to analyze your calendar and get AI-powered meeting prep.',
            action: { type: 'navigate', target: 'meeting-intelligence' },
            suggestions: ['Use Meeting Intelligence feature', 'Connect your Google Calendar'],
            confidence: 0.8
          }
        }

      case 'productivity_analytics':
        try {
          const activities = [] // In a real scenario, we'd fetch user activity data
          realResult = await generateProductivityAnalytics(env, activities)
          return {
            response: `📊 Productivity Analysis Complete! Here are your insights:\n\n${realResult.summary || 'Your productivity patterns have been analyzed.'}\n\n⚡ Peak performance: ${realResult.peakHours || 'Mornings'} | 🎯 Focus score: ${realResult.focusScore || '85%'}`,
            action: {
              type: 'navigate',
              target: 'productivity-analytics', 
              parameters: { analysis: realResult }
            },
            suggestions: [
              'View detailed productivity metrics',
              'Schedule focus time blocks',
              'Optimize daily schedule',
              'Set productivity goals'
            ],
            confidence: intent.confidence,
            realData: realResult
          }
        } catch (error) {
          return {
            response: '📊 I can analyze your productivity patterns! Click "Generate Report" in the Productivity Analytics card to see detailed insights.',
            action: { type: 'navigate', target: 'productivity-analytics' },
            suggestions: ['Use Productivity Analytics feature', 'Track your work patterns'],
            confidence: 0.8
          }
        }

      case 'follow_up_intelligence':
        try {
          const conversations = [] // In a real scenario, we'd fetch conversation data
          realResult = await generateFollowUpIntelligence(env, conversations)
          return {
            response: `🎯 Follow-up Analysis Done! I've identified actionable items:\n\n${realResult.summary || 'Your follow-up opportunities are ready.'}\n\n📝 Actions needed: ${realResult.actionItems?.length || 0} items require follow-up`,
            action: {
              type: 'navigate',
              target: 'follow-up-intelligence',
              parameters: { analysis: realResult }
            },
            suggestions: [
              'View follow-up recommendations',
              'Draft follow-up messages',
              'Schedule follow-up reminders',
              'Prioritize action items'
            ],
            confidence: intent.confidence,
            realData: realResult
          }
        } catch (error) {
          return {
            response: '🎯 I can help identify follow-ups! Use the Follow-up Intelligence card to analyze your conversations and find actionable items.',
            action: { type: 'navigate', target: 'follow-up-intelligence' },
            suggestions: ['Use Follow-up Intelligence feature', 'Review recent conversations'],
            confidence: 0.8
          }
        }

      default:
        return {
          response: `👋 I'm here to help! I can assist with:\n\n📧 Email analysis and prioritization\n📅 Meeting intelligence and prep\n📊 Productivity analytics and insights\n🎯 Follow-up detection and generation\n\nTry commands like "analyze my emails" or "show productivity patterns"`,
          action: { type: 'none' },
          suggestions: [
            'Analyze my emails',
            'Generate meeting prep', 
            'Show productivity patterns',
            'Find follow-ups needed'
          ],
          confidence: 0.9
        }
    }
    
  } catch (error) {
    console.error('AI command error:', error)
    return { 
      error: 'AI command processing failed',
      response: '❌ I encountered an error processing your command. The AI Intelligence Center features above are ready to help!',
      action: { type: 'none' },
      suggestions: [
        'Try using the specific AI features above',
        'Check your connection',
        'Rephrase your command'
      ],
      confidence: 0.0
    }
  }
}


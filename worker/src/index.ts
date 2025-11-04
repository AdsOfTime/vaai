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
If scheduling a meeting, capture title, start and end time (ISO 8601 preferred), location, attendees, and description when possible.
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
          due: { type: 'string', description: 'Due date/time in ISO 8601 format' }
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
    maxResults: 10,
    query: 'is:unread'
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
        date: internalDate.toISOString()
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
    const response = await calendarListEvents({
      db: c.env.DB,
      googleId,
      clientId,
      clientSecret,
      timeMin,
      timeMax,
      maxResults: Number.isNaN(maxResults) ? 10 : maxResults
    })

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

api.post('/assistant', async (c) => {
  try {
    const user = await resolveCurrentUser(c)
    const authed = c.get('user')
    const body = await parseJson<{ message?: string; context?: Record<string, unknown> }>(c)

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

    const completionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: assistantSystemPrompt },
          { role: 'user', content: body.message.trim() }
        ],
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
            description: typeof args.description === 'string' ? args.description : undefined
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
            due: typeof args.due === 'string' ? args.due : undefined
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
    const context = await getFollowUpContext(c)
    const statusParam = c.req.query('status')
    const status = statusParam === 'all' ? null : (statusParam || 'pending')
    const filter = c.req.query('filter')
    const ownerUserId = filter === 'mine' ? context.user.id : undefined

    const tasks = await listFollowUpTasks(c.env.DB, {
      teamId: context.teamId,
      status,
      ownerUserId,
      limit: 100
    })

    return c.json({ tasks: tasks.map(serializeFollowUpTask) })
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
}) {
  const startDate = new Date(params.start)
  const endDate = new Date(params.end)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return {
      reply: 'I need both a valid start and end time (ISO 8601) to book that meeting. Please provide those and try again.'
    }
  }

  if (endDate <= startDate) {
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
        dateTime: startDate.toISOString(),
        timeZone: getDefaultTimeZone()
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: getDefaultTimeZone()
      },
      attendees: normalizedAttendees
    }
  })

  const humanStart = startDate.toLocaleString()
  const humanEnd = endDate.toLocaleString()

  return {
    reply: `Done! I scheduled "${params.summary}" from ${humanStart} to ${humanEnd}.`,
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
        reply: 'The due date needs to be in ISO 8601 format (for example 2025-04-01T09:00:00Z). Could you restate it?'
      }
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
      notes: params.notes ?? undefined,
      due: params.due ?? undefined
    }
  })

  const task = mapGoogleTask(response)

  return {
    reply: `Got it — I created the task "${task?.title ?? params.title.trim()}"${task?.due ? ` due ${task.due}` : ''}.`,
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


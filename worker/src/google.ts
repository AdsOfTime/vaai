import type { D1Database } from '@cloudflare/workers-types'

type GoogleTokenRow = {
  id: number
  google_id: string
  email: string
  access_token: string | null
  refresh_token: string | null
}

export type GmailMessage = {
  id: string
  threadId: string
  snippet?: string
  internalDate?: string
  payload?: GmailPayload
}

export type GmailPayload = {
  mimeType?: string
  body?: { data?: string }
  parts?: GmailPayload[]
  headers?: { name: string; value: string }[]
}

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1'
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'
const DOCS_BASE = 'https://docs.googleapis.com/v1'
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3'
const SHEETS_BASE = 'https://sheets.googleapis.com/v4'
const TASKS_BASE = 'https://tasks.googleapis.com/tasks/v1'

export async function ensureGoogleAccessToken(db: D1Database, googleId: string, clientId: string, clientSecret: string) {
  const row = await db.prepare(`
    SELECT id, google_id, email, access_token, refresh_token
    FROM users
    WHERE google_id = ?
    LIMIT 1
  `).bind(googleId).first<GoogleTokenRow | null>()

  if (!row) {
    throw new Error('User tokens not found')
  }

  if (row.access_token) {
    return { user: row, accessToken: row.access_token }
  }

  if (!row.refresh_token) {
    throw new Error('Missing refresh token for user')
  }

  const refreshed = await refreshAccessToken(row.refresh_token, clientId, clientSecret)

  await db.prepare(`
    UPDATE users
    SET access_token = ?, refresh_token = COALESCE(?, refresh_token), updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(refreshed.access_token, refreshed.refresh_token ?? null, row.id).run()

  return {
    user: row,
    accessToken: refreshed.access_token
  }
}

export async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token'
  })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to refresh access token: ${response.status} ${text}`)
  }

  return response.json<{ access_token: string; refresh_token?: string }>()
}

async function gmailRequest<T>(options: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  path: string
  method?: 'GET' | 'POST' | 'PATCH'
  query?: Record<string, string | number | undefined>
  body?: unknown
}) {
  const { user, accessToken } = await ensureGoogleAccessToken(options.db, options.googleId, options.clientId, options.clientSecret)

  const url = new URL(`${GMAIL_BASE}/${options.path}`)
  appendQueryParams(url, options.query)

  const response = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  if (response.status === 401 && user.refresh_token) {
    const refreshed = await refreshAccessToken(user.refresh_token, options.clientId, options.clientSecret)

    await options.db.prepare(`
      UPDATE users
      SET access_token = ?, refresh_token = COALESCE(?, refresh_token), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(refreshed.access_token, refreshed.refresh_token ?? null, user.id).run()

    const retry = await fetch(url.toString(), {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${refreshed.access_token}`,
        'Content-Type': 'application/json'
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    })

    if (!retry.ok) {
      const text = await retry.text()
      throw new Error(`Gmail API error: ${retry.status} ${text}`)
    }

    return retry.json<T>()
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Gmail API error: ${response.status} ${text}`)
  }

  return response.json<T>()
}

export async function gmailListMessages(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  maxResults?: number
  query?: string
}) {
  return gmailRequest<{
    messages?: { id: string; threadId: string }[]
    nextPageToken?: string
    resultSizeEstimate?: number
  }>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: 'users/me/messages',
    query: {
      maxResults: params.maxResults,
      q: params.query
    }
  })
}

export async function gmailGetMessage(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  id: string
  format?: 'full' | 'metadata' | 'minimal'
}) {
  return gmailRequest<GmailMessage>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: `users/me/messages/${params.id}`,
    query: {
      format: params.format ?? 'full'
    }
  })
}

export async function gmailListLabels(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
}) {
  return gmailRequest<{ labels?: { id: string; name: string }[] }>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: 'users/me/labels'
  })
}

export async function gmailCreateLabel(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  name: string
}) {
  return gmailRequest<{ id: string; name: string }>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: 'users/me/labels',
    method: 'POST',
    body: {
      name: params.name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show'
    }
  })
}

export async function gmailModifyMessage(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  messageId: string
  addLabelIds?: string[]
  removeLabelIds?: string[]
}) {
  return gmailRequest<GmailMessage>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: `users/me/messages/${params.messageId}/modify`,
    method: 'POST',
    body: {
      addLabelIds: params.addLabelIds,
      removeLabelIds: params.removeLabelIds
    }
  })
}

export function decodeBase64Url(data?: string) {
  if (!data) return ''
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4
  const padded = padding ? normalized + '='.repeat(4 - padding) : normalized
  try {
    const decoded = atob(padded)
    const utf8 = new TextDecoder().decode(Uint8Array.from(decoded, (c) => c.charCodeAt(0)))
    return utf8
  } catch {
    return ''
  }
}

export async function gmailSendMessage(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  raw: string
  labelIds?: string[]
  sendAt?: string
}) {
  return gmailRequest<{ id: string }>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: 'users/me/messages/send',
    method: 'POST',
    body: {
      raw: params.raw,
      labelIds: params.labelIds,
      sendAt: params.sendAt
    }
  })
}

export async function gmailCreateDraft(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  raw: string
}) {
  return gmailRequest<{ id: string }>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: 'users/me/drafts',
    method: 'POST',
    body: {
      message: {
        raw: params.raw
      }
    }
  })
}

export async function gmailListDrafts(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  maxResults: number
}) {
  return gmailRequest<{ drafts?: Array<{ id?: string }> }>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: 'users/me/drafts',
    query: {
      maxResults: params.maxResults
    }
  })
}

export async function gmailGetDraft(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  draftId: string
  metadataHeaders?: string[]
}) {
  return gmailRequest<any>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: `users/me/drafts/${params.draftId}`,
    query: {
      format: 'metadata',
      metadataHeaders: params.metadataHeaders ?? ['Subject', 'To', 'Cc', 'Bcc', 'Date']
    }
  })
}

export async function gmailSendDraft(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  draftId: string
}) {
  return gmailRequest<{ id: string }>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: 'users/me/drafts/send',
    method: 'POST',
    body: {
      id: params.draftId
    }
  })
}

async function calendarRequest<T>(options: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  path: string
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | undefined>
  body?: unknown
}) {
  const { user, accessToken } = await ensureGoogleAccessToken(options.db, options.googleId, options.clientId, options.clientSecret)

  const url = new URL(`${CALENDAR_BASE}/${options.path}`)
  appendQueryParams(url, options.query)

  const requestInit: RequestInit = {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  }

  let response = await fetch(url.toString(), requestInit)

  if (response.status === 401 && user.refresh_token) {
    const refreshed = await refreshAccessToken(user.refresh_token, options.clientId, options.clientSecret)

    await options.db.prepare(`
      UPDATE users
      SET access_token = ?, refresh_token = COALESCE(?, refresh_token), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(refreshed.access_token, refreshed.refresh_token ?? null, user.id).run()

    response = await fetch(url.toString(), {
      ...requestInit,
      headers: {
        Authorization: `Bearer ${refreshed.access_token}`,
        'Content-Type': 'application/json'
      }
    })
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google Calendar API error: ${response.status} ${text}`)
  }

  if (response.status === 204 || options.method === 'DELETE') {
    return undefined as unknown as T
  }

  return response.json<T>()
}

export async function calendarListEvents(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  timeMin: string
  timeMax: string
  maxResults: number
}) {
  return calendarRequest<{
    items?: Array<{
      id: string
      summary?: string
      description?: string
      start?: any
      end?: any
      attendees?: any[]
      hangoutLink?: string
      conferenceData?: { entryPoints?: Array<{ uri?: string }> }
      htmlLink?: string
    }>
  }>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: 'calendars/primary/events',
    query: {
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      maxResults: params.maxResults,
      singleEvents: 'true',
      orderBy: 'startTime'
    }
  })
}

export async function calendarFreeBusy(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  timeMin: string
  timeMax: string
  timeZone: string
}) {
  return calendarRequest<{
    calendars?: {
      primary?: {
        busy?: Array<{ start: string; end: string }>
      }
    }
  }>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: 'freeBusy',
    method: 'POST',
    body: {
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      timeZone: params.timeZone,
      items: [{ id: 'primary' }]
    }
  })
}

export async function calendarInsertEvent(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  body: unknown
  conferenceDataVersion?: number
}) {
  return calendarRequest<{ id: string; summary?: string; start?: any; end?: any; htmlLink?: string }>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: 'calendars/primary/events',
    method: 'POST',
    query: params.conferenceDataVersion ? { conferenceDataVersion: params.conferenceDataVersion } : undefined,
    body: params.body
  })
}

export async function calendarPatchEvent(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  eventId: string
  body: unknown
}) {
  return calendarRequest<{ id: string }>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: `calendars/primary/events/${params.eventId}`,
    method: 'PATCH',
    body: params.body
  })
}

export function extractPlainBody(payload?: GmailPayload): string {
  if (!payload) return ''

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }

  if (payload.parts && payload.parts.length) {
    for (const part of payload.parts) {
      const extracted = extractPlainBody(part)
      if (extracted) {
        return extracted
      }
    }
  }

  return ''
}

export function getHeader(payload: GmailPayload | undefined, name: string) {
  const headers = payload?.headers || []
  const match = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
  return match?.value || ''
}

async function docsRequest<T>(options: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  path: string
  method?: 'GET' | 'POST'
  body?: unknown
}) {
  const { user, accessToken } = await ensureGoogleAccessToken(options.db, options.googleId, options.clientId, options.clientSecret)

  const response = await fetch(`${DOCS_BASE}/${options.path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  if (response.status === 401 && user.refresh_token) {
    const refreshed = await refreshAccessToken(user.refresh_token, options.clientId, options.clientSecret)
    await options.db.prepare(`
      UPDATE users
      SET access_token = ?, refresh_token = COALESCE(?, refresh_token), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(refreshed.access_token, refreshed.refresh_token ?? null, user.id).run()

    const retry = await fetch(`${DOCS_BASE}/${options.path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${refreshed.access_token}`,
        'Content-Type': 'application/json'
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    })

    if (!retry.ok) {
      const text = await retry.text()
      throw new Error(`Google Docs API error: ${retry.status} ${text}`)
    }

    return retry.json<T>()
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google Docs API error: ${response.status} ${text}`)
  }

  if (response.status === 204) {
    return undefined as unknown as T
  }

  return response.json<T>()
}

async function driveRequest<T>(options: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  path: string
  method?: 'GET' | 'PATCH'
  query?: Record<string, string | number | string[] | undefined>
  body?: unknown
}) {
  const { user, accessToken } = await ensureGoogleAccessToken(options.db, options.googleId, options.clientId, options.clientSecret)

  const url = new URL(`${DRIVE_BASE}/${options.path}`)
  appendQueryParams(url, options.query)

  const response = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  if (response.status === 401 && user.refresh_token) {
    const refreshed = await refreshAccessToken(user.refresh_token, options.clientId, options.clientSecret)
    await options.db.prepare(`
      UPDATE users
      SET access_token = ?, refresh_token = COALESCE(?, refresh_token), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(refreshed.access_token, refreshed.refresh_token ?? null, user.id).run()

    const retry = await fetch(url.toString(), {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${refreshed.access_token}`,
        'Content-Type': 'application/json'
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    })

    if (!retry.ok) {
      const text = await retry.text()
      throw new Error(`Google Drive API error: ${retry.status} ${text}`)
    }

    return retry.json<T>()
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google Drive API error: ${response.status} ${text}`)
  }

  if (response.status === 204) {
    return undefined as unknown as T
  }

  return response.json<T>()
}

async function sheetsRequest<T>(options: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  path: string
  method?: 'GET' | 'POST'
  query?: Record<string, string | number | undefined>
  body?: unknown
}) {
  const { user, accessToken } = await ensureGoogleAccessToken(options.db, options.googleId, options.clientId, options.clientSecret)

  const url = new URL(`${SHEETS_BASE}/${options.path}`)
  appendQueryParams(url, options.query)

  const response = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  if (response.status === 401 && user.refresh_token) {
    const refreshed = await refreshAccessToken(user.refresh_token, options.clientId, options.clientSecret)
    await options.db.prepare(`
      UPDATE users
      SET access_token = ?, refresh_token = COALESCE(?, refresh_token), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(refreshed.access_token, refreshed.refresh_token ?? null, user.id).run()

    const retry = await fetch(url.toString(), {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${refreshed.access_token}`,
        'Content-Type': 'application/json'
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    })

    if (!retry.ok) {
      const text = await retry.text()
      throw new Error(`Google Sheets API error: ${retry.status} ${text}`)
    }

    return retry.json<T>()
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google Sheets API error: ${response.status} ${text}`)
  }

  if (response.status === 204) {
    return undefined as unknown as T
  }

  return response.json<T>()
}

export async function googleDocsCreateDocument(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  title: string
}) {
  return docsRequest<{ documentId?: string; title?: string }>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: 'documents',
    method: 'POST',
    body: { title: params.title }
  })
}

export async function googleDocsBatchUpdate(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  documentId: string
  requests: unknown[]
}) {
  return docsRequest<unknown>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: `documents/${params.documentId}:batchUpdate`,
    method: 'POST',
    body: {
      requests: params.requests
    }
  })
}

export async function googleDriveGetFile(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  fileId: string
  fields?: string
}) {
  return driveRequest<{ parents?: string[] }>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: `files/${params.fileId}`,
    query: {
      fields: params.fields ?? 'id, parents'
    }
  })
}

export async function googleDriveUpdateParents(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  fileId: string
  addParents?: string
  removeParents?: string
}) {
  return driveRequest<unknown>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: `files/${params.fileId}`,
    method: 'PATCH',
    query: {
      addParents: params.addParents,
      removeParents: params.removeParents,
      fields: 'id, parents'
    },
    body: {}
  })
}

export async function googleSheetsAppendValues(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  spreadsheetId: string
  range: string
  values: unknown[][]
  valueInputOption: string
}) {
  return sheetsRequest<unknown>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: `spreadsheets/${params.spreadsheetId}/values/${encodeURIComponent(params.range)}:append`,
    method: 'POST',
    query: {
      valueInputOption: params.valueInputOption,
      insertDataOption: 'INSERT_ROWS'
    },
    body: {
      values: params.values
    }
  })
}

async function tasksRequest<T>(options: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  path: string
  method?: 'GET' | 'POST' | 'PATCH'
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
}) {
  const { user, accessToken } = await ensureGoogleAccessToken(options.db, options.googleId, options.clientId, options.clientSecret)

  const url = new URL(`${TASKS_BASE}/${options.path}`)
  appendQueryParams(url, options.query as Record<string, string | number | string[] | undefined>)

  const response = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  if (response.status === 401 && user.refresh_token) {
    const refreshed = await refreshAccessToken(user.refresh_token, options.clientId, options.clientSecret)
    await options.db.prepare(`
      UPDATE users
      SET access_token = ?, refresh_token = COALESCE(?, refresh_token), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(refreshed.access_token, refreshed.refresh_token ?? null, user.id).run()

    const retry = await fetch(url.toString(), {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${refreshed.access_token}`,
        'Content-Type': 'application/json'
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    })

    if (!retry.ok) {
      const text = await retry.text()
      throw new Error(`Google Tasks API error: ${retry.status} ${text}`)
    }

    return retry.json<T>()
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google Tasks API error: ${response.status} ${text}`)
  }

  if (response.status === 204) {
    return undefined as unknown as T
  }

  return response.json<T>()
}

export async function googleTasksList(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  taskListId: string
  showCompleted: boolean
  maxResults: number
}) {
  return tasksRequest<{
    items?: Array<Record<string, unknown>>
  }>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: `lists/${encodeURIComponent(params.taskListId)}/tasks`,
    query: {
      showCompleted: params.showCompleted,
      showHidden: false,
      maxResults: params.maxResults,
      fields: 'items(id,title,notes,status,due,updated,completed,links)'
    }
  })
}

export async function googleTasksInsert(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  taskListId: string
  body: Record<string, unknown>
}) {
  return tasksRequest<Record<string, unknown>>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: `lists/${encodeURIComponent(params.taskListId)}/tasks`,
    method: 'POST',
    body: params.body
  })
}

export async function googleTasksPatch(params: {
  db: D1Database
  googleId: string
  clientId: string
  clientSecret: string
  taskListId: string
  taskId: string
  body: Record<string, unknown>
}) {
  return tasksRequest<Record<string, unknown>>({
    db: params.db,
    googleId: params.googleId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    path: `lists/${encodeURIComponent(params.taskListId)}/tasks/${encodeURIComponent(params.taskId)}`,
    method: 'PATCH',
    body: params.body
  })
}

function appendQueryParams(url: URL, query?: Record<string, string | number | string[] | undefined>) {
  if (!query) return
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item) => {
        url.searchParams.append(key, String(item))
      })
    } else {
      url.searchParams.append(key, String(value))
    }
  })
}

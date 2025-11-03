const fetch = global.fetch;
const PORT = process.env.PORT || '3001';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

require('../src/index');

const ownerToken = process.env.OWNER_TOKEN;
const memberToken = process.env.MEMBER_TOKEN;

if (!ownerToken || !memberToken) {
  console.error('Missing OWNER_TOKEN or MEMBER_TOKEN env vars');
  process.exit(1);
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (err) {
    body = text;
  }
  return { status: res.status, body };
}

async function run() {
  await new Promise(resolve => setTimeout(resolve, 1000));

  const headers = {
    Authorization: `Bearer ${ownerToken}`
  };

  let response = await api('/api/teams', { headers });
  console.log('GET /api/teams =>', response);

  response = await api('/api/teams', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: 'QA Team' })
  });
  console.log('POST /api/teams =>', response);

  if (response.status !== 201 || !response.body?.team?.id) {
    throw new Error('Failed to create team');
  }

  const teamId = response.body.team.id;

  response = await api('/api/teams', { headers });
  console.log('GET /api/teams (after creation) =>', response);

  response = await api(`/api/teams/${teamId}/invite`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: 'member@example.com', role: 'member' })
  });
  console.log('POST /api/teams/:id/invite =>', response);

  if (response.status !== 201 || !response.body?.invitation?.token) {
    throw new Error('Failed to create invitation');
  }

  const invitationToken = response.body.invitation.token;

  const memberHeaders = {
    Authorization: `Bearer ${memberToken}`,
    'Content-Type': 'application/json'
  };

  response = await api('/api/teams/invitations/accept', {
    method: 'POST',
    headers: memberHeaders,
    body: JSON.stringify({ token: invitationToken })
  });
  console.log('POST /api/teams/invitations/accept =>', response);

  response = await api('/api/teams', { headers: memberHeaders });
  console.log('GET /api/teams (as member) =>', response);
}

run()
  .then(() => setTimeout(() => process.exit(0), 500))
  .catch((err) => {
    console.error(err);
    setTimeout(() => process.exit(1), 500);
  });

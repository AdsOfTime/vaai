const { google } = require('googleapis');
const { getAuthorizedGoogleClient } = require('../utils/googleClient');

async function getTasksClient(user) {
  const auth = await getAuthorizedGoogleClient(user);
  return google.tasks({ version: 'v1', auth });
}

function mapTask(task) {
  if (!task) return null;
  return {
    id: task.id,
    title: task.title || '',
    notes: task.notes || '',
    status: task.status || 'needsAction',
    due: task.due || null,
    updated: task.updated || null,
    completed: task.completed || null,
    webViewLink: task.links?.find(link => link.type === 'edit')?.link || null
  };
}

async function listTasks(user, { listId = '@default', showCompleted = false, maxResults = 20 } = {}) {
  const client = await getTasksClient(user);
  const response = await client.tasks.list({
    tasklist: listId,
    showCompleted,
    showHidden: false,
    maxResults,
    fields: 'items(id,title,notes,status,due,updated,completed,links)'
  });

  const items = response.data?.items || [];
  return items.map(mapTask).filter(Boolean);
}

async function createTask(user, { listId = '@default', title, notes, due } = {}) {
  if (!title || !title.trim()) {
    throw new Error('Task title is required');
  }

  const client = await getTasksClient(user);
  const requestBody = {
    title: title.trim()
  };

  if (notes) {
    requestBody.notes = notes;
  }
  if (due) {
    requestBody.due = due;
  }

  const response = await client.tasks.insert({
    tasklist: listId,
    requestBody
  });

  return mapTask(response.data);
}

async function completeTask(user, { listId = '@default', taskId }) {
  if (!taskId) {
    throw new Error('Task id is required');
  }

  const client = await getTasksClient(user);
  const completedAt = new Date().toISOString();

  const response = await client.tasks.patch({
    tasklist: listId,
    task: taskId,
    requestBody: {
      status: 'completed',
      completed: completedAt
    }
  });

  return mapTask(response.data);
}

module.exports = {
  listTasks,
  createTask,
  completeTask
};

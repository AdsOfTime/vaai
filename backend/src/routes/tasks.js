const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { listTasks, createTask, completeTask } = require('../services/googleTasks');

const router = express.Router();

router.get('/', verifyToken, async (req, res) => {
  try {
    const listId = req.query.listId || '@default';
    const showCompleted = req.query.showCompleted === 'true';
    const maxResults = Number.parseInt(req.query.maxResults, 10) || 20;

    const tasks = await listTasks(req.user, {
      listId,
      showCompleted,
      maxResults
    });

    res.json({ tasks });
  } catch (error) {
    console.error('Failed to list Google Tasks:', error);
    res.status(500).json({
      error: 'Unable to load tasks',
      message: error.message
    });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    const { title, notes, due, listId = '@default' } = req.body || {};

    const task = await createTask(req.user, {
      title,
      notes,
      due,
      listId
    });

    res.status(201).json({ task });
  } catch (error) {
    console.error('Failed to create Google Task:', error);
    res.status(400).json({
      error: 'Unable to create task',
      message: error.message
    });
  }
});

router.post('/:taskId/complete', verifyToken, async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const listId = req.body?.listId || '@default';

    const task = await completeTask(req.user, {
      taskId,
      listId
    });

    res.json({ task });
  } catch (error) {
    console.error('Failed to complete Google Task:', error);
    res.status(400).json({
      error: 'Unable to complete task',
      message: error.message
    });
  }
});

module.exports = router;

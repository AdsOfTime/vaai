const { getUserTokens, getUserRules, getUserCategories, getCategoryByName, storeProcessedEmail } = require('../database/users');
const { classifyEmail } = require('./emailClassifier');
const { decodeBase64Url, extractBody, trimContent } = require('../utils/emailContent');

function normalizeString(value) {
  return (value || '').toString().toLowerCase();
}

function ruleMatchesEmail(rule, emailData) {
  const value = rule.rule_value?.toLowerCase();
  if (!value) return false;

  switch (rule.rule_type) {
    case 'sender':
      return normalizeString(emailData.from).includes(value);
    case 'subject':
      return normalizeString(emailData.subject).includes(value);
    case 'content':
      return normalizeString(emailData.body).includes(value);
    default:
      return false;
  }
}

async function ensureLabelExists(gmail, labelName, cache) {
  if (cache[labelName]) {
    return cache[labelName];
  }

  const labelsResponse = cache.__allLabels || await gmail.users.labels.list({ userId: 'me' });
  if (!cache.__allLabels) {
    cache.__allLabels = labelsResponse;
  }

  const existingLabel = labelsResponse.data?.labels?.find(label => label.name === labelName);
  if (existingLabel) {
    cache[labelName] = existingLabel.id;
    return existingLabel.id;
  }

  const created = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name: labelName,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show'
    }
  });

  cache[labelName] = created.data.id;
  return created.data.id;
}

async function applyLabel(gmail, messageId, labelId) {
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      addLabelIds: [labelId]
    }
  });
}

async function determineCategory({ userId, categoriesById, categoriesByName, rules, emailData }) {
  for (const rule of rules) {
    if (ruleMatchesEmail(rule, emailData)) {
      const category = categoriesById.get(rule.category_id);
      if (category) {
        return {
          source: 'rule',
          category,
          rule
        };
      }
    }
  }

  const aiCategoryName = await classifyEmail(emailData);
  if (aiCategoryName) {
    const existing = categoriesByName.get(aiCategoryName.toLowerCase());
    if (existing) {
      return {
        source: 'ai',
        category: existing,
        aiCategoryName
      };
    }

    const fetched = await getCategoryByName(userId, aiCategoryName);
    if (fetched) {
      categoriesByName.set(aiCategoryName.toLowerCase(), fetched);
      categoriesById.set(fetched.id, fetched);
      return {
        source: 'ai',
        category: fetched,
        aiCategoryName
      };
    }
  }

  return {
    source: 'ai',
    category: null,
    aiCategoryName: aiCategoryName || 'Uncategorized'
  };
}

async function storeProcessed(userId, emailMeta, decision) {
  const categoryId = decision.category?.id || null;

  await storeProcessedEmail(userId, {
    gmailId: emailMeta.id,
    sender: emailMeta.from,
    subject: emailMeta.subject,
    snippet: emailMeta.snippet,
    categoryId,
    confidenceScore: decision.source === 'rule' ? 1 : 0.6,
    isManualOverride: 0
  });
}

async function autoSortEmails(gmail, user, options = {}) {
  const limit = Number.parseInt(options.limit, 10) || 10;
  const query = options.query || 'is:unread';

  const userRecord = await getUserTokens(user.userId);
  if (!userRecord) {
    throw new Error('User record not found');
  }

  const [rules, categories] = await Promise.all([
    getUserRules(userRecord.id),
    getUserCategories(userRecord.id)
  ]);

  const categoriesById = new Map();
  const categoriesByName = new Map();
  categories.forEach(category => {
    categoriesById.set(category.id, category);
    categoriesByName.set(category.name.toLowerCase(), category);
  });

  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    maxResults: limit,
    q: query
  });

  const messages = listResponse.data.messages || [];
  if (messages.length === 0) {
    return [];
  }

  const labelCache = {};
  const results = [];

  for (const message of messages) {
    try {
      const fullMessage = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full'
      });

      const headers = fullMessage.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const body = trimContent(extractBody(fullMessage.data.payload) || fullMessage.data.snippet || '');
      const snippet = fullMessage.data.snippet || '';

      const emailData = { id: message.id, subject, from, body, snippet };

      const decision = await determineCategory({
        userId: userRecord.id,
        categoriesById,
        categoriesByName,
        rules,
        emailData
      });

      let labelApplied = null;

      if (decision.category) {
        const labelName = `VAAI/${decision.category.name}`;
        const labelId = await ensureLabelExists(gmail, labelName, labelCache);
        await applyLabel(gmail, message.id, labelId);
        labelApplied = { id: labelId, name: labelName };
      }

      await storeProcessed(userRecord.id, emailData, decision);

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
          aiCategoryName: decision.aiCategoryName || null
        },
        category: decision.category
          ? {
              id: decision.category.id,
              name: decision.category.name
            }
          : null,
        labelApplied
      });
    } catch (error) {
      console.error(`Failed to auto-sort email ${message.id}:`, error);
      results.push({
        emailId: message.id,
        error: error.message || 'Unknown error'
      });
    }
  }

  return results;
}

module.exports = {
  autoSortEmails
};

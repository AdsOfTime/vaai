function decodeBase64Url(data) {
  if (!data) {
    return '';
  }

  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4 || 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padding), 'base64').toString('utf8');
}

function extractBody(payload) {
  if (!payload) return '';

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts && payload.parts.length) {
    for (const part of payload.parts) {
      if (!part || !part.mimeType) continue;
      if (part.mimeType === 'text/plain') {
        const text = extractBody(part);
        if (text) return text;
      }
    }

    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }

  return '';
}

function trimContent(content, maxLength = 5000) {
  if (!content) return '';
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength);
}

module.exports = {
  decodeBase64Url,
  extractBody,
  trimContent
};

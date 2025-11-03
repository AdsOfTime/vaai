const OpenAI = require('openai');
const { trimContent } = require('../utils/emailContent');

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const DEFAULT_TONE_MAP = {
  friendly: 'friendly and warm',
  urgent: 'concise and urgent',
  formal: 'professional and succinct'
};

async function generateFollowUpDraft({
  userName,
  counterpartName,
  subject,
  lastMessageSnippet,
  contextSummary,
  tone = 'friendly',
  idleDays = 3
}) {
  const toneDescription = DEFAULT_TONE_MAP[tone] || DEFAULT_TONE_MAP.friendly;

  if (!openaiClient) {
    const fallbackSubject = subject?.startsWith('Re:') ? subject : `Re: ${subject || 'Checking in'}`;
    const fallbackBody = [
      `Hi ${counterpartName || 'there'},`,
      '',
      `Just checking in on this — let me know if you need anything else from me.`,
      '',
      `Thanks,`,
      userName || 'Thanks'
    ].join('\n');

    return {
      subject: fallbackSubject,
      body: fallbackBody,
      tone
    };
  }

  const prompt = `
You are an executive assistant drafting a follow-up email.
Tone should be ${toneDescription}. The email should be short (2-3 paragraphs), polite, and make it easy for the recipient to respond.

Details:
- Sender name: ${userName || 'Unknown'}
- Recipient name: ${counterpartName || 'Unknown'}
- Days since last message: ${idleDays}
- Thread subject: ${subject || 'N/A'}

Latest context:
${trimContent(contextSummary || lastMessageSnippet || 'No additional context', 600)}

Draft a follow-up email body only (no subject line). Keep it under 150 words.
`;

  const completion = await openaiClient.chat.completions.create({
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
        content: prompt
      }
    ]
  });

  const body = completion.choices[0]?.message?.content?.trim();

  const generatedSubject = subject?.startsWith('Re:')
    ? subject
    : subject
      ? `Re: ${subject}`
      : 'Quick follow-up';

  return {
    subject: generatedSubject,
    body: body || `Hi ${counterpartName || 'there'},\n\nJust checking in.\n\nThanks,\n${userName || ''}`.trim(),
    tone
  };
}

module.exports = {
  generateFollowUpDraft
};

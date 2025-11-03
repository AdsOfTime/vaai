const OpenAI = require('openai');

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

async function classifyEmail(emailContent) {
  if (!openaiClient) {
    console.warn('OpenAI not configured, using basic classification');

    const subject = emailContent.subject?.toLowerCase() || '';
    const from = emailContent.from?.toLowerCase() || '';

    if (from.includes('noreply') || from.includes('newsletter')) return 'Newsletter';
    if (subject.includes('receipt') || subject.includes('order')) return 'Receipt';
    if (subject.includes('work') || from.includes('company.com')) return 'Work';
    return 'Personal';
  }

  try {
    const prompt = `
    Classify this email into one of these categories: Work, Personal, Newsletter, Receipt, Promotion, Social, Spam, Important.
    
    Email content:
    Subject: ${emailContent.subject}
    From: ${emailContent.from}
    Body: ${emailContent.body?.substring(0, 500)}...
    
    Respond with just the category name.
    `;

    const response = await openaiClient.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10,
      temperature: 0.1
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('AI classification error:', error);
    return 'Uncategorized';
  }
}

module.exports = {
  classifyEmail
};

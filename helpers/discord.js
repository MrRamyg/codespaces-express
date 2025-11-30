/**
 * helpers/discord.js
 */

async function sendWebhook(webhookUrl, content, options = {}) {
  try {
    // Dynamic import for node-fetch ESM
    const fetch = (await import('node-fetch')).default;

    const body = {
      content,
      embeds: options.embeds || []
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Failed to send webhook: ${response.statusText}`);
    }

    console.log('Discord webhook sent successfully');
  } catch (error) {
    console.error('Error sending Discord webhook:', error);
  }
}

module.exports = { sendWebhook };

const nodemailer = require('nodemailer');

// Create a reusable transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'false',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * Send an email
 * @param {string} to - recipient email
 * @param {string} subject - email subject
 * @param {string} text - plain text body
 * @param {string} html - optional html body
 */
async function sendMail({ to, subject, text, html }) {
  try {
    const info = await transporter.sendMail({
      from: `"Nexfinity Hosting" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html
    });
    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Failed to send email:', error);
    throw error;
  }
}

module.exports = {
  sendMail
};

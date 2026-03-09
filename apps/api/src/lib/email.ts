import nodemailer from 'nodemailer';
import { emailBreaker } from './circuit-breaker.js';
import { logger } from './logger.js';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

/**
 * Sends an email using Nodemailer transport wrapped in a circuit breaker.
 */
export async function sendEmail(to: string, subject: string, htmlContent: string) {
  return emailBreaker.fire(async () => {
    try {
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || '"CCMP Notifications" <noreply@ccmp.com>',
        to,
        subject,
        html: htmlContent,
      });

      logger.info({ messageId: info.messageId, to, subject }, 'Email sent successfully');
      return info;
    } catch (error: any) {
      logger.error({ error, to, subject }, 'Failed to send email');
      throw error;
    }
  });
}

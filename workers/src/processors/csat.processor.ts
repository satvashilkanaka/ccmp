import { Worker, Job } from 'bullmq';
import { prismaWrite, prismaRead } from '@ccmp/database';
import { logger } from '../logger.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
import nodemailer from 'nodemailer';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Setup highly mockable generic transporter natively 
// In a real environment, this connects to SES, SendGrid, etc.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  auth: {
    user: process.env.SMTP_USER || 'mock',
    pass: process.env.SMTP_PASS || 'mock',
  },
});

export const csatWorker = new Worker(
  'csat',
  async (job: Job) => {
    const { caseId, customerEmail } = job.data;
    
    if (!caseId || !customerEmail) {
      logger.error('CSAT job missing distinct identities. Terminating safely.');
      return;
    }

    try {
      // 1. Verify we haven't already generated one implicitly bounds checking idempotency
      const existing = await prismaRead.csatResponse.findUnique({
        where: { caseId },
      });

      if (existing) {
        logger.info({ caseId }, 'CSAT already provisioned for this case. Skipping.');
        return;
      }

      // 2. Generation of specific HS256 Token natively
      const secret = process.env.CSAT_TOKEN_SECRET || 'fallback_secret_for_tests';
      
      const token = jwt.sign(
        { caseId, type: 'csat' },
        secret,
        { expiresIn: '7d', algorithm: 'HS256' }
      );

      // 3. Pre-create the distinct survey row mapping strictly to the case
      const decoded = jwt.decode(token) as { exp: number };
      const expiresAt = new Date(decoded.exp * 1000);

      await prismaWrite.csatResponse.create({
        data: {
          caseId,
          token,
          score: 0, // baseline
          expiresAt,
        },
      });

      // 4. Construct link and Dispatch strictly to nodemailer
      const appUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const surveyUrl = `${appUrl}/survey/${token}`;

      await transporter.sendMail({
        from: '"CCMP Support" <support@ccmp.local>',
        to: customerEmail,
        subject: 'How did we do? Tell us about your recent support experience!',
        text: `Your case has been closed. Please let us know how we did by visiting: ${surveyUrl}`,
        html: `
          <p>Your case has been closed.</p>
          <p>Please let us know how we did by clicking the link below:</p>
          <a href="${surveyUrl}">Take our 1-minute survey</a>
        `,
      });

      logger.info({ caseId, customerEmail }, 'Successfully issued CSAT delivery');
    } catch (err: any) {
      logger.error({ err, caseId }, 'Failed processing CSAT automated trigger');
      throw err; // bubble up for BullMQ retries
    }
  },
  { 
    connection: { url: redisUrl },
    concurrency: 5
  }
);

csatWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'CSAT Job cleanly completed');
});

csatWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'CSAT Job failed processing execution');
});

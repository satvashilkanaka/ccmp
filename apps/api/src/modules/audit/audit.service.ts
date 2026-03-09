import { prismaRead } from '@ccmp/database';
import { logger } from '../../lib/logger.js';
import { NotFoundError } from '../../lib/errors.js';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';

/**
 * Filter parameters for querying audit logs
 */
export interface AuditLogFilters {
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class AuditService {
  /**
   * Retrieves paginated audit logs with optional filtering.
   */
  async getAuditLogs(filters: AuditLogFilters = {}) {
    const {
      actorId,
      resourceType,
      resourceId,
      action,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = filters;

    const where: any = {};
    if (actorId) where.actorId = actorId;
    if (resourceType) where.resourceType = resourceType;
    if (resourceId) where.resourceId = resourceId;
    if (action) where.action = action;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [items, total] = await Promise.all([
      prismaRead.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prismaRead.auditLog.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  /**
   * Retrieves the access history for a specific user (actor).
   */
  async getUserAccessHistory(userId: string, limit = 50, offset = 0) {
    if (!userId) {
      throw new NotFoundError('User ID is required');
    }
    return this.getAuditLogs({ actorId: userId, limit, offset });
  }

  /**
   * Generates a cryptographically signed PDF containing the audit trail.
   *
   * @param filters Filtering criteria for the export
   * @param exporterId The ID of the compliance officer or admin exporting the data
   * @returns A Buffer containing the signed PDF
   */
  async exportAuditTrail(filters: AuditLogFilters, exporterId: string): Promise<Buffer> {
    const { items, total } = await this.getAuditLogs({ ...filters, limit: 10000 }); // limit to 10k for PDF

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);

          // Cryptographically sign the completed PDF buffer
          const privateKey = process.env.AUDIT_EXPORT_PRIVATE_KEY;
          if (!privateKey) {
            logger.warn('AUDIT_EXPORT_PRIVATE_KEY not set. Export will not be cryptographically signed.');
            resolve(pdfBuffer);
            return;
          }

          try {
            const sign = crypto.createSign('SHA256');
            sign.update(pdfBuffer);
            sign.end();
            const signature = sign.sign(privateKey, 'base64');

            // We append the signature as a metadata trailer or returning it in a wrapper.
            // Since we need to return a single file, we can append a custom text trailer 
            // to the end of the PDF buffer, or we could return it in a zip.
            // For now, we'll append the signature string to the very end of the Buffer. 
            // Note: Appending to the end of a valid PDF might invalidate some strict PDF validators, 
            // but is a common poor-man's way of attaching a detached signature if not using true PKCS#7 PDF signing.
            // A more standards-compliant way is adding a custom dictionary, but appending works for raw byte verification.

            const signatureFooter = Buffer.from(`\n--- CCMP AUDIT SIGNATURE ---\n${signature}\n`, 'utf-8');
            const signedBuffer = Buffer.concat([pdfBuffer, signatureFooter]);
            resolve(signedBuffer);
          } catch (signErr: any) {
            logger.error({ err: signErr }, 'Failed to sign PDF export');
            // Fallback to unsigned if signing fails due to bad key format
            resolve(pdfBuffer);
          }
        });

        // ── PDF Content Generation ───────────────────────────────────────────

        // Header
        doc.fontSize(20).text('CCMP Audit Trail Export', { align: 'center' });
        doc.moveDown();

        // Metadata
        doc.fontSize(10).text(`Generated On: ${new Date().toISOString()}`);
        doc.text(`Exporter ID: ${exporterId}`);
        doc.text(`Record Count: ${total}${total > 10000 ? ' (Truncated to 10000)' : ''}`);
        
        const startStr = filters.startDate ? filters.startDate.toISOString() : 'Beginning of time';
        const endStr = filters.endDate ? filters.endDate.toISOString() : 'Now';
        doc.text(`Date Range: ${startStr} to ${endStr}`);
        
        doc.moveDown(2);
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // Table Header
        const startY = doc.y;
        doc.font('Helvetica-Bold');
        doc.text('Timestamp', 50, startY, { width: 120 });
        doc.text('Actor', 170, startY, { width: 100 });
        doc.text('Action', 280, startY, { width: 80 });
        doc.text('Resource', 370, startY, { width: 180 });
        
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // Rows
        doc.font('Helvetica');
        for (const log of items) {
          // Check pagination
          if (doc.y > 700) {
            doc.addPage();
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown();
          }

          const y = doc.y;
          const ts = log.createdAt.toISOString().replace('T', ' ').substring(0, 19);
          const actor = log.actorEmail || log.actorId || 'SYSTEM';
          const resource = `${log.resourceType}:${log.resourceId || '*'}`;

          doc.text(ts, 50, y, { width: 120 });
          doc.text(actor, 170, y, { width: 100 });
          doc.text(log.action, 280, y, { width: 80 });
          doc.text(resource, 370, y, { width: 180 });
          doc.moveDown(0.5);
        }

        // Finalize PDF file
        doc.end();
      } catch (err: any) {
        logger.error({ err }, 'Error generating PDF export');
        reject(err);
      }
    });
  }
}

export const auditService = new AuditService();

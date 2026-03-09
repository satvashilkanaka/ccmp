/**
 * MinIO bucket setup script — idempotent.
 * Run once on environment initialization.
 * Sets AES-256 SSE and 90-day expiration lifecycle on ccmp-recordings bucket.
 */
import {
  S3Client,
  CreateBucketCommand,
  PutBucketEncryptionCommand,
  PutBucketLifecycleConfigurationCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';

const BUCKET = process.env.MINIO_RECORDINGS_BUCKET || 'ccmp-recordings';
const ENDPOINT = `http://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || '9000'}`;
const RETENTION_DAYS = parseInt(process.env.RECORDING_RETENTION_DAYS || '90', 10);

const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER || 'ccmp_admin',
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD || 'minio_password123',
  },
  forcePathStyle: true, // Required for MinIO
});

async function bucketExists(bucket: string): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch {
    return false;
  }
}

async function setup() {
  console.log(`Setting up MinIO bucket: ${BUCKET} at ${ENDPOINT}`);

  // 1. Create bucket (idempotent)
  if (await bucketExists(BUCKET)) {
    console.log(`Bucket "${BUCKET}" already exists — skipping creation.`);
  } else {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`Created bucket: ${BUCKET}`);
  }

  // 2. Apply AES-256 Server-Side Encryption
  try {
    await s3.send(
      new PutBucketEncryptionCommand({
        Bucket: BUCKET,
        ServerSideEncryptionConfiguration: {
          Rules: [
            {
              ApplyServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
              BucketKeyEnabled: true,
            },
          ],
        },
      }),
    );
    console.log('Applied AES-256 SSE encryption.');
  } catch (err: any) {
    console.warn('Skipping AES-256 SSE encryption (not supported in this environment).');
  }

  // 3. Set 90-day expiration lifecycle rule
  await s3.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: BUCKET,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: 'ccmp-recordings-retention',
            Status: 'Enabled',
            Filter: { Prefix: '' },
            Expiration: { Days: RETENTION_DAYS },
          },
        ],
      },
    }),
  );
  console.log(`Applied ${RETENTION_DAYS}-day expiration lifecycle rule.`);

  console.log('MinIO setup complete.');
}

setup().catch((err) => {
  console.error('MinIO setup failed:', err);
  process.exit(1);
});

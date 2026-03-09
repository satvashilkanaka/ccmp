import { logger } from './apps/api/src/lib/logger.js';

console.log('Testing PII Logger\n');

logger.info({
  safeData: 'This is normal text',
  email: 'test.user+spam@domain.co.uk',
  creditCard: '1234567890123456',
  phone: '+14155552671',
  ssn: '123-45-6789',
}, 'Incoming payload with PII');

setTimeout(() => process.exit(0), 100);

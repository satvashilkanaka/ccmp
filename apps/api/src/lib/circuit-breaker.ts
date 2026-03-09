import CircuitBreaker from 'opossum';

const options = {
  errorThresholdPercentage: 50,
  timeout: 3000,
  resetTimeout: 30_000,
};

/**
 * Circuit Breaker for FreeSWITCH/ESL interactions
 */
export const eslBreaker = new CircuitBreaker(
  async (fn: (...args: any[]) => Promise<any>) => fn(),
  options
);

/**
 * Circuit Breaker for Email service interactions
 */
export const emailBreaker = new CircuitBreaker(
  async (fn: (...args: any[]) => Promise<any>) => fn(),
  options
);

/**
 * Circuit Breaker for MinIO/Storage interactions
 */
export const minioBreaker = new CircuitBreaker(
  async (fn: (...args: any[]) => Promise<any>) => fn(),
  options
);

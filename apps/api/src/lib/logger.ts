import pino from 'pino';

// PII scrubbing serialiser
const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,  // email
  /\b\d{16}\b/g,                                          // 16-digit credit card
  /\+[1-9]\d{1,14}\b/g,                                   // E.164 phone
  /\b\d{3}-\d{2}-\d{4}\b/g,                               // SSN
];

function scrubPii(value: string): string {
  let result = value;
  PII_PATTERNS.forEach(pattern => { result = result.replace(pattern, '[REDACTED]'); });
  return result;
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  serializers: {
    err: pino.stdSerializers.err,
    req: (req) => ({ method: req.method, url: req.url, id: req.id }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  formatters: {
    log: (obj) => {
      let cache: any[] | null = [];
      const str = JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (cache!.includes(value)) return '[Circular]';
          cache!.push(value);
        }
        return value;
      });
      cache = null;
      return JSON.parse(scrubPii(str));
    },
  },
});

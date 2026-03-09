import swaggerJsdoc from 'swagger-jsdoc';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const p1 = resolve(__dirname, 'src/modules/**/*.router.ts').replace(/\\/g, '/');
console.log('Globbing:', p1);

const options = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'Test', version: '1.0.0' },
  },
  apis: [p1],
};

const spec = swaggerJsdoc(options);
console.log(JSON.stringify(spec, null, 2));

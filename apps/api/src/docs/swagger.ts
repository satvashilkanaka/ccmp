import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const options = {
  definition: {
    openapi: '3.0.0',
    info: { 
      title: 'CCMP API', 
      version: '1.0.0', 
      description: 'Contact Centre Management Platform' 
    },
    components: { 
      securitySchemes: { 
        bearerAuth: { 
          type: 'http', 
          scheme: 'bearer', 
          bearerFormat: 'JWT' 
        } 
      } 
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [
    resolve(__dirname, '../modules/**/*.router.ts').replace(/\\/g, '/'),
    resolve(__dirname, '../app.ts').replace(/\\/g, '/')
  ],
};

export function setupDocs(app: Application) {
  const spec = swaggerJsdoc(options);
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec));
  app.get('/api/docs.json', (_req, res) => res.json(spec));
}

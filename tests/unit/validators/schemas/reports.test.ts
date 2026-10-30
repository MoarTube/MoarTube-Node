import { expect, it } from 'vitest';
import Fastify from 'fastify';
import { validatorCompiler } from 'fastify-type-provider-zod';
import { reportsQuerySchema } from '../../../../src/validators/schemas/reports.js';

it.each(['videos', 'comments', 'archive/videos', 'archive/comments'])(
  'preserves search and pagination after HTTP validation for reports/%s', async (kind) => {
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.get('/reports/' + kind, { schema: { querystring: reportsQuerySchema } }, (request, reply) => reply.send(request.query));
    try {
      const response = await app.inject({ method: 'GET', url: '/reports/' + kind, query: { search: 'unmatched report', limit: '101', offset: '100' } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ search: 'unmatched report', limit: 101, offset: 100 });
      expect((await app.inject('/reports/' + kind)).statusCode).toBe(200);
      expect((await app.inject('/reports/' + kind + '?offset=-1')).statusCode).toBe(400);
    } finally { await app.close(); }
  }
);

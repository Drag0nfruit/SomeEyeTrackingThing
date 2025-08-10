import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };
  });

  fastify.get('/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    // Add database health check here when Prisma is set up
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      services: {
        database: 'ok' // This will be dynamic once Prisma is connected
      }
    };
  });
} 
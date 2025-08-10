import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import healthRoutes from './routes/health';
import sessionRoutes from './routes/sessions';
import pointsRoutes from './routes/points';
import exportRoutes from './routes/export';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    }
  }
});

// Register plugins
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  credentials: true
});

await fastify.register(helmet);

// Register routes
await fastify.register(healthRoutes, { prefix: '/health' });
await fastify.register(sessionRoutes, { prefix: '/sessions' });
await fastify.register(pointsRoutes, { prefix: '/sessions' });
await fastify.register(exportRoutes);

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  fastify.log.info(`Received ${signal}. Starting graceful shutdown...`);
  await fastify.close();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000');
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    fastify.log.info(`Server listening on ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
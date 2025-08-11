import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../prisma';



interface SessionParams {
  id: string;
}

interface CreateSessionBody {
  deviceInfo?: string;
  samplingRate: number;
  calibLeft: number;
  calibCenter: number;
  calibRight: number;
}

export default async function sessionRoutes(fastify: FastifyInstance) {

  // POST /sessions - Create a new session
  fastify.post<{ Body: CreateSessionBody }>('/', async (request: FastifyRequest<{ Body: CreateSessionBody }>, reply: FastifyReply) => {
    try {
      const { deviceInfo, samplingRate, calibLeft, calibCenter, calibRight } = request.body;
      
      // Validate required fields
      if (typeof samplingRate !== 'number' || samplingRate <= 0) {
        return reply.status(400).send({ error: 'samplingRate must be a positive number' });
      }
      if (typeof calibLeft !== 'number' || typeof calibCenter !== 'number' || typeof calibRight !== 'number') {
        return reply.status(400).send({ error: 'calibLeft, calibCenter, and calibRight must be numbers' });
      }
      
      // Validate calibration values are within -1 to +1 range
      if (calibLeft < -1 || calibLeft > 1 || calibCenter < -1 || calibCenter > 1 || calibRight < -1 || calibRight > 1) {
        return reply.status(422).send({ error: 'Calibration values must be between -1 and +1' });
      }
      
      // Validate calibration order: left < center < right
      if (calibLeft >= calibCenter || calibCenter >= calibRight) {
        return reply.status(422).send({ error: 'Calibration values must be in order: left < center < right' });
      }
      
      const session = await prisma.session.create({
        data: {
          deviceInfo: deviceInfo || 'Unknown Device',
          samplingRate,
          calibLeft,
          calibCenter,
          calibRight
        }
      });
      
      fastify.log.info(`Created new session: ${session.id}`);
      return reply.status(201).send({ id: session.id });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to create session' });
    }
  });

  // GET /sessions/:id - Get a specific session
  fastify.get<{ Params: SessionParams; Querystring: { includeSamples?: string } }>('/:id', async (request: FastifyRequest<{ Params: SessionParams; Querystring: { includeSamples?: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { includeSamples } = request.query;
      
      const includeSamplesBool = includeSamples === '1' || includeSamples === 'true';
      
      const session = await prisma.session.findUnique({
        where: { id },
        include: {
          samples: includeSamplesBool ? {
            select: {
              id: true,
              ts: true,
              xRaw: true,
              xFiltered: true,
              confidence: true
            }
          } : false
        }
      });
      
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      
      // Convert BigInt timestamps to numbers for UI compatibility, this will break if not converted
      const serializedSession = {
        ...session,
        samples: includeSamplesBool ? session.samples.map((sample: any) => ({
          ...sample,
          ts: Number(sample.ts) // Convert BigInt to number for UI
        })) : undefined
      };
      
      return reply.send(serializedSession);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to retrieve session' });
    }
  });

  // GET /sessions - List all sessions
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sessions = await prisma.session.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { samples: true }
          }
        }
      });
      
      return reply.send(sessions);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to retrieve sessions' });
    }
  });

  // DELETE /sessions/:id - Delete a session and all its samples
  fastify.delete<{ Params: SessionParams }>('/:id', async (request: FastifyRequest<{ Params: SessionParams }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      
      // Check if session exists
      const session = await prisma.session.findUnique({
        where: { id }
      });
      
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      
      // Delete the session (samples will be automatically deleted due to CASCADE)
      await prisma.session.delete({
        where: { id }
      });
      
      fastify.log.info(`Deleted session ${id} and all its samples`);
      return reply.status(200).send({ 
        message: 'Session deleted successfully',
        sessionId: id
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to delete session' });
    }
  });
} 
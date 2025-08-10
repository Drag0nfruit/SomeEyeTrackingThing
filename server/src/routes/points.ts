import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PrismaClient } from '../../../node_modules/@prisma/client';

const prisma = new PrismaClient();

interface SessionParams {
  id: string;
}

interface Point {
  ts: number;
  x: number;
  confidence?: number;
}

interface CreatePointsBody {
  points: Point[];
}

// Simple moving average filter for eye tracking data
function applyMovingAverageFilter(points: Point[], windowSize: number = 5): Point[] {
  if (points.length === 0) return [];
  
  const filtered: Point[] = [];
  
  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(points.length, i + Math.floor(windowSize / 2) + 1);
    
    const window = points.slice(start, end);
    const sum = window.reduce((acc, p) => acc + p.x, 0);
    const average = sum / window.length;
    
    filtered.push({
      ts: points[i].ts,
      x: average,
      confidence: points[i].confidence
    });
  }
  
  return filtered;
}

export default async function pointsRoutes(fastify: FastifyInstance) {
  // POST /sessions/:id/points - Add multiple data points to a session
  fastify.post<{ Params: SessionParams; Body: CreatePointsBody }>('/:id/points', async (request: FastifyRequest<{ Params: SessionParams; Body: CreatePointsBody }>, reply: FastifyReply) => {
    try {
      const { id: sessionId } = request.params;
      const { points } = request.body;
      
      // Validate input
      if (!Array.isArray(points) || points.length === 0) {
        return reply.status(400).send({ error: 'points array is required and must not be empty' });
      }
      
      // Validate each point
      for (const point of points) {
        if (typeof point.x !== 'number') {
          return reply.status(400).send({ error: 'Each point must have a numeric x value' });
        }
        if (typeof point.ts !== 'number') {
          return reply.status(400).send({ error: 'Each point must have a numeric ts (timestamp) value' });
        }
      }
      
      // Check if session exists
      const session = await prisma.session.findUnique({
        where: { id: sessionId }
      });
      
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      
      // Apply moving average filter to compute filtered values
      const filteredPoints = applyMovingAverageFilter(points);
      
      // Prepare data for bulk insertion
      const samplesData = points.map((point, index) => ({
        sessionId,
        ts: BigInt(point.ts),
        xRaw: point.x,
        xFiltered: filteredPoints[index].x,
        confidence: point.confidence
      }));
      
      // Insert all points in a transaction
      const createdSamples = await prisma.$transaction(async (tx: any) => {
        return await tx.sample.createMany({
          data: samplesData
        });
      });
      
      return reply.status(201).send({ 
        message: `Successfully inserted ${createdSamples.count} points`,
        count: createdSamples.count
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to create data points' });
    }
  });

  // GET /sessions/:id/points - Get filtered points for playback
  fastify.get<{ Params: SessionParams }>('/:id/points', async (request: FastifyRequest<{ Params: SessionParams }>, reply: FastifyReply) => {
    try {
      const { id: sessionId } = request.params;
      
      // Check if session exists
      const session = await prisma.session.findUnique({
        where: { id: sessionId }
      });
      
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      
      const samples = await prisma.sample.findMany({
        where: { sessionId },
        orderBy: { ts: 'asc' },
        select: {
          ts: true,
          xRaw: true,
          xFiltered: true,
          confidence: true
        }
      });
      
      // Return filtered points for playback
      const filteredPoints = samples.map((sample: any) => ({
        ts: sample.ts.toString(),
        x: sample.xFiltered || sample.xRaw, // Use filtered value if available, fallback to raw
        confidence: sample.confidence
      }));
      
      return reply.send(filteredPoints);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to retrieve data points' });
    }
  });
} 
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

// Enhanced signal processing with multiple filters
class SignalProcessor {
  private static readonly MOVING_AVERAGE_WINDOW = 5;
  private static readonly OUTLIER_THRESHOLD = 0.1;
  private static readonly MIN_CONFIDENCE = 0.1; // Reduced from 0.3 to be less aggressive

  // Moving average filter for smoothing
  static applyMovingAverageFilter(points: Point[], windowSize: number = this.MOVING_AVERAGE_WINDOW): Point[] {
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

  // Outlier detection and removal
  static removeOutliers(points: Point[], threshold: number = this.OUTLIER_THRESHOLD): Point[] {
    if (points.length < 3) return points;
    
    const filtered = [points[0]];
    
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1].x;
      const curr = points[i].x;
      const next = points[i + 1].x;
      
      const diff1 = Math.abs(curr - prev);
      const diff2 = Math.abs(curr - next);
      
      if (diff1 < threshold && diff2 < threshold) {
        filtered.push(points[i]);
      }
    }
    
    if (points.length > 1) {
      filtered.push(points[points.length - 1]);
    }
    
    return filtered;
  }

  // Confidence-based filtering
  static filterByConfidence(points: Point[], minConfidence: number = this.MIN_CONFIDENCE): Point[] {
    return points.filter(point => (point.confidence || 1.0) >= minConfidence);
  }

  // Normalize X position to -1 to +1 range
  static normalizeX(x: number): number {
    return Math.max(-1, Math.min(1, x));
  }

  // Process points through the complete pipeline
  static processPoints(points: Point[]): Point[] {
    if (points.length === 0) return [];

    // Step 1: Filter by confidence
    let processed = this.filterByConfidence(points);
    
    // Step 2: Remove outliers
    processed = this.removeOutliers(processed);
    
    // Step 3: Apply moving average
    processed = this.applyMovingAverageFilter(processed);
    
    // Step 4: Normalize X values
    processed = processed.map(point => ({
      ...point,
      x: this.normalizeX(point.x)
    }));

    return processed;
  }
}

export default async function pointsRoutes(fastify: FastifyInstance) {
  // POST /sessions/:id/points - Add multiple data points to a session (streaming)
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
        if (typeof point.x !== 'number' || isNaN(point.x)) {
          return reply.status(400).send({ error: 'Each point must have a valid numeric x value' });
        }
        if (typeof point.ts !== 'number' || point.ts <= 0) {
          return reply.status(400).send({ error: 'Each point must have a valid positive ts (timestamp) value' });
        }
        if (point.confidence !== undefined && (typeof point.confidence !== 'number' || point.confidence < 0 || point.confidence > 1)) {
          return reply.status(400).send({ error: 'Confidence must be a number between 0 and 1' });
        }
      }
      
      // Check if session exists and is active
      const session = await prisma.session.findUnique({
        where: { id: sessionId }
      });
      
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      
      // Process points through signal processing pipeline
      const processedPoints = SignalProcessor.processPoints(points);
      
      console.log(`Processing ${points.length} points for session ${sessionId}:`, {
        original: points.length,
        afterProcessing: processedPoints.length,
        confidenceFiltered: points.length - processedPoints.length
      });
      
      // Prepare data for bulk insertion with better error handling
      const samplesData = processedPoints.map((point) => ({
        sessionId,
        ts: BigInt(point.ts),
        xRaw: point.x,
        xFiltered: point.x, // Processed value
        confidence: point.confidence || null
      }));
      
      // Insert points in batches for better performance
      const batchSize = 100;
      let totalInserted = 0;
      
      console.log(`Inserting ${samplesData.length} processed points in batches of ${batchSize}`);
      
      for (let i = 0; i < samplesData.length; i += batchSize) {
        const batch = samplesData.slice(i, i + batchSize);
        
        try {
          const result = await prisma.sample.createMany({
            data: batch
          });
          totalInserted += result.count;
          console.log(`Batch ${i / batchSize + 1}: Inserted ${result.count} points`);
        } catch (error) {
          console.error(`Error inserting batch ${i / batchSize + 1}:`, error);
          // Continue with next batch instead of failing completely
        }
      }
      
      // Update session metadata if needed
      if (totalInserted > 0) {
        await prisma.session.update({
          where: { id: sessionId },
          data: {
            // You could add fields like lastActivity, sampleCount, etc.
          }
        });
      }
      
      return reply.status(201).send({ 
        message: `Successfully processed and inserted ${totalInserted} points`,
        count: totalInserted,
        processed: processedPoints.length,
        original: points.length
      });
    } catch (error) {
      console.error('Error in points endpoint:', error);
      return reply.status(500).send({ error: 'Failed to process data points' });
    }
  });

  // GET /sessions/:id/points - Get filtered points for playback with pagination
  fastify.get<{ Params: SessionParams; Querystring: { limit?: string; offset?: string; format?: string } }>('/:id/points', async (request: FastifyRequest<{ Params: SessionParams; Querystring: { limit?: string; offset?: string; format?: string } }>, reply: FastifyReply) => {
    try {
      const { id: sessionId } = request.params;
      const { limit = '1000', offset = '0', format = 'filtered' } = request.query;
      
      const limitNum = Math.min(parseInt(limit), 10000); // Max 10k points per request
      const offsetNum = parseInt(offset);
      
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
        take: limitNum,
        skip: offsetNum,
        select: {
          ts: true,
          xRaw: true,
          xFiltered: true,
          confidence: true
        }
      });
      
      // Return points based on requested format
      const responsePoints = samples.map((sample: any) => {
        const basePoint = {
          ts: sample.ts.toString(), // Ensure BigInt is converted to string
          confidence: sample.confidence
        };
        
        if (format === 'raw') {
          return { ...basePoint, x: sample.xRaw };
        } else if (format === 'both') {
          return { ...basePoint, xRaw: sample.xRaw, xFiltered: sample.xFiltered };
        } else {
          // Default: filtered
          return { ...basePoint, x: sample.xFiltered || sample.xRaw };
        }
      });
      
      // Get total count for pagination
      const totalCount = await prisma.sample.count({
        where: { sessionId }
      });
      
      return reply.send({
        points: responsePoints,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < totalCount
        },
        session: {
          id: session.id,
          createdAt: session.createdAt,
          deviceInfo: session.deviceInfo,
          samplingRate: session.samplingRate
        }
      });
    } catch (error) {
      console.error('Error retrieving points:', error);
      return reply.status(500).send({ error: 'Failed to retrieve data points' });
    }
  });

  // GET /sessions/:id/points/stats - Get session statistics
  fastify.get<{ Params: SessionParams }>('/:id/points/stats', async (request: FastifyRequest<{ Params: SessionParams }>, reply: FastifyReply) => {
    try {
      const { id: sessionId } = request.params;
      
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          _count: { select: { samples: true } }
        }
      });
      
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      
      // Get basic statistics
      const stats = await prisma.sample.aggregate({
        where: { sessionId },
        _count: { xRaw: true },
        _min: { xRaw: true, xFiltered: true },
        _max: { xRaw: true, xFiltered: true },
        _avg: { xRaw: true, xFiltered: true }
      });
      
      // Get time range
      const timeRange = await prisma.sample.aggregate({
        where: { sessionId },
        _min: { ts: true },
        _max: { ts: true }
      });
      
      const duration = timeRange._max.ts && timeRange._min.ts 
        ? Number(timeRange._max.ts - timeRange._min.ts) / 1000 // Convert to seconds
        : 0;
      
      return reply.send({
        sessionId,
        totalPoints: stats._count.xRaw,
        duration: Math.round(duration * 100) / 100, // Round to 2 decimal places
        timeRange: {
          start: timeRange._min.ts?.toString(), // Convert BigInt to string
          end: timeRange._max.ts?.toString() // Convert BigInt to string
        },
        statistics: {
          raw: {
            min: stats._min.xRaw,
            max: stats._max.xRaw,
            average: stats._avg.xRaw
          },
          filtered: {
            min: stats._min.xFiltered,
            max: stats._max.xFiltered,
            average: stats._avg.xFiltered
          }
        }
      });
    } catch (error) {
      console.error('Error getting session stats:', error);
      return reply.status(500).send({ error: 'Failed to retrieve session statistics' });
    }
  });
} 
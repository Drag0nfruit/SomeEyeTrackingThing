export type ProcessedPoint = {
  ts: number;
  raw: number;
  filtered: number | null;
  confidence?: number;
  isOutlier: boolean;
  quality: number; // 0..1 (combine confidence & outlier penalty)
};

const MOVING_AVG = 5;

function movingAverage(xs: number[], k = MOVING_AVG) {
  const half = Math.floor(k / 2);
  return xs.map((_, i) => {
    const s = Math.max(0, i - half);
    const e = Math.min(xs.length, i + half + 1);
    const win = xs.slice(s, e);
    return win.reduce((a, b) => a + b, 0) / win.length;
  });
}

export function processAligned(points: {ts:number;x:number;confidence?:number}[]): ProcessedPoint[] {
  if (!points.length) return [];
  
  // 1) sort & clamp
  const sorted = [...points].sort((a,b)=>a.ts-b.ts).map(p => ({...p, x: Math.max(-1, Math.min(1, p.x))}));
  
  // 2) smooth (length preserved)
  const smoothed = movingAverage(sorted.map(p => p.x));
  
  // 3) Simple confidence-based filtering
  return sorted.map((p,i) => {
    const isLowConfidence = (p.confidence ?? 1) < 0.1;
    const filtered = isLowConfidence ? (i > 0 ? smoothed[i-1] : smoothed[i]) : smoothed[i];
    const quality = p.confidence ?? 1;
    
    return { 
      ts: p.ts, 
      raw: p.x, 
      filtered, 
      confidence: p.confidence, 
      isOutlier: isLowConfidence, 
      quality 
    };
  });
}

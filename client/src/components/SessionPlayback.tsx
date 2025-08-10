import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import axios from 'axios';

interface Point {
  ts: string;
  x: number;
  confidence?: number;
}

interface Session {
  id: string;
  createdAt: string;
  deviceInfo?: string;
  samplingRate: number;
  calibLeft: number;
  calibCenter: number;
  calibRight: number;
}

interface SessionPlaybackProps {
  sessionId: string;
}

const SessionPlayback: React.FC<SessionPlaybackProps> = ({ sessionId }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [duration, setDuration] = useState(0);
  const [zoomDomain, setZoomDomain] = useState<{ left: string; right: string } | null>(null);
  const [isZooming, setIsZooming] = useState(false);
  const [zoomStart, setZoomStart] = useState<number | null>(null);
  const [zoomEnd, setZoomEnd] = useState<number | null>(null);
  
  const playbackIntervalRef = useRef<number | null>(null);
  const chartRef = useRef<any>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSessionData();
  }, [sessionId]);

  useEffect(() => {
    if (points.length > 0) {
      const startTime = parseInt(points[0].ts);
      const endTime = parseInt(points[points.length - 1].ts);
      setDuration(endTime - startTime);
      setCurrentTime(startTime);
    }
  }, [points]);

  useEffect(() => {
    if (isPlaying && duration > 0) {
      playbackIntervalRef.current = window.setInterval(() => {
        setCurrentTime(prev => {
          const startTime = parseInt(points[0].ts);
          const endTime = parseInt(points[points.length - 1].ts);
          const actualDuration = endTime - startTime;
          
          // Calculate the time increment based on actual duration and playback speed
          const timeIncrement = (actualDuration / 100) * playbackSpeed; // 100ms intervals
          const newTime = prev + timeIncrement;
          
          if (newTime >= endTime) {
            setIsPlaying(false);
            return endTime;
          }
          return newTime;
        });
      }, 100); // Update every 100ms for smooth playback
    } else {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
    }

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, duration, points]);

  const loadSessionData = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('Loading session data for:', sessionId);

      // Load session info
      const sessionResponse = await axios.get(`http://localhost:3000/sessions/${sessionId}`);
      console.log('Session info loaded:', sessionResponse.data);
      setSession(sessionResponse.data);

      // Load points with pagination support
      const pointsResponse = await axios.get(`http://localhost:3000/sessions/${sessionId}/points?limit=10000`);
      console.log('Points response:', pointsResponse.data);
      
      // Handle both old format (array) and new format (paginated object)
      let pointsData;
      if (Array.isArray(pointsResponse.data)) {
        // Old format - direct array
        pointsData = pointsResponse.data;
        console.log('Using old format, points count:', pointsData.length);
      } else {
        // New format - paginated response
        pointsData = pointsResponse.data.points || [];
        console.log('Using new format, points count:', pointsData.length);
      }
      
      setPoints(pointsData);
      console.log('Session data loaded successfully');
      
    } catch (err: any) {
      console.error('Error loading session:', err);
      
      let errorMessage = 'Failed to load session data';
      if (err.response) {
        errorMessage += `: ${err.response.status} - ${err.response.data?.error || 'Unknown error'}`;
      } else if (err.request) {
        errorMessage += ': Network error - please check if the server is running';
      } else {
        errorMessage += `: ${err.message}`;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = async () => {
    try {
      const response = await axios.get(`http://localhost:3000/sessions/${sessionId}/export.csv`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `session-${sessionId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Failed to export CSV:', err);
    }
  };

  // Playback controls
  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };

  const stopPlayback = () => {
    setIsPlaying(false);
    setCurrentTime(parseInt(points[0].ts));
  };

  const resetPlayback = () => {
    setIsPlaying(false);
    setCurrentTime(parseInt(points[0].ts));
  };

  const seekToTime = (time: number) => {
    setCurrentTime(time);
  };

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    const startTime = parseInt(points[0].ts);
    const endTime = parseInt(points[points.length - 1].ts);
    const seekTime = startTime + (value / 100) * (endTime - startTime);
    seekToTime(seekTime);
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPlaybackSpeed(parseFloat(e.target.value));
  };

  // Zoom controls
  const handleZoomStart = (e: any) => {
    if (e && e.activeLabel) {
      setIsZooming(true);
      setZoomStart(parseInt(e.activeLabel));
    }
  };

  const handleZoomMove = (e: any) => {
    if (isZooming && e && e.activeLabel) {
      setZoomEnd(parseInt(e.activeLabel));
    }
  };

  const handleZoomEnd = () => {
    if (isZooming && zoomStart !== null && zoomEnd !== null) {
      const left = Math.min(zoomStart, zoomEnd);
      const right = Math.max(zoomStart, zoomEnd);
      setZoomDomain({ left: left.toString(), right: right.toString() });
    }
    setIsZooming(false);
    setZoomStart(null);
    setZoomEnd(null);
  };

  const resetZoom = () => {
    setZoomDomain(null);
  };

  const formatTime = (timestamp: number | string) => {
    const numTimestamp = typeof timestamp === 'string' ? parseInt(timestamp) : timestamp;
    const date = new Date(numTimestamp);
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit'
    });
  };

  const getCurrentScrubberValue = () => {
    if (points.length === 0) return 0;
    const startTime = parseInt(points[0].ts);
    const endTime = parseInt(points[points.length - 1].ts);
    return ((currentTime - startTime) / (endTime - startTime)) * 100;
  };

  const getCurrentSampleIndex = () => {
    if (points.length === 0) return 0;
    
    // Find the closest point to current time
    let closestIndex = 0;
    let minDiff = Math.abs(parseInt(points[0].ts) - currentTime);
    
    for (let i = 0; i < points.length; i++) {
      const diff = Math.abs(parseInt(points[i].ts) - currentTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    
    return closestIndex;
  };

  const getCurrentXValue = () => {
    if (points.length === 0) return 0;
    
    // Find the closest point to current time
    let closestPoint = points[0];
    let minDiff = Math.abs(parseInt(points[0].ts) - currentTime);
    
    for (const point of points) {
      const diff = Math.abs(parseInt(point.ts) - currentTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestPoint = point;
      }
    }
    
    return closestPoint.x;
  };

  const calculateStats = () => {
    if (points.length === 0) return null;

    const velocities: number[] = [];
    const movements: number[] = [];
    
    // Calculate velocities and movements
    for (let i = 1; i < points.length; i++) {
      const dt = parseInt(points[i].ts) - parseInt(points[i - 1].ts);
      const dx = points[i].x - points[i - 1].x;
      if (dt > 0) {
        velocities.push(Math.abs(dx / dt));
        movements.push(Math.abs(dx));
      }
    }

    // Calculate movement frequency (significant movements per second)
    const movementThreshold = 0.1; // threshold for significant movement
    let movementCount = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = Math.abs(points[i].x - points[i - 1].x);
      if (dx > movementThreshold) {
        movementCount++;
      }
    }

    const totalTime = (parseInt(points[points.length - 1].ts) - parseInt(points[0].ts)) / 1000;
    const movementFrequency = totalTime > 0 ? movementCount / totalTime : 0;

    return {
      totalPoints: points.length,
      duration: totalTime,
      avgVelocity: velocities.length > 0 ? velocities.reduce((a, b) => a + b, 0) / velocities.length : 0,
      maxVelocity: velocities.length > 0 ? Math.max(...velocities) : 0,
      avgMovement: movements.length > 0 ? movements.reduce((a, b) => a + b, 0) / movements.length : 0,
      movementFrequency: movementFrequency
    };
  };

  if (loading) {
    return (
      <div className="loading">
        <h2>Loading session data...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error">
        <h2>{error}</h2>
        <button onClick={loadSessionData} className="primary-btn">
          Retry
        </button>
      </div>
    );
  }

  if (!session || points.length === 0) {
    return (
      <div className="no-data">
        <h2>No data available for this session</h2>
        <p>This session may be empty or the data may not be accessible.</p>
      </div>
    );
  }

  const stats = calculateStats();

  return (
    <div className="session-playback">
      <div className="session-header">
        <h2>Session: {session.id.slice(0, 8)}...</h2>
        <div className="session-meta">
          <p><strong>Created:</strong> {new Date(session.createdAt).toLocaleString()}</p>
          <p><strong>Device:</strong> {session.deviceInfo || 'Unknown'}</p>
          <p><strong>Sampling Rate:</strong> {session.samplingRate} Hz</p>
        </div>
      </div>

      <div className="playback-controls">
        <div className="playback-buttons">
          <button 
            onClick={togglePlayback}
            className={isPlaying ? 'pause-btn' : 'play-btn'}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button onClick={stopPlayback} className="stop-btn">
            Stop
          </button>
          <button onClick={resetPlayback} className="reset-btn">
            Reset
          </button>
        </div>

        <div className="playback-speed">
          <label>Speed:</label>
          <select value={playbackSpeed.toString()} onChange={handleSpeedChange}>
            <option value="0.25">0.25x</option>
            <option value="0.5">0.5x</option>
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
            <option value="8">8x</option>
          </select>
        </div>

        <div className="zoom-controls">
          <button onClick={resetZoom} className="zoom-btn">
            Reset Zoom
          </button>
        </div>

        <div className="time-display">
          <span>{formatTime(currentTime)}</span>
          <span> / </span>
          <span>{formatTime(parseInt(points[points.length - 1].ts))}</span>
        </div>
      </div>

      <div className="scrubber">
        <input
          type="range"
          min="0"
          max="100"
          value={getCurrentScrubberValue()}
          onChange={handleScrubberChange}
          className="scrubber-slider"
        />
      </div>

      <div className="chart-container" ref={chartContainerRef}>
        <h3>Eye Movement Timeseries</h3>
        
        {/* Current sample info box */}
        <div className="current-sample-info">
          <div className="sample-details">
            <span><strong>Sample:</strong> {getCurrentSampleIndex() + 1} / {points.length}</span>
            <span><strong>Time:</strong> {formatTime(currentTime)}</span>
            <span><strong>X:</strong> {getCurrentXValue().toFixed(3)}</span>
          </div>
        </div>
        
        <ResponsiveContainer width="100%" height={500}>
          <LineChart 
            data={points}
            onMouseDown={handleZoomStart}
            onMouseMove={handleZoomMove}
            onMouseUp={handleZoomEnd}
            ref={chartRef}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="ts" 
              type="number"
              domain={zoomDomain ? [zoomDomain.left, zoomDomain.right] : ['dataMin', 'dataMax']}
              tickFormatter={(value) => formatTime(value)}
            />
            <YAxis domain={[0, 1]} tickFormatter={(value) => value.toFixed(2)} />
            <Tooltip 
              labelFormatter={(value) => formatTime(value)}
              formatter={(value: any) => [value, 'Eye Position']}
            />
            <Line 
              type="monotone" 
              dataKey="x" 
              stroke="#ff6b35" 
              strokeWidth={2}
              dot={false}
            />
            {/* Playback position line */}
            <ReferenceLine
              x={currentTime}
              stroke="#ff0000"
              strokeWidth={3}
              strokeDasharray="5 5"
            />
            {isZooming && zoomStart !== null && zoomEnd !== null && (
              <ReferenceLine
                x1={Math.min(zoomStart, zoomEnd)}
                x2={Math.max(zoomStart, zoomEnd)}
                stroke="#ff6b35"
                strokeOpacity={0.3}
                fill="#ff6b35"
                fillOpacity={0.3}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {stats && (
        <div className="statistics">
          <h3>Session Statistics</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <label>Total Points:</label>
              <span>{stats.totalPoints}</span>
            </div>
            <div className="stat-item">
              <label>Duration:</label>
              <span>{stats.duration.toFixed(2)}s</span>
            </div>
            <div className="stat-item">
              <label>Avg Velocity:</label>
              <span>{(stats.avgVelocity * 1000).toFixed(2)} units/s</span>
            </div>
            <div className="stat-item">
              <label>Max Velocity:</label>
              <span>{(stats.maxVelocity * 1000).toFixed(2)} units/s</span>
            </div>
            <div className="stat-item">
              <label>Movement Frequency:</label>
              <span>{stats.movementFrequency.toFixed(2)} movements/s</span>
            </div>
            <div className="stat-item">
              <label>Avg Movement:</label>
              <span>{stats.avgMovement.toFixed(3)} units</span>
            </div>
          </div>
        </div>
      )}

      <div className="export-controls">
        <h3>Export Data</h3>
        <button onClick={exportCSV} className="export-btn">
          Export CSV
        </button>
      </div>
    </div>
  );
};

export default SessionPlayback; 
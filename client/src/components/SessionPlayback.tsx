import React, { useState, useEffect } from 'react';
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
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  useEffect(() => {
    loadSessionData();
  }, [sessionId]);

  useEffect(() => {
    if (isPlaying && points.length > 0) {
      const interval = setInterval(() => {
        setCurrentTime(prev => {
          const next = prev + (100 * playbackSpeed);
          if (next >= points.length) {
            setIsPlaying(false);
            return points.length - 1;
          }
          return next;
        });
      }, 100);

      return () => clearInterval(interval);
    }
  }, [isPlaying, points.length, playbackSpeed]);

  const loadSessionData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load session info
      const sessionResponse = await axios.get(`http://localhost:3000/sessions/${sessionId}`);
      setSession(sessionResponse.data);

      // Load points
      const pointsResponse = await axios.get(`http://localhost:3000/sessions/${sessionId}/points`);
      setPoints(pointsResponse.data);
    } catch (err) {
      setError('Failed to load session data');
      console.error('Error loading session:', err);
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

  const exportJSON = async () => {
    try {
      const response = await axios.get(`http://localhost:3000/sessions/${sessionId}/export.json`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `session-${sessionId}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Failed to export JSON:', err);
    }
  };

  const calculateStats = () => {
    if (points.length === 0) return null;

    const velocities: number[] = [];
    const frequencies: number[] = [];
    
    // Calculate velocities
    for (let i = 1; i < points.length; i++) {
      const dt = parseInt(points[i].ts) - parseInt(points[i - 1].ts);
      const dx = points[i].x - points[i - 1].x;
      if (dt > 0) {
        velocities.push(Math.abs(dx / dt));
      }
    }

    // Calculate frequencies (saccades per second)
    const saccadeThreshold = 0.05; // threshold for saccade detection
    let saccadeCount = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = Math.abs(points[i].x - points[i - 1].x);
      if (dx > saccadeThreshold) {
        saccadeCount++;
      }
    }

    const totalTime = (parseInt(points[points.length - 1].ts) - parseInt(points[0].ts)) / 1000;
    const frequency = totalTime > 0 ? saccadeCount / totalTime : 0;

    return {
      totalPoints: points.length,
      duration: totalTime,
      avgVelocity: velocities.length > 0 ? velocities.reduce((a, b) => a + b, 0) / velocities.length : 0,
      maxVelocity: velocities.length > 0 ? Math.max(...velocities) : 0,
      saccadeFrequency: frequency,
      avgConfidence: points.reduce((sum, p) => sum + (p.confidence || 0), 0) / points.length
    };
  };

  const handleScrubberChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value);
    setCurrentTime(value);
  };

  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };

  const resetPlayback = () => {
    setCurrentTime(0);
    setIsPlaying(false);
  };

  if (loading) {
    return <div className="loading">Loading session data...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!session || points.length === 0) {
    return <div className="no-data">No data available for this session</div>;
  }

  const stats = calculateStats();
  const currentPoint = points[Math.floor(currentTime)];

  return (
    <div className="session-playback">
      <div className="session-header">
        <h2>Session: {session.id}</h2>
        <div className="session-meta">
          <p>Created: {new Date(session.createdAt).toLocaleString()}</p>
          <p>Device: {session.deviceInfo || 'Unknown'}</p>
          <p>Sampling Rate: {session.samplingRate} Hz</p>
        </div>
      </div>

      <div className="playback-controls">
        <button onClick={togglePlayback}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button onClick={resetPlayback}>Reset</button>
        <label>
          Speed:
          <select 
            value={playbackSpeed} 
            onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={5}>5x</option>
          </select>
        </label>
      </div>

      <div className="scrubber">
        <input
          type="range"
          min={0}
          max={points.length - 1}
          value={currentTime}
          onChange={handleScrubberChange}
          style={{ width: '100%' }}
        />
        <div className="time-display">
          {currentPoint && (
            <span>
              Time: {new Date(parseInt(currentPoint.ts)).toLocaleTimeString()} 
              | Position: {currentPoint.x.toFixed(3)}
            </span>
          )}
        </div>
      </div>

      <div className="chart-container">
        <h3>Eye Movement Timeseries</h3>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="ts" 
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value) => new Date(parseInt(value)).toLocaleTimeString()}
            />
            <YAxis domain={[0, 1]} />
            <Tooltip 
              labelFormatter={(value) => new Date(parseInt(value)).toLocaleTimeString()}
              formatter={(value: any) => [value, 'Eye Position']}
            />
            <Line 
              type="monotone" 
              dataKey="x" 
              stroke="#8884d8" 
              strokeWidth={2}
              dot={false}
            />
            {currentPoint && (
              <ReferenceLine 
                x={currentPoint.ts} 
                stroke="red" 
                strokeDasharray="3 3"
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
              <span>{(stats.avgVelocity * 1000).toFixed(2)} px/s</span>
            </div>
            <div className="stat-item">
              <label>Max Velocity:</label>
              <span>{(stats.maxVelocity * 1000).toFixed(2)} px/s</span>
            </div>
            <div className="stat-item">
              <label>Saccade Frequency:</label>
              <span>{stats.saccadeFrequency.toFixed(2)} saccades/s</span>
            </div>
            <div className="stat-item">
              <label>Avg Confidence:</label>
              <span>{(stats.avgConfidence * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}

      <div className="export-controls">
        <h3>Export Data</h3>
        <button onClick={exportCSV}>Export CSV</button>
        <button onClick={exportJSON}>Export JSON</button>
      </div>
    </div>
  );
};

export default SessionPlayback; 
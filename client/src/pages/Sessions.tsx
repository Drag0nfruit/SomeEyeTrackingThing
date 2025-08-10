import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

interface Session {
  id: string
  createdAt: string
  deviceInfo?: string
  samplingRate: number
  calibLeft: number
  calibCenter: number
  calibRight: number
  _count?: {
    samples: number
  }
}

const Sessions: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [newSession, setNewSession] = useState({
    deviceInfo: '',
    samplingRate: 60,
    calibLeft: 0.0,
    calibCenter: 0.5,
    calibRight: 1.0
  })

  useEffect(() => {
    fetchSessions()
  }, [])

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/sessions')
      const data = await response.json()
      setSessions(data)
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  const createSession = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSession),
      })
      const session = await response.json()
      setSessions([session, ...sessions])
      setNewSession({
        deviceInfo: '',
        samplingRate: 60,
        calibLeft: 0.0,
        calibCenter: 0.5,
        calibRight: 1.0
      })
    } catch (error) {
      console.error('Failed to create session:', error)
    }
  }

  if (loading) {
    return <div>Loading sessions...</div>
  }

  return (
    <div>
      <h2>Sessions</h2>
      
      <form onSubmit={createSession} style={{ marginBottom: '2rem' }}>
        <h3>Create New Session</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '400px', margin: '0 auto' }}>
          <input
            type="text"
            placeholder="Device Info (optional)"
            value={newSession.deviceInfo}
            onChange={(e) => setNewSession({ ...newSession, deviceInfo: e.target.value })}
            style={{ padding: '0.5rem' }}
          />
          <input
            type="number"
            placeholder="Sampling Rate (Hz)"
            value={newSession.samplingRate}
            onChange={(e) => setNewSession({ ...newSession, samplingRate: parseInt(e.target.value) })}
            style={{ padding: '0.5rem' }}
          />
          <div style={{ display: 'flex', gap: '1rem' }}>
            <input
              type="number"
              step="0.1"
              placeholder="Calib Left"
              value={newSession.calibLeft}
              onChange={(e) => setNewSession({ ...newSession, calibLeft: parseFloat(e.target.value) })}
              style={{ padding: '0.5rem', flex: 1 }}
            />
            <input
              type="number"
              step="0.1"
              placeholder="Calib Center"
              value={newSession.calibCenter}
              onChange={(e) => setNewSession({ ...newSession, calibCenter: parseFloat(e.target.value) })}
              style={{ padding: '0.5rem', flex: 1 }}
            />
            <input
              type="number"
              step="0.1"
              placeholder="Calib Right"
              value={newSession.calibRight}
              onChange={(e) => setNewSession({ ...newSession, calibRight: parseFloat(e.target.value) })}
              style={{ padding: '0.5rem', flex: 1 }}
            />
          </div>
          <button type="submit">Create Session</button>
        </div>
      </form>

      <div>
        {sessions.map((session) => (
          <div key={session.id} style={{ 
            border: '1px solid #ccc', 
            padding: '1rem', 
            margin: '1rem 0',
            borderRadius: '8px'
          }}>
            <h4>Session {session.id.slice(0, 8)}...</h4>
            <p>Device: {session.deviceInfo || 'Not specified'}</p>
            <p>Sampling Rate: {session.samplingRate} Hz</p>
            <p>Calibration: Left={session.calibLeft}, Center={session.calibCenter}, Right={session.calibRight}</p>
            <p>Samples: {session._count?.samples || 0}</p>
            <p>Created: {new Date(session.createdAt).toLocaleString()}</p>
            <Link to={`/sessions/${session.id}`}>
              <button>View Session</button>
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Sessions 
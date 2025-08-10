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
      const response = await fetch('http://localhost:3000/sessions')
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
      const response = await fetch('http://localhost:3000/sessions', {
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

  const deleteSession = async (sessionId: string) => {
    try {
      await fetch(`http://localhost:3000/sessions/${sessionId}`, {
        method: 'DELETE',
      })
      setSessions(sessions.filter(s => s.id !== sessionId))
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <h2>Loading sessions...</h2>
      </div>
    )
  }

  return (
    <div className="sessions-page">
      <div className="page-header">
        <h1>Sessions</h1>
        <p>Browse and analyze previously recorded sessions</p>
      </div>
      
      <div className="create-session-form">
        <h3>Create New Session</h3>
        <form onSubmit={createSession}>
          <div className="form-grid">
            <input
              type="text"
              placeholder="Device Info (optional)"
              value={newSession.deviceInfo}
              onChange={(e) => setNewSession({ ...newSession, deviceInfo: e.target.value })}
            />
            <input
              type="number"
              placeholder="Sampling Rate (Hz)"
              value={newSession.samplingRate}
              onChange={(e) => setNewSession({ ...newSession, samplingRate: parseInt(e.target.value) })}
            />
            <input
              type="number"
              step="0.1"
              placeholder="Calib Left"
              value={newSession.calibLeft}
              onChange={(e) => setNewSession({ ...newSession, calibLeft: parseFloat(e.target.value) })}
            />
            <input
              type="number"
              step="0.1"
              placeholder="Calib Center"
              value={newSession.calibCenter}
              onChange={(e) => setNewSession({ ...newSession, calibCenter: parseFloat(e.target.value) })}
            />
            <input
              type="number"
              step="0.1"
              placeholder="Calib Right"
              value={newSession.calibRight}
              onChange={(e) => setNewSession({ ...newSession, calibRight: parseFloat(e.target.value) })}
            />
            <button type="submit" className="primary-btn">Create Session</button>
          </div>
        </form>
      </div>

      <div className="sessions-list">
        {sessions.map((session) => {
          const isEmpty = (session._count?.samples || 0) === 0;
          return (
            <div key={session.id} className={`session-card ${isEmpty ? 'empty' : ''}`}>
              <div className="session-header">
                <h4>Session {session.id.slice(0, 8)}...</h4>
                <div className="session-actions">
                  <button 
                    onClick={() => deleteSession(session.id)}
                    className="danger-btn small"
                  >
                    Delete
                  </button>
                  <Link to={`/sessions/${session.id}`}>
                    <button className="secondary-btn">View Session</button>
                  </Link>
                </div>
              </div>
              <div className="session-details">
                <p><strong>Device:</strong> {session.deviceInfo || 'Not specified'}</p>
                <p><strong>Sampling Rate:</strong> {session.samplingRate} Hz</p>
                <p><strong>Calibration:</strong> Left={session.calibLeft}, Center={session.calibCenter}, Right={session.calibRight}</p>
                <p className={`sample-count ${isEmpty ? 'empty' : ''}`}>
                  <strong>Samples:</strong> {session._count?.samples || 0} {isEmpty && '(Empty)'}
                </p>
                <p><strong>Created:</strong> {new Date(session.createdAt).toLocaleString()}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  )
}

export default Sessions 
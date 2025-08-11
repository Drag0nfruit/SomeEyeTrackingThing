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

  useEffect(() => {
    fetchSessions()
    
    // Refresh sessions every 5 seconds to catch new recordings
    const refreshInterval = setInterval(() => {
      fetchSessions()
    }, 5000)
    
    return () => clearInterval(refreshInterval)
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



  const deleteSession = async (sessionId: string) => {
    try {
      const response = await fetch(`http://localhost:3000/sessions/${sessionId}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        // Only remove from UI if deletion was successful
        setSessions(sessions.filter(s => s.id !== sessionId))
      } else {
        // Handle error response
        const errorData = await response.json()
        console.error('Failed to delete session:', errorData.error)
      }
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
        <button onClick={fetchSessions} className="secondary-btn" style={{ marginTop: '1rem' }}>
          Refresh Sessions
        </button>
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
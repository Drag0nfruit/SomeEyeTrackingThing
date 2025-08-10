import React from 'react'
import { useParams } from 'react-router-dom'
import SessionPlayback from '../components/SessionPlayback'

const Session: React.FC = () => {
  const { id } = useParams<{ id: string }>()

  if (!id) {
    return <div>Session ID is required</div>
  }

  return (
    <div className="session-page">
      <SessionPlayback sessionId={id} />
    </div>
  )
}

export default Session 
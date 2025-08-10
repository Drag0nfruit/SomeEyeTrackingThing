import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import './App.css'
import Sidebar from './components/Sidebar'
import Home from './pages/Home'
import Record from './pages/Record'
import Session from './pages/Session'
import Sessions from './pages/Sessions'

function App() {
  return (
    <Router>
      <div className="App">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/record" element={<Record />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/sessions/:id" element={<Session />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App 
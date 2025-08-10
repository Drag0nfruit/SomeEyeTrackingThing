# SomeEyeTrackingThing

A professional eye tracking application for assessment and evaluation purposes. This application uses webcam-based eye tracking with MediaPipe face mesh detection, real-time data processing, and comprehensive analysis tools.

**⚠️ Commercial use is strictly prohibited.**

## Features

### 🎥 Real-time Eye Tracking
- **Webcam Integration**: Uses MediaPipe Face Mesh for accurate eye position detection 

There are tons of Landmarks from MediaPipe, currently using:
(145, 153, 154, 158, 159 for left eye and 374, 380, 381, 386, 387 for right eye)


- **Live Visualization**: Real-time chart showing last 15 seconds of eye movement
- **Calibration System**: Left/Center/Right calibration points for accurate tracking
- **High Performance**: 30+ Hz capture rate with Web Worker processing

### 📊 Data Processing
- **Noise Reduction**: Moving average filter and outlier detection
- **Velocity Calculation**: Real-time eye movement velocity computation
- **Confidence Scoring**: Quality assessment of tracking data
- **Bulk Upload**: Efficient batch processing to server

### 📈 Analysis & Playback
- **Full Timeseries**: Complete session visualization with interactive charts
- **Playback Controls**: Play, pause, scrub, and speed controls
- **Statistics**: Velocity, frequency, duration, and confidence metrics
- **Saccade Detection**: Automatic detection of rapid eye movements

### 💾 Data Management
- **Session Management**: Create, view, and organize recording sessions
- **Export Options**: CSV and JSON export with complete metadata
- **Database Storage**: SQLite database with Prisma ORM
- **RESTful API**: Full CRUD operations for sessions and data points

## Architecture

### Frontend (React + TypeScript)
- **Main Thread**: getUserMedia → MediaPipe → Chart rendering
- **Web Worker**: Moving average + outlier detection → Velocity calculation
- **Upload Queue**: Batch processing every 200ms for optimal performance

### Backend (Fastify + Prisma)
- **SQLite Database**: Efficient local storage with proper indexing
- **Real-time Processing**: Server-side filtering and data validation
- **Export System**: CSV/JSON generation with proper headers

## Quick Start

### Prerequisites
- Node.js 18+ 
- Modern browser with webcam access
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd SomeEyeTrackingThing
   ```

2. **Install dependencies**
   ```bash
   # Install root dependencies (Prisma)
   npm install
   
   # Install server dependencies
   cd server && npm install
   
   # Install client dependencies
   cd ../client && npm install
   ```

3. **Set up the database**
   ```bash
   cd ..
   npx prisma generate
   npx prisma migrate dev
   ```

4. **Start the servers**
   ```bash
   # Terminal 1: Start backend server
   cd server && npm run dev
   
   # Terminal 2: Start frontend
   cd client && npm run dev
   ```

5. **Access the application**
   - Frontend: http://localhost:3001
   - Backend API: http://localhost:3000

## Usage

### Recording a Session

1. **Navigate to Home Page**
   - Click "Start Recording" to open the eye tracker

2. **Calibrate the System**
   - Click "Calibrate Left" and look at the left side of your screen
   - Click "Calibrate Center" and look at the center
   - Click "Calibrate Right" and look at the right side

3. **Start Recording**
   - Click "Start Recording" to begin capturing eye movements
   - The live chart will show your eye position in real-time
   - Use "Pause" and "Resume" as needed
   - Click "Stop" when finished

### Analyzing Sessions

1. **View Sessions**
   - Navigate to "Browse Sessions" to see all recordings
   - Click on any session to open the playback interface

2. **Playback Controls**
   - Use the scrubber to navigate through the timeline
   - Adjust playback speed (0.5x to 5x)
   - View statistics and metrics

3. **Export Data**
   - Click "Export CSV" for spreadsheet analysis
   - Click "Export JSON" for programmatic access

## API Endpoints

### Sessions
- `POST /sessions` - Create new session
- `GET /sessions` - List all sessions
- `GET /sessions/:id` - Get session details

### Data Points
- `POST /sessions/:id/points` - Add points (bulk)
- `GET /sessions/:id/points` - Get filtered points

### Export
- `GET /sessions/:id/export.csv` - Export as CSV
- `GET /sessions/:id/export.json` - Export as JSON

## Technical Details

### Eye Tracking Algorithm
1. **Face Detection**: MediaPipe Face Mesh identifies facial landmarks
2. **Eye Position**: Average of left and right eye center positions
3. **Filtering**: 5-point moving average with outlier removal
4. **Velocity**: Real-time calculation of eye movement speed

### Performance Optimizations
- **Web Workers**: Offload processing to prevent UI blocking
- **Batch Uploads**: Reduce server load with 200ms intervals
- **Sliding Window**: Keep only last 15s in memory for live chart
- **Database Indexing**: Optimized queries for large datasets

### Data Quality
- **Confidence Scoring**: Track detection quality
- **Outlier Detection**: Remove noisy data points
- **Calibration**: Improve accuracy with reference points
- **Validation**: Server-side data integrity checks

## Development

### Project Structure
```
SomeEyeTrackingThing/
├── prisma/           # Database schema and migrations
├── server/           # Fastify backend API
│   ├── src/
│   │   ├── routes/   # API endpoints
│   │   └── index.ts  # Server entry point
└── client/           # React frontend
    ├── src/
    │   ├── components/  # React components
    │   ├── pages/       # Page components
    │   └── App.tsx      # Main app component
```

### Key Technologies
- **Frontend**: React 18, TypeScript, Vite, Recharts
- **Backend**: Fastify, Prisma, SQLite
- **Eye Tracking**: MediaPipe Face Mesh
- **Charts**: Recharts for data visualization
- **Styling**: CSS Grid, Flexbox, Glassmorphism

## Troubleshooting

### Common Issues

1. **Webcam Access Denied**
   - Ensure browser has camera permissions
   - Check for other applications using the camera

2. **MediaPipe Loading Issues**
   - Check internet connection (CDN required)
   - Try refreshing the page

3. **Database Errors**
   - Run `npx prisma migrate reset` to reset database
   - Check `.env` file configuration

4. **Performance Issues**
   - Close other browser tabs
   - Reduce browser zoom level
   - Check system resources

### Browser Compatibility
- Chrome 90+ (recommended)
- Firefox 88+
- Safari 14+
- Edge 90+

## License

This application is designed for assessment and evaluation purposes only. Commercial use is strictly prohibited.

## Contributing

This is a research and evaluation tool. Please ensure compliance with local regulations and ethical guidelines when using this software.


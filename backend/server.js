const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer(app);

// Upload Processor (シングルトンインスタンス)
const uploadProcessor = require('./services/uploadProcessor');

// WebSocket Service
const WebSocketService = require('./services/websocketService');
const wsService = new WebSocketService();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Static files middleware - serve frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Routes
const documentsRoutes = require('./routes/documents');
const queueRoutes = require('./routes/queue');
const filesRoutes = require('./routes/files');
const patientsRoutes = require('./routes/patients');
const aiRoutes = require('./routes/ai');

app.use('/api/documents', documentsRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/ai', aiRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'ageagekun-backend',
    timestamp: new Date().toISOString() 
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Ageagekun Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      pendingUploads: 'GET /api/documents/pending-uploads',
      allDocuments: 'GET /api/documents/all',
      fileServing: 'GET /api/files/:fileId',
      fileInfo: 'GET /api/files/:fileId/info',
      createQueue: 'POST /api/queue/create-batch',
      queueStatus: 'GET /api/queue/:id/status',
      updateProcessing: 'PUT /api/queue/:id/processing',
      updateComplete: 'PUT /api/queue/:id/complete',
      updateFailed: 'PUT /api/queue/:id/failed'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Endpoint not found',
      status: 404
    }
  });
});

// Start server
server.listen(PORT, async () => {
  console.log(`
╔════════════════════════════════════════╗
║     Ageagekun Backend Server          ║
╠════════════════════════════════════════╣
║  🚀 Server running on port ${PORT}       ║
║  📍 http://localhost:${PORT}              ║
║  🔧 Environment: ${process.env.NODE_ENV || 'development'}      ║
╚════════════════════════════════════════╝
  `);
  
  // Initialize WebSocket service
  await wsService.initialize(server);
  console.log('🌐 WebSocket service activated');
  
  // Start upload processor
  await uploadProcessor.start();
  console.log('🤖 Upload processor activated');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await uploadProcessor.stop();
  await wsService.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await uploadProcessor.stop();
  await wsService.shutdown();
  process.exit(0);
});
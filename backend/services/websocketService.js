const WebSocket = require('ws');
const { Client } = require('pg');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.pgClient = null;
    this.clients = new Set();
  }

  // WebSocketサーバーを初期化
  async initialize(server) {
    console.log('🔌 Initializing WebSocket service...');
    
    // WebSocketサーバーを作成
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws'
    });
    
    // クライアント接続処理
    this.wss.on('connection', (ws, req) => {
      const clientIp = req.socket.remoteAddress;
      console.log(`🤝 WebSocket client connected from ${clientIp}`);
      
      // クライアントを管理
      this.clients.add(ws);
      
      // 接続確認メッセージを送信
      ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connected to Ageagekun WebSocket server',
        timestamp: new Date().toISOString()
      }));
      
      // ping/pong でコネクション維持
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });
      
      // クライアントからのメッセージ処理
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          console.log('📨 Received from client:', data);
          
          // 必要に応じてメッセージ処理
          if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      });
      
      // 切断処理
      ws.on('close', () => {
        console.log(`👋 WebSocket client disconnected`);
        this.clients.delete(ws);
      });
      
      // エラー処理
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });
    
    // 定期的に接続チェック（30秒ごと）
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          console.log('🔌 Terminating inactive WebSocket connection');
          this.clients.delete(ws);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
    
    // PostgreSQL LISTEN設定
    await this.setupDatabaseListener();
    
    console.log('✅ WebSocket service initialized');
  }

  // PostgreSQL LISTEN設定
  async setupDatabaseListener() {
    try {
      // PostgreSQL接続
      this.pgClient = new Client({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
      });
      
      await this.pgClient.connect();
      console.log('🔗 Connected to PostgreSQL for LISTEN/NOTIFY');
      
      // rpa_queue_status_changedチャンネルをLISTEN
      await this.pgClient.query('LISTEN rpa_queue_status_changed');
      console.log('👂 Listening to rpa_queue_status_changed channel');
      
      // NOTIFYイベントを処理
      this.pgClient.on('notification', (msg) => {
        console.log('📢 Received PostgreSQL notification:', msg.channel);
        
        if (msg.channel === 'rpa_queue_status_changed') {
          try {
            const payload = JSON.parse(msg.payload);
            console.log('📦 Notification payload:', payload);
            
            // WebSocketクライアントに配信
            this.broadcastQueueUpdate(payload);
          } catch (error) {
            console.error('Failed to parse notification payload:', error);
          }
        }
      });
      
      // エラー処理
      this.pgClient.on('error', (error) => {
        console.error('PostgreSQL client error:', error);
        // 再接続ロジックを実装する場合はここに
      });
      
    } catch (error) {
      console.error('Failed to setup database listener:', error);
      throw error;
    }
  }

  // キュー更新を全クライアントに配信
  broadcastQueueUpdate(data) {
    const message = JSON.stringify({
      type: 'queue_update',
      data: {
        queue_id: data.queue_id,
        file_id: data.file_id,
        status: data.status,
        error: data.error,
        timestamp: new Date().toISOString()
      }
    });
    
    let sentCount = 0;
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        sentCount++;
      }
    });
    
    console.log(`📤 Broadcasted queue update to ${sentCount} clients`);
  }

  // 特定のイベントを配信
  broadcast(type, data) {
    const message = JSON.stringify({
      type,
      data,
      timestamp: new Date().toISOString()
    });

    // デバッグ用ログ追加
    const clientCount = this.wss.clients.size;
    console.log(`📡 Broadcasting ${type} to ${clientCount} clients`);

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // クリーンアップ
  async shutdown() {
    console.log('🛑 Shutting down WebSocket service...');
    
    // 全クライアントに切断通知
    this.broadcast('server_shutdown', { message: 'Server is shutting down' });
    
    // WebSocketサーバーを閉じる
    if (this.wss) {
      this.wss.clients.forEach((client) => {
        client.close();
      });
      this.wss.close();
    }
    
    // PostgreSQL接続を閉じる
    if (this.pgClient) {
      await this.pgClient.end();
    }
    
    console.log('✅ WebSocket service shutdown complete');
  }
}

module.exports = WebSocketService;
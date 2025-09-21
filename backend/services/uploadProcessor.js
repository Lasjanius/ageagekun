const fs = require('fs').promises;
const path = require('path');
const db = require('../config/database');
const { Client } = require('pg');

class UploadProcessor {
  constructor() {
    this.pgClient = null;
    this.baseDir = 'C:\\Users\\hyosh\\Desktop\\allright\\ageagekun\\patients';
  }

  // プロセッサーを開始（ファイル移動専用）
  async start() {
    console.log('🚀 Starting file movement processor...');
    
    // PostgreSQL LISTEN設定
    await this.setupDatabaseListener();
    
    console.log('✅ File movement processor started');
  }

  // PostgreSQL LISTEN設定
  async setupDatabaseListener() {
    try {
      // 専用のPostgreSQL接続を作成
      this.pgClient = new Client({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
      });
      
      await this.pgClient.connect();
      console.log('🔗 File movement processor connected to PostgreSQL');
      
      // ファイル移動要求とタスク完了をLISTEN
      await this.pgClient.query('LISTEN file_movement_required');
      await this.pgClient.query('LISTEN all_tasks_complete');
      await this.pgClient.query('LISTEN rpa_queue_status_changed');
      console.log('👂 Listening for file movement requests...');
      
      // NOTIFYイベントを処理
      this.pgClient.on('notification', async (msg) => {
        try {
          const payload = JSON.parse(msg.payload);
          
          if (msg.channel === 'file_movement_required') {
            await this.handleFileMovement(payload);
          } else if (msg.channel === 'all_tasks_complete') {
            await this.notifyCompletion(payload);
          } else if (msg.channel === 'rpa_queue_status_changed') {
            console.log(`📊 Queue status changed: ${payload.status} (file_id: ${payload.file_id})`);
          }
        } catch (error) {
          console.error('❌ Error processing notification:', error);
        }
      });
      
      // エラーハンドリング
      this.pgClient.on('error', (err) => {
        console.error('❌ PostgreSQL client error:', err);
        this.reconnect();
      });
      
    } catch (error) {
      console.error('❌ Failed to setup database listener:', error);
      throw error;
    }
  }

  // ファイル移動処理
  async handleFileMovement(data) {
    const { file_id, old_path, new_path } = data;
    
    try {
      console.log(`📁 Moving file for file_id: ${file_id}`);
      console.log(`  From: ${old_path}`);
      console.log(`  To: ${new_path}`);
      
      // uploadedディレクトリが存在しない場合は作成
      const uploadedDir = path.dirname(new_path);
      await fs.mkdir(uploadedDir, { recursive: true });
      
      // ファイルの存在確認
      try {
        await fs.access(old_path);
      } catch (error) {
        console.error(`❌ Source file not found: ${old_path}`);
        return;
      }
      
      // ファイル移動
      await fs.rename(old_path, new_path);
      console.log(`✅ File moved successfully: ${path.basename(new_path)}`);
      
    } catch (error) {
      console.error(`❌ Error moving file ${file_id}:`, error);
      
      // エラーをログに記録（必要に応じて）
      try {
        await db.query(
          'UPDATE rpa_queue SET error_message = $1 WHERE file_id = $2 AND status IN ($3, $4)',
          [`File movement failed: ${error.message}`, file_id, 'ready_to_print', 'uploaded']
        );
      } catch (dbError) {
        console.error('❌ Failed to log error:', dbError);
      }
    }
  }

  // 全タスク完了通知
  async notifyCompletion(data) {
    try {
      console.log('🎉 All upload tasks completed!');
      
      // 完了統計を取得
      const stats = await this.getCompletionStats();
      
      // WebSocketで通知（websocketServiceが利用可能な場合）
      if (global.websocketService) {
        global.websocketService.broadcast({
          type: 'all_tasks_complete',
          data: {
            completed_at: data.completed_at,
            stats: stats
          }
        });
      }
      
      console.log(`📊 Stats - Success: ${stats.successful}, Failed: ${stats.failed}, Total: ${stats.total}`);
      
    } catch (error) {
      console.error('❌ Error sending completion notification:', error);
    }
  }

  // 完了統計を取得
  async getCompletionStats() {
    try {
      const result = await db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN status IN ('ready_to_print', 'done') THEN 1 END) as successful,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
        FROM rpa_queue
        WHERE DATE(created_at) = CURRENT_DATE
      `);

      return result.rows[0] || { total: 0, successful: 0, failed: 0 };
    } catch (error) {
      console.error('❌ Error getting completion stats:', error);
      return { total: 0, successful: 0, failed: 0 };
    }
  }

  // 再接続処理
  async reconnect() {
    console.log('🔄 Attempting to reconnect to PostgreSQL...');
    setTimeout(async () => {
      try {
        await this.setupDatabaseListener();
      } catch (error) {
        console.error('❌ Reconnection failed, retrying in 5 seconds...');
        this.reconnect();
      }
    }, 5000);
  }

  // プロセッサーを停止
  async stop() {
    console.log('🛑 Stopping file movement processor...');
    
    if (this.pgClient) {
      await this.pgClient.end();
      console.log('✅ PostgreSQL connection closed');
    }
  }
}

// シングルトンインスタンスをエクスポート
module.exports = new UploadProcessor();
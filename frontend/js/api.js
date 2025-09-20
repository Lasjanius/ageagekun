// API通信層
const API = {
    baseURL: 'http://localhost:3000/api',
    
    // HTTPリクエストの基本設定
    headers: {
        'Content-Type': 'application/json',
    },
    
    // 汎用的なfetch wrapper
    async request(endpoint, options = {}) {
        try {
            const url = `${this.baseURL}${endpoint}`;
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...this.headers,
                    ...options.headers,
                },
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    },
    
    // 全ドキュメント一覧を取得
    async getAllDocuments() {
        try {
            const response = await this.request('/documents/all');
            return response.data || [];
        } catch (error) {
            console.error('Failed to fetch all documents:', error);
            return [];
        }
    },

    // カテゴリ一覧を取得
    async getCategories() {
        try {
            const response = await this.request('/documents/categories');
            return response.data || [];
        } catch (error) {
            console.error('Failed to fetch categories:', error);
            return [];
        }
    },

    // 未アップロードファイル一覧を取得
    async getPendingUploads() {
        try {
            const response = await this.request('/documents/pending-uploads');
            return response.data || [];
        } catch (error) {
            console.error('Failed to fetch pending uploads:', error);
            return [];
        }
    },
    
    // 統計情報を取得
    async getStatistics() {
        try {
            const response = await this.request('/documents/statistics');
            return response.data || {
                pending_count: 0,
                uploaded_count: 0,
                total_count: 0,
                patient_count: 0
            };
        } catch (error) {
            console.error('Failed to fetch statistics:', error);
            return {
                pending_count: 0,
                uploaded_count: 0,
                total_count: 0,
                patient_count: 0
            };
        }
    },

    // ドキュメントを削除
    async deleteDocument(fileId) {
        try {
            const response = await this.request(`/documents/${fileId}`, {
                method: 'DELETE',
            });
            return response;
        } catch (error) {
            console.error(`Failed to delete document ${fileId}:`, error);
            throw error;
        }
    },

    // 複数ファイルをキューに追加
    async createBatchQueue(files) {
        try {
            const response = await this.request('/queue/create-batch', {
                method: 'POST',
                body: JSON.stringify({ files }),
            });
            return response;
        } catch (error) {
            console.error('Failed to create batch queue:', error);
            throw error;
        }
    },
    
    // キューのステータスを取得
    async getQueueStatus(queueId) {
        try {
            const response = await this.request(`/queue/${queueId}/status`);
            return response.data;
        } catch (error) {
            console.error(`Failed to fetch queue status for ${queueId}:`, error);
            throw error;
        }
    },
    
    // キューの全体状況を取得
    async getQueueOverview() {
        try {
            const response = await this.request('/queue/overview');
            return response.data || {
                pending: 0,
                processing: 0,
                done: 0,
                failed: 0
            };
        } catch (error) {
            console.error('Failed to fetch queue overview:', error);
            return {
                pending: 0,
                processing: 0,
                done: 0,
                failed: 0
            };
        }
    },
    
    // PAD用: ステータスを'processing'に更新
    async updateToProcessing(queueId) {
        try {
            const response = await this.request(`/queue/${queueId}/processing`, {
                method: 'PUT',
            });
            return response;
        } catch (error) {
            console.error(`Failed to update queue ${queueId} to processing:`, error);
            throw error;
        }
    },
    
    // PAD用: ステータスを'done'に更新
    async updateToComplete(queueId) {
        try {
            const response = await this.request(`/queue/${queueId}/complete`, {
                method: 'PUT',
            });
            return response;
        } catch (error) {
            console.error(`Failed to update queue ${queueId} to complete:`, error);
            throw error;
        }
    },
    
    // PAD用: ステータスを'failed'に更新
    async updateToFailed(queueId, errorMessage) {
        try {
            const response = await this.request(`/queue/${queueId}/failed`, {
                method: 'PUT',
                body: JSON.stringify({ error_message: errorMessage }),
            });
            return response;
        } catch (error) {
            console.error(`Failed to update queue ${queueId} to failed:`, error);
            throw error;
        }
    },
    
    // 全てのpending状態のキューをキャンセル
    async cancelAllQueues() {
        try {
            const response = await this.request('/queue/cancel-all', {
                method: 'DELETE',
            });
            return response;
        } catch (error) {
            console.error('Failed to cancel all queues:', error);
            throw error;
        }
    },

    // 保留中のキューアイテムを取得（status != 'done'）
    async getPendingQueues() {
        try {
            const response = await this.request('/queue/pending');
            return response.data || [];
        } catch (error) {
            console.error('Failed to fetch pending queues:', error);
            return [];
        }
    },
};
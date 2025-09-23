// メインアプリケーション
const App = {
    // 状態管理
    state: {
        files: [],
        filteredFiles: [],
        uploadQueue: [],
        isUploading: false,
        currentUploadIndex: 0,
        currentFilter: 'pending', // 'all', 'pending', 'uploaded'
        currentCategory: 'all', // カテゴリフィルタ
        categories: [], // カテゴリ一覧
        ws: null, // WebSocket接続
        wsReconnectAttempts: 0,
        wsMaxReconnectAttempts: 5,
        elapsedTimeInterval: null, // 経過時間更新用のインターバル
        queueMonitor: {
            isVisible: false,
            data: [],
            autoRefreshInterval: null,
            lastUpdated: null
        },
    },
    
    // 初期化
    async init() {
        console.log('Initializing AgeAge-kun... 🚀');
        
        // UI初期化
        UI.init();
        
        // イベントリスナー設定
        this.attachEventListeners();
        
        // WebSocket接続
        this.connectWebSocket();
        
        // 初期データ読み込み
        await this.loadData();
        
        // 定期更新（60秒ごと）
        setInterval(() => {
            if (!this.state.isUploading) {
                this.loadData();
            }
        }, 60000);
        
        UI.showToast('システムが起動しました', 'success');
    },
    
    // イベントリスナー設定
    attachEventListeners() {
        // タブ切り替え
        UI.elements.patientTab.addEventListener('click', () => {
            UI.switchView('patient');
            this.renderCurrentView();
            UI.updateSelectedCount();  // タブ切り替え時もカウントを更新
        });
        
        UI.elements.documentTab.addEventListener('click', () => {
            UI.switchView('document');
            this.renderCurrentView();
            UI.updateSelectedCount();  // タブ切り替え時もカウントを更新
        });
        
        // 更新ボタン
        UI.elements.refreshBtn.addEventListener('click', () => {
            this.loadData();
        });

        // キューモニターボタン
        const queueMonitorBtn = document.getElementById('queueMonitorBtn');
        if (queueMonitorBtn) {
            queueMonitorBtn.addEventListener('click', () => {
                this.showQueueMonitor();
            });
        }

        // キューモニターの閉じるボタン
        const closeQueueMonitorBtn = document.getElementById('closeQueueMonitorBtn');
        if (closeQueueMonitorBtn) {
            closeQueueMonitorBtn.addEventListener('click', () => {
                this.hideQueueMonitor();
            });
        }

        // キューモニターの更新ボタン
        const refreshQueueMonitorBtn = document.getElementById('refreshQueueMonitorBtn');
        if (refreshQueueMonitorBtn) {
            refreshQueueMonitorBtn.addEventListener('click', () => {
                this.refreshQueueMonitor();
            });
        }

        // キューモニターモーダルのオーバーレイクリックで閉じる
        const queueMonitorModal = document.getElementById('queueMonitorModal');
        if (queueMonitorModal) {
            const overlay = queueMonitorModal.querySelector('.modal__overlay');
            if (overlay) {
                overlay.addEventListener('click', () => {
                    this.hideQueueMonitor();
                });
            }
        }

        // 全選択チェックボックス
        UI.elements.selectAllCheckbox.addEventListener('change', (e) => {
            UI.toggleSelectAll(e.target.checked);
        });
        
        // アップロードボタン
        UI.elements.uploadAllBtn.addEventListener('click', () => {
            this.handleUploadAll();
        });
        
        // 検索フィルター
        UI.elements.searchInput.addEventListener('input', () => {
            this.filterFiles();
        });

        // ステータスフィルター
        UI.elements.filterAll.addEventListener('click', () => {
            this.setFilter('all');
        });

        UI.elements.filterPending.addEventListener('click', () => {
            this.setFilter('pending');
        });

        UI.elements.filterUploaded.addEventListener('click', () => {
            this.setFilter('uploaded');
        });

        // カテゴリフィルター
        UI.elements.categoryFilter.addEventListener('change', (e) => {
            this.setCategoryFilter(e.target.value);
        });

        // 確認モーダル
        UI.elements.confirmYesBtn.addEventListener('click', () => {
            const modal = UI.elements.confirmModal;
            const action = modal.dataset.action;

            if (action === 'delete') {
                const fileId = modal.dataset.fileId;
                this.handleDeleteDocument(fileId);
            } else if (action === 'delete-queue') {
                const queueId = modal.dataset.queueId;
                this.handleDeleteQueueItem(queueId);
            } else {
                this.startUpload();
            }
        });

        UI.elements.confirmNoBtn.addEventListener('click', () => {
            UI.hideConfirmModal();
            // データセット属性をクリア
            delete UI.elements.confirmModal.dataset.action;
            delete UI.elements.confirmModal.dataset.fileId;
            delete UI.elements.confirmModal.dataset.queueId;
        });
        
        // アップロードモーダル
        UI.elements.closeModalBtn.addEventListener('click', () => {
            UI.hideUploadModal();
            this.loadData();
        });
        
        UI.elements.cancelUploadBtn.addEventListener('click', () => {
            this.cancelUpload();
        });

        // 完了モーダルOKボタン
        UI.elements.completionOkBtn.addEventListener('click', () => {
            UI.hideCompletionModal();
            UI.hideUploadModal();
            this.loadData();
        });

        // モーダル外側クリックで閉じる
        document.querySelectorAll('.modal__overlay').forEach(overlay => {
            overlay.addEventListener('click', () => {
                if (!this.state.isUploading) {
                    UI.hideConfirmModal();
                    UI.hideUploadModal();
                    UI.hideCompletionModal();
                }
            });
        });

        // 削除ボタンのイベント委譲
        document.addEventListener('click', (e) => {
            if (e.target.closest('.document-item__delete')) {
                const button = e.target.closest('.document-item__delete');
                const fileId = button.dataset.fileId;
                const fileName = button.dataset.fileName;
                UI.showDeleteConfirmModal(fileId, fileName);
            } else if (e.target.closest('.queue-item__delete')) {
                const button = e.target.closest('.queue-item__delete');
                const queueId = button.dataset.queueId;
                const fileName = button.dataset.fileName;
                const patientName = button.dataset.patientName;
                UI.showQueueDeleteConfirmModal(queueId, fileName, patientName);
            }
        });
    },
    
    // データ読み込み
    async loadData() {
        try {
            UI.showLoading();

            // 並行してデータ取得
            const [files, stats, categories] = await Promise.all([
                API.getAllDocuments(),
                API.getStatistics(),
                API.getCategories()
            ]);
            
            this.state.files = files;
            this.state.categories = categories;

            // カテゴリプルダウンを更新
            this.updateCategoryDropdown();

            // フィルタを適用
            this.filterFiles();

            // UI更新
            UI.updateStatistics(stats);
            this.renderCurrentView();
            UI.updateSelectedCount();
            
        } catch (error) {
            console.error('Failed to load data:', error);
            UI.showToast('データの読み込みに失敗しました', 'error');
        }
    },
    
    // 現在のビューをレンダリング
    renderCurrentView() {
        const files = this.state.filteredFiles || this.state.files;
        UI.renderFileList(files);
        UI.updateSelectedCount();  // 選択カウントを更新
    },
    
    // ステータスフィルターを設定
    setFilter(filterType) {
        this.state.currentFilter = filterType;
        
        // フィルターボタンのアクティブ状態を更新
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('filter-btn--active');
        });
        
        const activeButton = {
            'all': UI.elements.filterAll,
            'pending': UI.elements.filterPending,
            'uploaded': UI.elements.filterUploaded
        }[filterType];
        
        if (activeButton) {
            activeButton.classList.add('filter-btn--active');
        }
        
        // フィルタを適用
        this.filterFiles();
    },

    // カテゴリフィルターを設定
    setCategoryFilter(category) {
        this.state.currentCategory = category;
        this.filterFiles();
    },

    // カテゴリドロップダウンを更新
    updateCategoryDropdown() {
        const categoryFilter = UI.elements.categoryFilter;
        if (!categoryFilter) return;

        // 現在の選択値を保存
        const currentValue = categoryFilter.value || 'all';

        // オプションをクリアして再構築
        categoryFilter.innerHTML = '<option value="all">全て</option>';

        // カテゴリを追加
        this.state.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });

        // 以前の選択値を復元（存在する場合）
        if (Array.from(categoryFilter.options).some(opt => opt.value === currentValue)) {
            categoryFilter.value = currentValue;
        } else {
            categoryFilter.value = 'all';
            this.state.currentCategory = 'all';
        }
    },

    // ファイルフィルタリング
    filterFiles() {
        const searchTerm = UI.elements.searchInput.value.toLowerCase();
        
        let filteredFiles = [...this.state.files];
        
        // ステータスフィルタ
        if (this.state.currentFilter === 'pending') {
            filteredFiles = filteredFiles.filter(file => !file.isuploaded);
        } else if (this.state.currentFilter === 'uploaded') {
            filteredFiles = filteredFiles.filter(file => file.isuploaded);
        }
        // 'all' の場合はフィルタリングしない

        // カテゴリフィルタ
        if (this.state.currentCategory !== 'all') {
            filteredFiles = filteredFiles.filter(file => file.category === this.state.currentCategory);
        }
        
        // 検索フィルタ
        if (searchTerm) {
            filteredFiles = filteredFiles.filter(file => 
                file.patient_name.toLowerCase().includes(searchTerm) ||
                file.file_name.toLowerCase().includes(searchTerm) ||
                file.category.toLowerCase().includes(searchTerm)
            );
        }
        
        this.state.filteredFiles = filteredFiles;
        this.renderCurrentView();
    },
    
    // 全アップロード処理
    handleUploadAll() {
        const selectedFiles = UI.getSelectedFiles();
        
        if (selectedFiles.length === 0) {
            UI.showToast('ファイルを選択してください', 'warning');
            return;
        }
        
        UI.showConfirmModal(selectedFiles);
    },
    
    // アップロード開始
    async startUpload() {
        UI.hideConfirmModal();
        
        const selectedFiles = UI.getSelectedFiles();
        
        if (selectedFiles.length === 0) {
            return;
        }
        
        this.state.isUploading = true;
        this.state.uploadQueue = selectedFiles.map(file => ({
            ...file,
            status: 'pending',
            queue_id: null,
            created_at: new Date().toISOString()
        }));
        
        UI.showUploadModal();
        UI.updateUploadQueue(this.state.uploadQueue);
        
        try {
            // バッチキューを作成
            const response = await API.createBatchQueue(selectedFiles);
            
            if (response.success) {
                // キューIDを割り当て
                response.data.forEach((item, index) => {
                    this.state.uploadQueue[index].queue_id = item.queue_id;
                });

                // デバッグ: queue_idの割り当て確認
                console.log('✅ Queue IDs assigned:', this.state.uploadQueue.map(q => ({
                    file_name: q.file_name,
                    queue_id: q.queue_id,
                    status: q.status
                })));

                UI.showToast(`${selectedFiles.length}件のファイルをキューに追加しました`, 'success');
                
                // アップロード処理を開始
                await this.processUploadQueue();
            } else {
                throw new Error('Failed to create queue');
            }
        } catch (error) {
            console.error('Upload failed:', error);
            UI.showToast('アップロードの開始に失敗しました', 'error');
            this.state.isUploading = false;
        }
    },
    
    // アップロードキューを処理（WebSocket経由で状態を監視）
    async processUploadQueue() {
        // WebSocketで状態更新を受信するため、ここでは初期表示のみ
        const total = this.state.uploadQueue.length;

        // デバッグ: アップロード開始時の状態
        console.log('🚀 Starting upload with queue:', this.state.uploadQueue);
        console.log('📡 WebSocket state:', this.state.ws?.readyState === 1 ? 'CONNECTED' : 'NOT CONNECTED');

        // 初期状態をUIに反映
        UI.updateUploadQueue(this.state.uploadQueue);
        UI.updateProgress(0, total);

        // 経過時間の定期更新を開始（1秒ごと）
        if (this.state.elapsedTimeInterval) {
            clearInterval(this.state.elapsedTimeInterval);
        }
        this.state.elapsedTimeInterval = setInterval(() => {
            if (this.state.isUploading) {
                UI.updateUploadQueue(this.state.uploadQueue);
            }
        }, 1000);
        
        // 実際の処理はPADが行い、WebSocket経由で状態更新を受信
        console.log('📡 Waiting for WebSocket updates...');
    },
    
    // WebSocket接続
    connectWebSocket() {
        const wsUrl = `ws://localhost:${3000}/ws`;
        console.log(`🔌 Connecting to WebSocket at ${wsUrl}...`);
        
        try {
            this.state.ws = new WebSocket(wsUrl);
            
            // 接続成功
            this.state.ws.onopen = () => {
                console.log('✅ WebSocket connected');
                UI.showToast('リアルタイム通信が確立されました', 'success');
                this.state.wsReconnectAttempts = 0;
            };
            
            // メッセージ受信
            this.state.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    console.log('📨 WebSocket message:', message);
                    
                    if (message.type === 'queue_update') {
                        // デバッグ: queue_updateメッセージの詳細
                        console.log('📩 Queue update received:', {
                            queue_id: message.data.queue_id,
                            file_id: message.data.file_id,
                            status: message.data.status
                        });
                        this.handleQueueUpdate(message.data);
                    } else if (message.type === 'document_deleted') {
                        // ドキュメント削除通知
                        console.log('🗑️ Document deleted:', {
                            file_id: message.data.file_id,
                            file_name: message.data.file_name
                        });
                        // 他のクライアントでも表示を更新
                        this.state.files = this.state.files.filter(f => f.file_id !== message.data.file_id);
                        this.filterFiles();
                        UI.showToast(`ファイル「${message.data.file_name}」が削除されました`, 'info');
                    } else if (message.type === 'connection') {
                        console.log('🤝 Server acknowledgement:', message.message);
                    }
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                }
            };
            
            // エラー処理
            this.state.ws.onerror = (error) => {
                console.error('❌ WebSocket error:', error);
                UI.showToast('通信エラーが発生しました', 'error');
            };
            
            // 切断処理
            this.state.ws.onclose = () => {
                console.log('🔌 WebSocket disconnected');
                this.state.ws = null;
                
                // 再接続を試みる
                if (this.state.wsReconnectAttempts < this.state.wsMaxReconnectAttempts) {
                    this.state.wsReconnectAttempts++;
                    const delay = Math.min(1000 * Math.pow(2, this.state.wsReconnectAttempts), 30000);
                    console.log(`🔄 Reconnecting in ${delay}ms... (attempt ${this.state.wsReconnectAttempts})`);
                    setTimeout(() => this.connectWebSocket(), delay);
                } else {
                    UI.showToast('サーバーとの接続が切断されました', 'warning');
                }
            };
            
        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
        }
    },
    
    // キュー更新を処理
    handleQueueUpdate(data) {
        console.log('📊 Processing queue update:', data);
        
        // アップロードキューから該当アイテムを探す
        const item = this.state.uploadQueue.find(q => q.queue_id === data.queue_id);
        
        if (item) {
            // デバッグ: キューアイテムが見つかった
            console.log(`✅ Found queue item:`, item);

            // ステータスを更新
            const previousStatus = item.status;
            item.status = data.status;

            console.log(`📝 Queue #${data.queue_id}: ${previousStatus} → ${data.status}`);
            
            // エラーメッセージがあれば追加
            if (data.error) {
                item.error = data.error;
            }
            
            // UI更新
            UI.updateUploadQueue(this.state.uploadQueue);
            
            // 進捗を計算（canceledも完了扱いにする）
            const total = this.state.uploadQueue.length;
            const completed = this.state.uploadQueue.filter(
                q => StatusHelper.isComplete(q.status)
            ).length;

            // デバッグ: 進捗更新の詳細
            console.log(`📊 Progress update: ${completed}/${total} (${Math.round((completed/total)*100)}%)`);
            console.log('Completed items:', this.state.uploadQueue.filter(
                q => StatusHelper.isComplete(q.status)
            ).map(q => ({queue_id: q.queue_id, status: q.status})));

            UI.updateProgress(completed, total);
            
            // 全て完了したか確認
            if (this.checkAllCompleted()) {
                this.completeUpload();
            }
        } else {
            // デバッグ: キューアイテムが見つからない場合の警告
            console.warn(`⚠️ Queue #${data.queue_id} not found in uploadQueue!`);
            console.log('Current uploadQueue IDs:', this.state.uploadQueue.map(q => q.queue_id));
            console.log('Received queue_id:', data.queue_id);
        }

        // ファイルリストも更新（isUploadedの反映）
        // uploadedステータス時にファイルが移動される
        if (data.status === QUEUE_STATUS.UPLOADED) {
            const file = this.state.files.find(f => f.file_id === data.file_id);
            if (file) {
                file.isuploaded = true;
                this.filterFiles();
            }
        }

        // キューモニターが表示されている場合は更新
        if (this.state.queueMonitor.isVisible) {
            // 少し遅延を入れてから更新（DBの更新が完了するのを待つ）
            setTimeout(() => {
                this.refreshQueueMonitor();
            }, 500);
        }
    },
    
    // 全タスク完了チェック
    checkAllCompleted() {
        return this.state.uploadQueue.every(
            item => StatusHelper.isComplete(item.status)
        );
    },
    
    // アップロード完了処理
    completeUpload() {
        this.state.isUploading = false;

        // 経過時間更新を停止
        if (this.state.elapsedTimeInterval) {
            clearInterval(this.state.elapsedTimeInterval);
            this.state.elapsedTimeInterval = null;
        }

        const total = this.state.uploadQueue.length;
        const completed = this.state.uploadQueue.filter(q => q.status === QUEUE_STATUS.DONE).length;
        const failed = this.state.uploadQueue.filter(q => q.status === QUEUE_STATUS.FAILED).length;
        const canceled = this.state.uploadQueue.filter(q => q.status === QUEUE_STATUS.CANCELED).length;
        const uploaded = this.state.uploadQueue.filter(q => q.status === QUEUE_STATUS.UPLOADED).length;
        const readyToPrint = this.state.uploadQueue.filter(q => q.status === QUEUE_STATUS.READY_TO_PRINT).length;

        // テーブルを非表示にして完了メッセージを表示
        const queueTable = document.querySelector('.queue-table');
        const completeMessage = UI.elements.queueCompleteMessage;
        const completeDetails = UI.elements.queueCompleteDetails;

        if (queueTable) {
            queueTable.style.display = 'none';
        }

        if (completeMessage && completeDetails) {
            // 詳細メッセージを作成
            let detailsText = `成功: ${completed}件`;
            if (failed > 0) {
                detailsText += ` / 失敗: ${failed}件`;
            }
            if (canceled > 0) {
                detailsText += ` / キャンセル: ${canceled}件`;
            }

            completeDetails.textContent = detailsText;
            completeMessage.style.display = 'block';

            // 閉じるボタンを表示
            UI.elements.closeModalBtn.style.display = 'block';
            UI.elements.cancelUploadBtn.style.display = 'none';
        }

        // 完了モーダルも表示（既存機能）
        UI.showCompletionModal(completed, failed, total);

        // トースト通知も表示（補助的に）
        if (failed > 0) {
            UI.showToast(`${completed}件成功、${failed}件失敗しました`, 'warning');
        } else {
            UI.showToast(`${completed}件のアップロードが完了しました`, 'success');
        }
    },
    
    // アップロードキャンセル
    async cancelUpload() {
        if (confirm('アップロード処理をキャンセルしますか？\n※実行中のRPAは手動で停止してください')) {
            try {
                // バックエンドのキューをキャンセル
                const response = await API.cancelAllQueues();
                
                if (response.success) {
                    console.log(`✅ Canceled ${response.data.canceled_count} queue items`);
                    UI.showToast(`${response.data.canceled_count}件のキューをキャンセルしました`, 'info');
                    
                    // キャンセルされたアイテムのステータスをローカルでも更新
                    response.data.canceled_ids.forEach(queueId => {
                        const item = this.state.uploadQueue.find(q => q.queue_id === queueId);
                        if (item) {
                            item.status = 'canceled';
                        }
                    });
                    
                    // UI更新
                    UI.updateUploadQueue(this.state.uploadQueue);

                    // 全て完了扱いにして処理を終了
                    if (this.checkAllCompleted()) {
                        this.completeUpload();
                    }

                    // キャンセル後は必ずモーダルを閉じる
                    this.state.isUploading = false;
                    UI.hideUploadModal();
                    this.loadData();
                } else {
                    throw new Error('Failed to cancel queues');
                }
            } catch (error) {
                console.error('Failed to cancel upload:', error);
                UI.showToast('キャンセル処理に失敗しました', 'error');
                
                // エラーが発生してもUIは閉じる
                this.state.isUploading = false;
                UI.hideUploadModal();
                this.loadData();
            }
        }
    },
    
    // キューステータスのポーリング（将来的に実装）
    async pollQueueStatus() {
        // WebSocketまたはポーリングで実装
        // 現在は仮実装
    },

    // キューモニターを表示
    async showQueueMonitor() {
        console.log('📋 Opening queue monitor...');
        this.state.queueMonitor.isVisible = true;
        UI.showQueueMonitor();

        // データを取得して表示
        await this.refreshQueueMonitor();

        // 自動更新を開始（5分ごと）
        this.startQueueMonitorAutoRefresh();
    },

    // キューモニターを非表示
    hideQueueMonitor() {
        console.log('📋 Closing queue monitor...');
        this.state.queueMonitor.isVisible = false;
        UI.hideQueueMonitor();

        // 自動更新を停止
        this.stopQueueMonitorAutoRefresh();
    },

    // キューモニターのデータを更新
    async refreshQueueMonitor() {
        try {
            console.log('🔄 Refreshing queue monitor data...');
            const queues = await API.getPendingQueues();

            this.state.queueMonitor.data = queues;
            this.state.queueMonitor.lastUpdated = new Date();

            // UIを更新
            UI.renderQueueTable(queues);

            console.log(`✅ Queue monitor updated: ${queues.length} items`);
        } catch (error) {
            console.error('Failed to refresh queue monitor:', error);
            UI.showToast('キューデータの取得に失敗しました', 'error');
        }
    },

    // 自動更新を開始
    startQueueMonitorAutoRefresh() {
        // 既存のインターバルをクリア
        this.stopQueueMonitorAutoRefresh();

        // 5分ごとに更新
        this.state.queueMonitor.autoRefreshInterval = setInterval(() => {
            if (this.state.queueMonitor.isVisible) {
                this.refreshQueueMonitor();
            }
        }, 300000); // 5分 = 300,000ms
    },

    // 自動更新を停止
    stopQueueMonitorAutoRefresh() {
        if (this.state.queueMonitor.autoRefreshInterval) {
            clearInterval(this.state.queueMonitor.autoRefreshInterval);
            this.state.queueMonitor.autoRefreshInterval = null;
        }
    },

    // WebSocketメッセージ受信時にキューモニターも更新
    handleQueueWebSocketUpdate(message) {
        // 既存の処理に加えて、キューモニターが表示されている場合は更新
        if (this.state.queueMonitor.isVisible && message.type === 'queue_update') {
            // 少し遅延を入れてから更新（DBの更新が完了するのを待つ）
            setTimeout(() => {
                this.refreshQueueMonitor();
            }, 500);
        }
    },

    // ドキュメント削除処理
    async handleDeleteDocument(fileId) {
        try {
            UI.hideConfirmModal();
            UI.showToast('削除中...', 'info');

            const response = await API.deleteDocument(fileId);

            if (response.success) {
                UI.showToast(`ファイル「${response.data.file_name}」を削除しました`, 'success');

                // ファイルリストから削除
                this.state.files = this.state.files.filter(f => f.file_id !== parseInt(fileId));
                this.filterFiles();

                // 統計情報を更新
                const stats = await API.getStatistics();
                UI.updateStatistics({
                    pending_count: stats.pending_count,
                    uploaded_count: stats.uploaded_count,
                    total_count: stats.total_count,
                    patient_count: stats.patient_count
                });
            } else {
                UI.showToast('削除に失敗しました', 'error');
            }
        } catch (error) {
            console.error('Failed to delete document:', error);
            const errorMessage = error.message || 'ドキュメントの削除に失敗しました';
            UI.showToast(errorMessage, 'error');
        } finally {
            // データセット属性をクリア
            delete UI.elements.confirmModal.dataset.action;
            delete UI.elements.confirmModal.dataset.fileId;
        }
    },

    // キューアイテム削除処理
    async handleDeleteQueueItem(queueId) {
        try {
            UI.hideConfirmModal();
            UI.showToast('削除中...', 'info');

            const response = await API.deleteQueueItem(queueId);

            if (response.success) {
                UI.showToast(`キューアイテム「${response.data.queue_id}」を削除しました`, 'success');

                // キューモニターが表示されている場合は更新
                if (this.state.queueMonitor.isVisible) {
                    await this.refreshQueueMonitor();
                }
            } else {
                UI.showToast('キューアイテムの削除に失敗しました', 'error');
            }
        } catch (error) {
            console.error('Failed to delete queue item:', error);
            const errorMessage = error.message || 'キューアイテムの削除に失敗しました';
            UI.showToast(errorMessage, 'error');
        } finally {
            // データセット属性をクリア
            delete UI.elements.confirmModal.dataset.action;
            delete UI.elements.confirmModal.dataset.queueId;
        }
    }
};

// Appをグローバルスコープに公開（他のモジュールから参照可能にする）
window.App = App;

// ページ読み込み完了時に初期化
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
// UI操作層
const UI = {
    // DOM要素のキャッシュ
    elements: {},
    
    // 初期化
    init() {
        this.cacheElements();
    },
    
    // DOM要素をキャッシュ
    cacheElements() {
        this.elements = {
            // 統計
            pendingCount: document.getElementById('pendingCount'),
            completedCount: document.getElementById('completedCount'),
            totalCount: document.getElementById('totalCount'),
            
            // タブ
            patientTab: document.getElementById('patientTab'),
            documentTab: document.getElementById('documentTab'),
            
            // ボタン
            uploadAllBtn: document.getElementById('uploadAllBtn'),
            refreshBtn: document.getElementById('refreshBtn'),
            selectAllCheckbox: document.getElementById('selectAllCheckbox'),
            selectedCount: document.getElementById('selectedCount'),
            
            // フィルター
            searchInput: document.getElementById('searchInput'),
            filterAll: document.getElementById('filterAll'),
            filterPending: document.getElementById('filterPending'),
            filterUploaded: document.getElementById('filterUploaded'),
            categoryFilter: document.getElementById('categoryFilter'),

            // ビューコンテナ
            patientView: document.getElementById('patientView'),
            documentView: document.getElementById('documentView'),
            patientList: document.getElementById('patientList'),
            documentList: document.getElementById('documentList'),
            
            // モーダル
            uploadModal: document.getElementById('uploadModal'),
            confirmModal: document.getElementById('confirmModal'),
            completionModal: document.getElementById('completionModal'),
            progressBar: document.getElementById('progressBar'),
            progressText: document.getElementById('progressText'),
            uploadQueue: document.getElementById('uploadQueue'),
            confirmList: document.getElementById('confirmList'),
            confirmMessage: document.getElementById('confirmMessage'),
            completionDetails: document.getElementById('completionDetails'),
            queueCompleteMessage: document.getElementById('queueCompleteMessage'),
            queueCompleteDetails: document.getElementById('queueCompleteDetails'),

            // モーダルボタン
            closeModalBtn: document.getElementById('closeModalBtn'),
            cancelUploadBtn: document.getElementById('cancelUploadBtn'),
            confirmYesBtn: document.getElementById('confirmYesBtn'),
            confirmNoBtn: document.getElementById('confirmNoBtn'),
            completionOkBtn: document.getElementById('completionOkBtn'),
            
            // トースト
            toastContainer: document.getElementById('toastContainer'),
        };
    },
    
    // 統計情報を更新
    updateStatistics(stats) {
        this.elements.pendingCount.textContent = stats.pending_count || 0;
        this.elements.completedCount.textContent = stats.uploaded_count || 0;
        this.elements.totalCount.textContent = stats.total_count || 0;
    },
    
    // 現在のビューを取得
    getCurrentView() {
        return this.elements.patientView.style.display !== 'none' ? 'patient' : 'document';
    },
    
    // ビューを切り替え
    switchView(view) {
        if (view === 'patient') {
            this.elements.patientView.style.display = 'block';
            this.elements.documentView.style.display = 'none';
            this.elements.patientTab.classList.add('tab--active');
            this.elements.documentTab.classList.remove('tab--active');
        } else {
            this.elements.patientView.style.display = 'none';
            this.elements.documentView.style.display = 'block';
            this.elements.patientTab.classList.remove('tab--active');
            this.elements.documentTab.classList.add('tab--active');
        }
    },
    
    // ファイルリストを表示（メイン関数）
    renderFileList(files) {
        const currentView = this.getCurrentView();
        
        if (currentView === 'patient') {
            this.renderPatientView(files);
        } else {
            this.renderDocumentView(files);
        }
        
        // チェックボックスのイベントを設定
        this.attachFileCheckboxEvents();
    },
    
    // 患者ビューをレンダリング
    renderPatientView(files) {
        // 患者ごとにグループ化
        const groupedFiles = this.groupFilesByPatient(files);
        
        // HTMLを生成
        let html = '';
        for (const [patientId, patientData] of Object.entries(groupedFiles)) {
            html += this.createPatientGroupHTML(patientData);
        }
        
        // 空の場合
        if (html === '') {
            html = `
                <div class="empty-state">
                    <p>📭 アップロード待ちのファイルはありません</p>
                </div>
            `;
        }
        
        this.elements.patientList.innerHTML = html;
    },
    
    // 書類ビューをレンダリング
    renderDocumentView(files) {
        // ファイル名でソート
        const sortedFiles = [...files].sort((a, b) => 
            a.file_name.localeCompare(b.file_name, 'ja')
        );
        
        // ヘッダーを追加
        let html = `
            <div class="document-header">
                <div></div>
                <div>ファイル名</div>
                <div>患者名</div>
                <div>状態</div>
                <div>カテゴリ</div>
                <div>作成日</div>
                <div></div>
            </div>
        `;
        
        // ファイルリスト生成
        for (const file of sortedFiles) {
            html += this.createDocumentItemHTML(file);
        }
        
        // 空の場合
        if (sortedFiles.length === 0) {
            html = `
                <div class="empty-state">
                    <p>📭 アップロード待ちのファイルはありません</p>
                </div>
            `;
        }
        
        this.elements.documentList.innerHTML = html;
    },
    
    // 患者ごとにファイルをグループ化
    groupFilesByPatient(files) {
        const grouped = {};
        
        files.forEach(file => {
            if (!grouped[file.patient_id]) {
                grouped[file.patient_id] = {
                    patient_id: file.patient_id,
                    patient_name: file.patient_name,
                    files: []
                };
            }
            grouped[file.patient_id].files.push(file);
        });
        
        return grouped;
    },
    
    // 患者グループのHTML生成
    createPatientGroupHTML(patientData) {
        const filesHTML = patientData.files.map(file => this.createFileItemHTML(file)).join('');
        
        return `
            <div class="patient-group" data-patient-id="${patientData.patient_id}">
                <div class="patient-group__header">
                    <span class="patient-group__icon">👤</span>
                    <span class="patient-group__name">${patientData.patient_name}</span>
                    <span class="patient-group__id">ID: ${patientData.patient_id}</span>
                    <span class="patient-group__count">(${patientData.files.length}件)</span>
                </div>
                <div class="patient-group__files">
                    ${filesHTML}
                </div>
            </div>
        `;
    },
    
    // ファイルアイテムのHTML生成（患者ビュー用）
    createFileItemHTML(file) {
        const fileSize = file.file_size ? `${(file.file_size / 1024 / 1024).toFixed(1)}MB` : '---';
        const filePath = file.file_id ? `http://localhost:3000/api/files/${file.file_id}` : '#';
        const uploadedBadge = file.isuploaded 
            ? '<span class="file-item__badge file-item__badge--uploaded">済</span>'
            : '<span class="file-item__badge file-item__badge--pending">未</span>';
        
        return `
            <div class="file-item" data-file-id="${file.file_id}">
                <div class="file-item__checkbox">
                    <input type="checkbox" 
                           class="file-checkbox" 
                           data-file-id="${file.file_id}"
                           data-file-info='${JSON.stringify(file).replace(/'/g, '&apos;')}'>
                </div>
                <div class="file-item__name">📄 ${file.file_name}</div>
                <div class="file-item__status">
                    ${uploadedBadge}
                </div>
                <div class="file-item__category">
                    <span class="file-item__badge file-item__badge--category">${file.category}</span>
                </div>
                <div class="file-item__date">${new Date(file.created_at).toLocaleDateString('ja-JP')}</div>
                <div class="file-item__size">${fileSize}</div>
                <a href="${filePath}" 
                   class="file-item__link" 
                   title="ファイルを開く"
                   target="_blank">
                   <i class="fa-solid fa-up-right-from-square"></i>
                </a>
            </div>
        `;
    },
    
    // ドキュメントアイテムのHTML生成（書類ビュー用）
    createDocumentItemHTML(file) {
        const filePath = file.file_id ? `http://localhost:3000/api/files/${file.file_id}` : '#';
        const uploadedBadge = file.isuploaded 
            ? '<span class="document-item__badge document-item__badge--uploaded">済</span>'
            : '<span class="document-item__badge document-item__badge--pending">未</span>';
        
        return `
            <div class="document-item" data-file-id="${file.file_id}">
                <div class="document-item__checkbox">
                    <input type="checkbox" 
                           class="file-checkbox" 
                           data-file-id="${file.file_id}"
                           data-file-info='${JSON.stringify(file).replace(/'/g, '&apos;')}'>
                </div>
                <div class="document-item__title">📄 ${file.file_name}</div>
                <div class="document-item__patient">
                    ${file.patient_name}
                </div>
                <div class="document-item__status">
                    ${uploadedBadge}
                </div>
                <div class="document-item__category">
                    ${file.category}
                </div>
                <div class="document-item__date">
                    ${new Date(file.created_at).toLocaleDateString('ja-JP')}
                </div>
                <a href="${filePath}" 
                   class="document-item__link" 
                   title="ファイルを開く"
                   target="_blank">
                   <i class="fa-solid fa-up-right-from-square"></i>
                </a>
            </div>
        `;
    },
    
    // チェックボックスイベントの設定
    attachFileCheckboxEvents() {
        // レコード全体にクリックイベントを追加
        const fileItems = document.querySelectorAll('.file-item, .document-item');
        fileItems.forEach(item => {
            item.addEventListener('click', (e) => {
                // リンクアイコンのクリックは除外
                if (e.target.closest('.file-item__link, .document-item__link')) {
                    return;
                }
                // チェックボックスを直接クリックした場合も除外
                if (e.target.type === 'checkbox') {
                    return;
                }
                // チェックボックスをトグル
                const checkbox = item.querySelector('.file-checkbox');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    this.updateSelectedCount();
                }
            });
        });
        
        // 既存のチェックボックスイベントも維持
        const checkboxes = document.querySelectorAll('.file-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateSelectedCount());
        });
    },
    
    // 選択数を更新
    updateSelectedCount() {
        // 現在のビューのコンテナを取得
        const currentView = this.getCurrentView();
        const container = currentView === 'patient' 
            ? this.elements.patientList 
            : this.elements.documentList;
        
        // 現在のビューのチェックボックスのみを数える
        const checkboxes = container.querySelectorAll('.file-checkbox:checked');
        const count = checkboxes.length;
        
        this.elements.selectedCount.textContent = `(${count})`;
        this.elements.uploadAllBtn.disabled = count === 0;
        
        // 全選択チェックボックスの状態を更新（現在のビューのみ）
        const allCheckboxes = container.querySelectorAll('.file-checkbox');
        this.elements.selectAllCheckbox.checked = 
            allCheckboxes.length > 0 && count === allCheckboxes.length;
    },
    
    // 選択されたファイルを取得
    getSelectedFiles() {
        const selected = [];
        const checkboxes = document.querySelectorAll('.file-checkbox:checked');
        
        checkboxes.forEach(checkbox => {
            const fileInfo = JSON.parse(checkbox.dataset.fileInfo);
            selected.push(fileInfo);
        });
        
        return selected;
    },
    
    // 全選択/解除
    toggleSelectAll(checked) {
        const checkboxes = document.querySelectorAll('.file-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
        });
        this.updateSelectedCount();
    },
    
    // ローディング表示
    showLoading() {
        const loadingHTML = `
            <div class="loading">
                <div class="loading__spinner"></div>
                <div class="loading__text">読み込み中...</div>
            </div>
        `;
        
        if (this.getCurrentView() === 'patient') {
            this.elements.patientList.innerHTML = loadingHTML;
        } else {
            this.elements.documentList.innerHTML = loadingHTML;
        }
    },
    
    // 確認モーダルを表示
    showConfirmModal(files) {
        const listHTML = files.map(file => 
            `<li>${file.patient_name} - ${file.file_name}</li>`
        ).join('');
        
        this.elements.confirmMessage.textContent = 
            `${files.length}件のファイルをアップロードしますか？`;
        this.elements.confirmList.innerHTML = listHTML;
        this.elements.confirmModal.style.display = 'block';
    },
    
    // 確認モーダルを閉じる
    hideConfirmModal() {
        this.elements.confirmModal.style.display = 'none';
    },
    
    // アップロードモーダルを表示
    showUploadModal() {
        this.elements.uploadModal.style.display = 'block';
        this.elements.closeModalBtn.style.display = 'none';

        // テーブルを表示、完了メッセージを非表示
        const queueTable = document.querySelector('.queue-table');
        if (queueTable) {
            queueTable.style.display = 'table';
        }
        if (this.elements.queueCompleteMessage) {
            this.elements.queueCompleteMessage.style.display = 'none';
        }

        this.updateProgress(0, 0);
    },
    
    // アップロードモーダルを閉じる
    hideUploadModal() {
        this.elements.uploadModal.style.display = 'none';
    },

    // 完了モーダル表示
    showCompletionModal(completed, failed, total) {
        const details = this.elements.completionDetails;

        // 詳細メッセージを作成
        let html = `<p><strong>成功:</strong> ${completed}件</p>`;
        if (failed > 0) {
            html += `<p style="color: #ff6b6b;"><strong>失敗:</strong> ${failed}件</p>`;
        }
        html += `<p><strong>合計:</strong> ${total}件</p>`;

        details.innerHTML = html;
        this.elements.completionModal.style.display = 'block';
    },

    // 完了モーダル非表示
    hideCompletionModal() {
        this.elements.completionModal.style.display = 'none';
    },
    
    // 進行状況を更新
    updateProgress(completed, total) {
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        this.elements.progressBar.style.width = `${percentage}%`;
        this.elements.progressText.textContent = `${completed} / ${total} (${percentage}%)`;
        
        // 完了時
        if (completed === total && total > 0) {
            this.elements.closeModalBtn.style.display = 'block';
            this.elements.cancelUploadBtn.style.display = 'none';
        }
    },
    
    // アップロードキューを更新
    updateUploadQueue(queueItems) {
        const html = queueItems.map(item => {
            const statusInfo = this.getStatusInfo(item.status);
            const elapsedTime = this.calculateElapsedTime(item.created_at);
            const rowClass = item.status === 'processing' ? 'queue-row--processing' :
                           item.status === 'failed' ? 'queue-row--failed' :
                           item.status === 'done' ? 'queue-row--done' : '';

            return `
                <tr class="${rowClass}">
                    <td>#${item.queue_id || '-'}</td>
                    <td>${item.file_name}</td>
                    <td>${item.patient_name}</td>
                    <td>
                        <span class="status-badge status-badge--${item.status}">
                            <span class="status-icon">${statusInfo.icon}</span>
                            <span>${statusInfo.text}</span>
                        </span>
                    </td>
                    <td class="elapsed-time">${elapsedTime}</td>
                </tr>
            `;
        }).join('');

        this.elements.uploadQueue.innerHTML = html;
    },

    // ステータス情報を取得
    getStatusInfo(status) {
        const statusMap = {
            'pending': { icon: '⏳', text: '待機中' },
            'processing': { icon: '🔄', text: '処理中' },
            'done': { icon: '✅', text: '完了' },
            'failed': { icon: '❌', text: '失敗' },
            'canceled': { icon: '⚠️', text: 'キャンセル' }
        };
        return statusMap[status] || { icon: '❓', text: status };
    },

    // 経過時間を計算
    calculateElapsedTime(createdAt) {
        if (!createdAt) return '-';

        const now = new Date();
        const created = new Date(createdAt);
        const diffMs = now - created;
        const diffSec = Math.floor(diffMs / 1000);
        const minutes = Math.floor(diffSec / 60);
        const seconds = diffSec % 60;

        if (minutes > 0) {
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        } else {
            return `0:${seconds.toString().padStart(2, '0')}`;
        }
    },
    
    // トースト通知を表示
    showToast(message, type = 'info') {
        const icons = {
            success: '✅',
            error: '❌',
            info: 'ℹ️',
            warning: '⚠️'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.innerHTML = `
            <span class="toast__icon">${icons[type]}</span>
            <span class="toast__message">${message}</span>
        `;
        
        this.elements.toastContainer.appendChild(toast);
        
        // 3秒後に自動削除
        setTimeout(() => {
            toast.remove();
        }, 3000);
    },
    
    // 単一ファイルアップロード（仮実装）
    async uploadSingleFile(fileId) {
        const file = await this.getFileById(fileId);
        if (file) {
            this.showConfirmModal([file]);
        }
    },
    
    // ファイルIDから情報を取得（仮実装）
    async getFileById(fileId) {
        const checkboxes = document.querySelectorAll('.file-checkbox');
        for (const checkbox of checkboxes) {
            const fileInfo = JSON.parse(checkbox.dataset.fileInfo);
            if (fileInfo.file_id === fileId) {
                return fileInfo;
            }
        }
        return null;
    }
};
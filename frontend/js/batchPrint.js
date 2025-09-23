// PDFバッチ印刷機能モジュール
const BatchPrint = {
  // 状態管理
  state: {
    readyDocuments: [],
    selectedDocuments: [],
    isProcessing: false,
    currentJobId: null,
    progress: {
      current: 0,
      total: 0
    },
    sortBy: 'createdAt',
    sortOrder: 'asc'
  },

  // 定数
  MAX_DOCUMENTS: 200,

  // 初期化
  init() {
    console.log('📑 Batch Print Module initialized');
    this.attachEventListeners();
    this.listenToWebSocket();
  },

  // イベントリスナーの設定
  attachEventListeners() {
    // まとめて印刷ボタンのイベント（キューモニターモーダル内）
    document.addEventListener('click', (e) => {
      if (e.target.id === 'batchPrintBtn' || e.target.closest('#batchPrintBtn')) {
        this.openBatchPrintModal();
      }
    });

    // モーダル内のイベントは動的に設定
  },

  // WebSocketリスナーの設定
  listenToWebSocket() {
    // App.jsのWebSocket接続を利用
    if (window.App && window.App.state.ws) {
      const ws = window.App.state.ws;
      console.log('✅ BatchPrint: WebSocket listener attached successfully');

      ws.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'batchPrintProgress':
              console.log('📊 BatchPrint: Progress update received', data.data);
              this.handleProgress(data.data);
              break;
            case 'batchPrintComplete':
              console.log('✅ BatchPrint: Complete message received', data.data);
              this.handleComplete(data.data);
              break;
            case 'batchPrintError':
              console.log('❌ BatchPrint: Error message received', data.data);
              this.handleError(data.data);
              break;
          }
        } catch (error) {
          console.error('WebSocket message parse error:', error);
        }
      });
    } else {
      console.warn('⚠️ BatchPrint: WebSocket not ready, retrying in 1 second...');
      // WebSocketがまだ準備できていない場合は1秒後に再試行
      setTimeout(() => this.listenToWebSocket(), 1000);
    }
  },

  // ready_to_printドキュメントの取得
  async fetchReadyDocuments() {
    try {
      const params = new URLSearchParams({
        sortBy: this.state.sortBy,
        sortOrder: this.state.sortOrder
      });

      const result = await API.request(`/batch-print/ready-documents?${params}`);

      if (result.success) {
        this.state.readyDocuments = result.data.documents;
        return result.data;
      } else {
        throw new Error(result.error || 'ドキュメントの取得に失敗しました');
      }
    } catch (error) {
      console.error('❌ Error fetching ready documents:', error);
      UI.showToast(error.message, 'error');
      throw error;
    }
  },

  // バッチ印刷モーダルを開く
  async openBatchPrintModal() {
    try {
      // ローディング表示
      UI.showLoading('印刷待ちドキュメントを取得中...');

      // ready_to_printドキュメントを取得
      const data = await this.fetchReadyDocuments();

      UI.hideLoading();

      if (data.total === 0) {
        UI.showToast('印刷待ちのドキュメントがありません', 'info');
        return;
      }

      // モーダルを作成・表示
      this.createAndShowModal(data);

    } catch (error) {
      UI.hideLoading();
      console.error('❌ Error opening batch print modal:', error);
    }
  },

  // モーダルの作成と表示
  createAndShowModal(data) {
    // 既存のモーダルがあれば削除
    const existingModal = document.getElementById('batchPrintModal');
    if (existingModal) {
      existingModal.remove();
    }

    // モーダルHTML
    const modalHTML = `
      <div class="modal" id="batchPrintModal" style="display: block;">
        <div class="modal__overlay"></div>
        <div class="modal__content" style="max-width: 90%; width: 1000px;">
          <div class="modal__header">
            <h2 class="modal__title">📑 まとめて印刷 - 印刷対象選択</h2>
            <button class="modal__close" id="closeBatchPrintBtn">✕</button>
          </div>
          <div class="modal__body" style="max-height: 60vh; overflow-y: auto;">
            <!-- コントロールバー -->
            <div class="batch-print-controls" style="margin-bottom: 15px; padding: 10px; background: #f5f5f5; border-radius: 5px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <button class="btn btn--secondary btn--small" id="selectAllBtn">
                    すべて選択
                  </button>
                  <button class="btn btn--secondary btn--small" id="deselectAllBtn">
                    すべて解除
                  </button>
                  <span style="margin-left: 20px;">
                    選択数: <strong id="selectedCount">0</strong> / ${data.total}
                    <span style="color: #666;">（最大${this.MAX_DOCUMENTS}件）</span>
                  </span>
                </div>
                <div>
                  <label style="margin-right: 10px;">
                    ソート:
                    <select id="sortSelect" style="margin-left: 5px;">
                      <option value="createdAt">作成日時</option>
                      <option value="patientName">患者名</option>
                      <option value="fileName">ファイル名</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>

            <!-- ドキュメントリスト -->
            <div class="document-list">
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background-color: #f0f0f0;">
                    <th style="padding: 8px; text-align: center; width: 40px;">
                      <input type="checkbox" id="headerCheckbox">
                    </th>
                    <th style="padding: 8px; text-align: left;">患者名</th>
                    <th style="padding: 8px; text-align: left;">ファイル名</th>
                    <th style="padding: 8px; text-align: left;">カテゴリ</th>
                    <th style="padding: 8px; text-align: left;">作成日時</th>
                  </tr>
                </thead>
                <tbody id="documentListBody">
                  ${this.renderDocumentRows(data.documents)}
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal__footer" style="display: flex; justify-content: space-between;">
            <button class="btn btn--secondary" id="cancelBatchPrintBtn">
              キャンセル
            </button>
            <button class="btn btn--primary" id="startMergeBtn">
              <span class="btn__icon">🖨️</span>
              <span class="btn__text">PDFを連結して印刷</span>
            </button>
          </div>
        </div>
      </div>
    `;

    // モーダルを追加
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // イベントリスナーを設定
    this.attachModalEventListeners();

    // 初期選択（最大200件まで）
    this.selectInitialDocuments();
  },

  // ドキュメント行のレンダリング
  renderDocumentRows(documents) {
    return documents.map((doc, index) => `
      <tr style="border-bottom: 1px solid #e0e0e0;">
        <td style="padding: 8px; text-align: center;">
          <input type="checkbox" class="doc-checkbox" data-doc-id="${doc.id}" data-index="${index}">
        </td>
        <td style="padding: 8px;">${doc.patientName || '-'}</td>
        <td style="padding: 8px;">${doc.fileName || '-'}</td>
        <td style="padding: 8px;">${doc.category || '-'}</td>
        <td style="padding: 8px;">${new Date(doc.createdAt).toLocaleString('ja-JP')}</td>
      </tr>
    `).join('');
  },

  // モーダルのイベントリスナー設定
  attachModalEventListeners() {
    // 閉じるボタン
    document.getElementById('closeBatchPrintBtn')?.addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('cancelBatchPrintBtn')?.addEventListener('click', () => {
      this.closeModal();
    });

    // オーバーレイクリックで閉じる
    document.querySelector('#batchPrintModal .modal__overlay')?.addEventListener('click', () => {
      this.closeModal();
    });

    // すべて選択
    document.getElementById('selectAllBtn')?.addEventListener('click', () => {
      this.selectAll();
    });

    // すべて解除
    document.getElementById('deselectAllBtn')?.addEventListener('click', () => {
      this.deselectAll();
    });

    // ヘッダーチェックボックス
    document.getElementById('headerCheckbox')?.addEventListener('change', (e) => {
      if (e.target.checked) {
        this.selectAll();
      } else {
        this.deselectAll();
      }
    });

    // 個別チェックボックス
    document.querySelectorAll('.doc-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        this.updateSelection();
      });
    });

    // ソート変更
    document.getElementById('sortSelect')?.addEventListener('change', async (e) => {
      this.state.sortBy = e.target.value;
      await this.refreshDocumentList();
    });

    // 連結開始
    document.getElementById('startMergeBtn')?.addEventListener('click', () => {
      this.startMerge();
    });
  },

  // 初期選択（最大200件）
  selectInitialDocuments() {
    const checkboxes = document.querySelectorAll('.doc-checkbox');
    const limit = Math.min(checkboxes.length, this.MAX_DOCUMENTS);

    for (let i = 0; i < limit; i++) {
      checkboxes[i].checked = true;
    }

    this.updateSelection();
  },

  // すべて選択
  selectAll() {
    const checkboxes = document.querySelectorAll('.doc-checkbox');
    const limit = Math.min(checkboxes.length, this.MAX_DOCUMENTS);

    checkboxes.forEach((checkbox, index) => {
      checkbox.checked = index < limit;
    });

    this.updateSelection();

    if (checkboxes.length > this.MAX_DOCUMENTS) {
      UI.showToast(`最大${this.MAX_DOCUMENTS}件まで選択可能です`, 'warning');
    }
  },

  // すべて解除
  deselectAll() {
    document.querySelectorAll('.doc-checkbox').forEach(checkbox => {
      checkbox.checked = false;
    });

    this.updateSelection();
  },

  // 選択状態の更新
  updateSelection() {
    const checkboxes = document.querySelectorAll('.doc-checkbox:checked');
    const count = checkboxes.length;

    // 最大数チェック
    if (count > this.MAX_DOCUMENTS) {
      // 超過分のチェックを外す
      for (let i = this.MAX_DOCUMENTS; i < count; i++) {
        checkboxes[i].checked = false;
      }

      UI.showToast(`最大${this.MAX_DOCUMENTS}件まで選択可能です`, 'warning');
    }

    // 選択されたドキュメントIDを収集
    this.state.selectedDocuments = Array.from(document.querySelectorAll('.doc-checkbox:checked'))
      .map(cb => parseInt(cb.dataset.docId));

    // カウント更新
    document.getElementById('selectedCount').textContent = this.state.selectedDocuments.length;

    // ヘッダーチェックボックスの状態更新
    const allCheckboxes = document.querySelectorAll('.doc-checkbox');
    const headerCheckbox = document.getElementById('headerCheckbox');
    if (headerCheckbox) {
      headerCheckbox.checked = this.state.selectedDocuments.length === allCheckboxes.length;
      headerCheckbox.indeterminate = this.state.selectedDocuments.length > 0 &&
                                     this.state.selectedDocuments.length < allCheckboxes.length;
    }

    // 開始ボタンの有効/無効
    const startBtn = document.getElementById('startMergeBtn');
    if (startBtn) {
      startBtn.disabled = this.state.selectedDocuments.length === 0;
    }
  },

  // PDF連結開始
  async startMerge() {
    if (this.state.selectedDocuments.length === 0) {
      UI.showToast('ドキュメントが選択されていません', 'warning');
      return;
    }

    if (!confirm(`${this.state.selectedDocuments.length}件のPDFを連結しますか？`)) {
      return;
    }

    try {
      this.closeModal();
      this.showProgressModal();

      const result = await API.request('/batch-print/merge', {
        method: 'POST',
        body: JSON.stringify({
          documentIds: this.state.selectedDocuments,
          sortBy: this.state.sortBy,
          sortOrder: this.state.sortOrder
        })
      });

      if (result.success) {
        this.state.currentJobId = result.data.jobId;
        this.state.progress.total = result.data.documentCount;
        this.state.isProcessing = true;

        // DOM更新を追加 - totalProgressの値を更新
        const totalProgressEl = document.getElementById('totalProgress');
        if (totalProgressEl) {
          totalProgressEl.textContent = result.data.documentCount;
        }

        UI.showToast('PDF連結処理を開始しました', 'success');
      } else {
        throw new Error(result.error || 'PDF連結の開始に失敗しました');
      }

    } catch (error) {
      console.error('❌ Error starting merge:', error);
      UI.showToast(error.message, 'error');
      this.closeProgressModal();
    }
  },

  // 進捗モーダルの表示
  showProgressModal() {
    const modalHTML = `
      <div class="modal" id="batchPrintProgressModal" style="display: block;">
        <div class="modal__overlay"></div>
        <div class="modal__content" style="max-width: 500px;">
          <div class="modal__header">
            <h2 class="modal__title">🔄 PDF連結処理中...</h2>
          </div>
          <div class="modal__body" style="padding: 30px; text-align: center;">
            <div class="progress-bar" style="background: #e0e0e0; height: 30px; border-radius: 15px; overflow: hidden; margin-bottom: 20px;">
              <div id="progressBarFill" style="background: linear-gradient(90deg, #4CAF50, #8BC34A); height: 100%; width: 0%; transition: width 0.3s; display: flex; align-items: center; justify-content: center;">
                <span id="progressText" style="color: white; font-weight: bold;">0%</span>
              </div>
            </div>
            <div id="progressMessage">
              処理中: <span id="currentProgress">0</span> / <span id="totalProgress">0</span> 件
            </div>
            <div style="margin-top: 20px; color: #666;">
              しばらくお待ちください...
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.getElementById('totalProgress').textContent = this.state.progress.total;
  },

  // 進捗更新処理
  handleProgress(data) {
    if (data.jobId !== this.state.currentJobId) return;

    this.state.progress.current = data.current;
    this.state.progress.total = data.total;

    const percentage = Math.round((data.current / data.total) * 100);

    // プログレスバー更新
    const progressFill = document.getElementById('progressBarFill');
    const progressText = document.getElementById('progressText');
    const currentProgress = document.getElementById('currentProgress');
    const totalProgress = document.getElementById('totalProgress');

    if (progressFill) {
      progressFill.style.width = `${percentage}%`;
    }
    if (progressText) {
      progressText.textContent = `${percentage}%`;
    }
    if (currentProgress) {
      currentProgress.textContent = data.current;
    }
    // totalの更新も追加
    if (totalProgress && data.total) {
      totalProgress.textContent = data.total;
    }
  },

  // 完了処理
  handleComplete(data) {
    if (data.jobId !== this.state.currentJobId) return;

    this.closeProgressModal();

    // 完了モーダルを表示
    this.showCompletionModal(data);

    // 状態リセット
    this.resetState();
  },

  // エラー処理
  handleError(data) {
    if (data.jobId !== this.state.currentJobId) return;

    this.closeProgressModal();
    UI.showToast(`PDF連結エラー: ${data.message}`, 'error');
    this.resetState();
  },

  // ドキュメントリストの更新
  async refreshDocumentList() {
    try {
      const data = await this.fetchReadyDocuments();

      const tbody = document.getElementById('documentListBody');
      if (tbody) {
        tbody.innerHTML = this.renderDocumentRows(data.documents);
        this.attachModalEventListeners();
        this.selectInitialDocuments();
      }
    } catch (error) {
      console.error('❌ Error refreshing document list:', error);
    }
  },

  // モーダルを閉じる
  closeModal() {
    const modal = document.getElementById('batchPrintModal');
    if (modal) {
      modal.remove();
    }
  },

  // 進捗モーダルを閉じる
  closeProgressModal() {
    const modal = document.getElementById('batchPrintProgressModal');
    if (modal) {
      modal.remove();
    }
  },

  // 状態をリセット
  resetState() {
    this.state.selectedDocuments = [];
    this.state.isProcessing = false;
    this.state.currentJobId = null;
    this.state.progress = { current: 0, total: 0 };
  },

  // 完了モーダルを表示
  showCompletionModal(data) {
    // 既存のモーダルがあれば削除
    const existingModal = document.getElementById('batchPrintCompleteModal');
    if (existingModal) {
      existingModal.remove();
    }

    const modalHTML = `
      <div class="modal" id="batchPrintCompleteModal" style="display: block;">
        <div class="modal__overlay"></div>
        <div class="modal__content" style="max-width: 500px;">
          <div class="modal__header">
            <h2 class="modal__title">✅ PDF連結完了</h2>
          </div>
          <div class="modal__body" style="padding: 30px; text-align: center;">
            <p style="font-size: 18px; margin-bottom: 20px; font-weight: 500;">
              ${data.successCount}件のドキュメントを連結しました。
              ${data.failedCount > 0 ? `<br><span style="color: #ff9800;">（${data.failedCount}件は処理に失敗しました）</span>` : ''}
            </p>
            <p style="color: #666; font-size: 16px;">
              印刷か保存を行ってください。
            </p>
          </div>
          <div class="modal__footer" style="text-align: center;">
            <button class="btn btn--primary" id="okBatchPrintCompleteBtn" style="min-width: 120px;">
              OK
            </button>
          </div>
        </div>
      </div>
    `;

    // モーダルを追加
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // OKボタンのイベントリスナー
    const okBtn = document.getElementById('okBatchPrintCompleteBtn');
    if (okBtn) {
      okBtn.addEventListener('click', () => {
        // モーダルを閉じる
        const modal = document.getElementById('batchPrintCompleteModal');
        if (modal) {
          modal.remove();
        }

        // PDFを新しいタブで開く
        window.open(`http://localhost:3000/api/batch-print/view/${data.batchId}`, '_blank');
      });

      // フォーカスをOKボタンに設定
      okBtn.focus();
    }

    // オーバーレイクリックでも閉じるように
    const overlay = document.querySelector('#batchPrintCompleteModal .modal__overlay');
    if (overlay) {
      overlay.addEventListener('click', () => {
        const modal = document.getElementById('batchPrintCompleteModal');
        if (modal) {
          modal.remove();
        }
        // PDFを新しいタブで開く
        window.open(`http://localhost:3000/api/batch-print/view/${data.batchId}`, '_blank');
      });
    }
  }
};

// 初期化（DOMContentLoadedで呼び出される）
document.addEventListener('DOMContentLoaded', () => {
  if (!window.BatchPrint) {
    window.BatchPrint = BatchPrint;
    BatchPrint.init();
  }
});
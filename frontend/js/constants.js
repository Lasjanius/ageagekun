// ステータス定義（定数化）
const QUEUE_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  UPLOADED: 'uploaded',
  READY_TO_PRINT: 'ready_to_print',
  DONE: 'done',
  FAILED: 'failed',
  CANCELED: 'canceled'
};

// アクティブなステータス（処理中とみなすステータス）
const ACTIVE_STATUSES = [
  QUEUE_STATUS.PENDING,
  QUEUE_STATUS.PROCESSING,
  QUEUE_STATUS.UPLOADED,
  QUEUE_STATUS.READY_TO_PRINT
];

// 完了ステータス（ready_to_printを完了として扱う）
const COMPLETE_STATUSES = [
  QUEUE_STATUS.READY_TO_PRINT,  // 印刷待ち=実質完了
  QUEUE_STATUS.DONE,
  QUEUE_STATUS.FAILED,
  QUEUE_STATUS.CANCELED
];

// ステータス表示設定
const STATUS_CONFIG = {
  [QUEUE_STATUS.PENDING]: {
    label: '処理待ち',
    color: '#6c757d',
    bgColor: 'rgba(108, 117, 125, 0.1)',
    icon: '⏳',
    description: 'キューに登録済み、処理開始待ち'
  },
  [QUEUE_STATUS.PROCESSING]: {
    label: '処理中',
    color: '#007bff',
    bgColor: 'rgba(0, 123, 255, 0.1)',
    icon: '🔄',
    description: 'モバカルネットへアップロード中'
  },
  [QUEUE_STATUS.UPLOADED]: {
    label: 'アップロード完了',
    color: '#17a2b8',
    bgColor: 'rgba(23, 162, 184, 0.1)',
    icon: '☁️',
    description: 'アップロード完了、印刷準備中'
  },
  [QUEUE_STATUS.READY_TO_PRINT]: {
    label: '印刷待ち',
    color: '#ffc107',
    bgColor: 'rgba(255, 193, 7, 0.1)',
    icon: '🖨️',
    description: '印刷待機中'
  },
  [QUEUE_STATUS.DONE]: {
    label: '完了',
    color: '#28a745',
    bgColor: 'rgba(40, 167, 69, 0.1)',
    icon: '✅',
    description: '全処理完了'
  },
  [QUEUE_STATUS.FAILED]: {
    label: 'エラー',
    color: '#dc3545',
    bgColor: 'rgba(220, 53, 69, 0.1)',
    icon: '❌',
    description: '処理失敗'
  },
  [QUEUE_STATUS.CANCELED]: {
    label: 'キャンセル',
    color: '#6c757d',
    bgColor: 'rgba(108, 117, 125, 0.1)',
    icon: '⛔',
    description: 'ユーザーによりキャンセル'
  }
};

// ヘルパー関数
const StatusHelper = {
  // ステータスがアクティブかどうか
  isActive: (status) => ACTIVE_STATUSES.includes(status),

  // ステータスが完了かどうか
  isComplete: (status) => COMPLETE_STATUSES.includes(status),

  // ステータスの表示情報を取得
  getConfig: (status) => STATUS_CONFIG[status] || STATUS_CONFIG[QUEUE_STATUS.PENDING],

  // ステータスのラベルを取得
  getLabel: (status) => {
    const config = STATUS_CONFIG[status];
    return config ? config.label : status;
  },

  // ステータスの色を取得
  getColor: (status) => {
    const config = STATUS_CONFIG[status];
    return config ? config.color : '#6c757d';
  },

  // ステータスのアイコンを取得
  getIcon: (status) => {
    const config = STATUS_CONFIG[status];
    return config ? config.icon : '❓';
  },

  // ステータスバッジのHTMLを生成
  createBadge: (status) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG[QUEUE_STATUS.PENDING];
    return `<span class="status-badge" style="background-color: ${config.bgColor}; color: ${config.color}; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">
      ${config.icon} ${config.label}
    </span>`;
  }
};

// エクスポート（グローバル変数として使用）
if (typeof window !== 'undefined') {
  window.QUEUE_STATUS = QUEUE_STATUS;
  window.ACTIVE_STATUSES = ACTIVE_STATUSES;
  window.COMPLETE_STATUSES = COMPLETE_STATUSES;
  window.STATUS_CONFIG = STATUS_CONFIG;
  window.StatusHelper = StatusHelper;
}
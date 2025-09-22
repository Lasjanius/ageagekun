const { PDFDocument } = require('pdf-lib');
const fs = require('fs-extra');
const path = require('path');
const db = require('../config/database');

// 定数
const BATCH_PRINT_DIR = path.join(__dirname, '../../patients/batch_prints');
const PATIENTS_BASE_DIR = path.join(__dirname, '../../patients');
const MAX_DOCUMENTS = 200;
const MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 500MB

// シンプルな非同期ジョブキュー（Redis不要）
class SimpleJobQueue {
  constructor() {
    this.jobs = [];
    this.processing = false;
    this.currentJobId = 0;
  }

  async add(jobData) {
    const job = {
      id: ++this.currentJobId,
      data: jobData,
      status: 'pending'
    };

    this.jobs.push(job);

    // 処理中でなければ処理開始
    if (!this.processing) {
      this.process();
    }

    return { id: job.id, status: 'processing' };
  }

  async process() {
    if (this.processing || this.jobs.length === 0) return;

    this.processing = true;

    while (this.jobs.length > 0) {
      const job = this.jobs.shift();

      try {
        job.status = 'processing';
        const result = await mergePDFs(job.data.documentIds, job.id);

        // 処理完了通知
        if (wsService) {
          wsService.broadcast({
            type: 'batchPrintComplete',
            data: {
              batchId: result.id,
              successCount: result.success_ids.length,
              failedCount: result.failed_ids.length,
              jobId: job.id
            }
          });
        }

        job.status = 'completed';
        job.result = result;

      } catch (error) {
        console.error(`ジョブ処理エラー (ID: ${job.id}):`, error);
        job.status = 'failed';
        job.error = error.message;

        // エラー通知
        if (wsService) {
          wsService.broadcast({
            type: 'batchPrintError',
            data: {
              message: error.message,
              jobId: job.id
            }
          });
        }
      }

      // イベントループをブロックしないように
      await new Promise(resolve => setImmediate(resolve));
    }

    this.processing = false;
  }
}

// ジョブキューのインスタンス
const jobQueue = new SimpleJobQueue();

// WebSocketサービスのインスタンス取得用関数
let wsService = null;
const setWebSocketService = (service) => {
  wsService = service;
};

// ステータス定義
const QUEUE_STATUS = {
  READY_TO_PRINT: 'ready_to_print',
  MERGING: 'merging',
  DONE: 'done'
};

/**
 * ファイルパスのセキュリティ検証
 */
const validateFilePath = (filePath) => {
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(PATIENTS_BASE_DIR);

  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error('無効なファイルパスです');
  }

  return resolvedPath;
};

/**
 * documentIdsの妥当性検証
 */
const validateDocumentIds = async (documentIds) => {
  const client = await db.getClient();

  try {
    const query = `
      SELECT id
      FROM rpa_queue
      WHERE id = ANY($1::int[]) AND status = $2
    `;

    const result = await client.query(query, [documentIds, QUEUE_STATUS.READY_TO_PRINT]);

    if (result.rows.length !== documentIds.length) {
      const validIds = result.rows.map(r => r.id);
      const invalidIds = documentIds.filter(id => !validIds.includes(id));
      throw new Error(`無効なドキュメントIDが含まれています: ${invalidIds.join(', ')}`);
    }

    return true;
  } finally {
    client.release();
  }
};

/**
 * PDFの総サイズチェック
 */
const checkTotalSize = async (documentIds) => {
  const client = await db.getClient();

  try {
    let totalSize = 0;

    for (const id of documentIds) {
      const query = `
        SELECT d.pass
        FROM rpa_queue q
        JOIN Documents d ON d.fileID = q.file_id
        WHERE q.id = $1
      `;

      const result = await client.query(query, [id]);

      if (result.rows[0]?.pass) {
        const filePath = validateFilePath(result.rows[0].pass);

        if (await fs.pathExists(filePath)) {
          const stats = await fs.stat(filePath);
          totalSize += stats.size;

          if (totalSize > MAX_TOTAL_SIZE) {
            throw new Error(`PDFの総サイズが制限（${MAX_TOTAL_SIZE / 1024 / 1024}MB）を超えています`);
          }
        }
      }
    }

    return totalSize;
  } finally {
    client.release();
  }
};

/**
 * ready_to_printステータスのドキュメントを取得
 */
const getReadyDocuments = async (sortBy = 'createdAt', sortOrder = 'asc') => {
  const client = await db.getClient();

  try {
    // ソート用のカラムマッピング
    const sortColumns = {
      patientName: 'p.patientName',
      fileName: 'd.fileName',
      createdAt: 'q.created_at'
    };

    const sortColumn = sortColumns[sortBy] || 'q.created_at';
    const order = sortOrder === 'desc' ? 'DESC' : 'ASC';

    const query = `
      SELECT
        q.id,
        q.file_id as "fileId",
        q.patient_id as "patientId",
        p.patientName as "patientName",
        d.fileName as "fileName",
        q.payload->>'category' as category,
        d.pass as "filePath",
        q.created_at as "createdAt"
      FROM rpa_queue q
      JOIN Documents d ON d.fileID = q.file_id
      JOIN patients p ON p.patientID = q.patient_id
      WHERE q.status = $1
      ORDER BY ${sortColumn} ${order}
    `;

    const result = await client.query(query, [QUEUE_STATUS.READY_TO_PRINT]);

    return {
      documents: result.rows,
      total: result.rows.length
    };
  } finally {
    client.release();
  }
};

/**
 * キューのステータスを更新
 */
const updateQueueStatus = async (queueId, status, errorMessage = null) => {
  const client = await db.getClient();

  try {
    const query = errorMessage
      ? `UPDATE rpa_queue
         SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`
      : `UPDATE rpa_queue
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`;

    const params = errorMessage
      ? [status, errorMessage, queueId]
      : [status, queueId];

    await client.query(query, params);
  } finally {
    client.release();
  }
};

/**
 * ファイルパスからドキュメント情報を取得
 */
const getFilePathFromQueue = async (queueId) => {
  const client = await db.getClient();

  try {
    const query = `
      SELECT d.pass
      FROM rpa_queue q
      JOIN Documents d ON d.fileID = q.file_id
      WHERE q.id = $1
    `;

    const result = await client.query(query, [queueId]);
    return result.rows[0]?.pass;
  } finally {
    client.release();
  }
};

/**
 * batch_printsテーブルに記録を保存
 */
const saveBatchPrint = async (data) => {
  const client = await db.getClient();

  try {
    const query = `
      INSERT INTO batch_prints (
        file_name, file_path, file_size, page_count,
        document_count, document_ids, success_ids, failed_ids
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;

    const result = await client.query(query, [
      data.file_name,
      data.file_path,
      data.file_size,
      data.page_count,
      data.document_count,
      data.document_ids,
      data.success_ids,
      data.failed_ids
    ]);

    return { ...data, id: result.rows[0].id };
  } finally {
    client.release();
  }
};

/**
 * PDFを連結する（メイン処理）
 */
const mergePDFs = async (documentIds, jobId = null) => {
  console.log(`🔄 PDF連結処理開始: ${documentIds.length}件のドキュメント`);

  // 事前検証
  if (documentIds.length > MAX_DOCUMENTS) {
    throw new Error(`最大${MAX_DOCUMENTS}件まで選択可能です`);
  }

  // documentIdsの妥当性チェック
  await validateDocumentIds(documentIds);

  // 総サイズチェック
  const totalSize = await checkTotalSize(documentIds);
  console.log(`📊 PDFの総サイズ: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);

  const mergedPdf = await PDFDocument.create();
  const results = { success: [], failed: [] };

  for (let i = 0; i < documentIds.length; i++) {
    const docId = documentIds[i];

    try {
      // ステータスをmergingに更新
      await updateQueueStatus(docId, QUEUE_STATUS.MERGING);

      // PDFファイルのパスを取得
      const filePath = await getFilePathFromQueue(docId);
      if (!filePath) {
        throw new Error('ファイルパスが見つかりません');
      }

      // パスのセキュリティ検証
      const validatedPath = validateFilePath(filePath);

      // ファイルの存在確認
      if (!await fs.pathExists(validatedPath)) {
        throw new Error(`ファイルが存在しません: ${validatedPath}`);
      }

      // PDFファイル読み込み
      const pdfBytes = await fs.readFile(validatedPath);
      const pdfDoc = await PDFDocument.load(pdfBytes, {
        ignoreEncryption: true  // 破損ファイル対策
      });

      // ページをコピー
      const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));

      // 成功したらdoneに更新
      await updateQueueStatus(docId, QUEUE_STATUS.DONE);
      results.success.push(docId);

      // 進捗通知
      if (wsService) {
        wsService.broadcast({
          type: 'batchPrintProgress',
          data: {
            current: results.success.length + results.failed.length,
            total: documentIds.length,
            jobId
          }
        });
      }

      console.log(`✅ PDF処理成功 (${i + 1}/${documentIds.length}): ID=${docId}`);

      // イベントループをブロックしないように
      if (i % 10 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }

    } catch (error) {
      console.error(`❌ PDF処理エラー (ID: ${docId}):`, error.message);
      results.failed.push(docId);
      // エラーの場合はmergingのまま（可視化）
      await updateQueueStatus(docId, QUEUE_STATUS.MERGING, error.message);
    }
  }

  // 成功したドキュメントがない場合はエラー
  if (results.success.length === 0) {
    throw new Error('すべてのPDFの処理に失敗しました');
  }

  // 連結PDFを保存
  const pdfBytes = await mergedPdf.save();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const fileName = `batch_${timestamp}.pdf`;
  const filePath = path.join(BATCH_PRINT_DIR, fileName);

  // ディレクトリの確認と作成
  await fs.ensureDir(BATCH_PRINT_DIR);
  await fs.writeFile(filePath, pdfBytes);

  // batch_printsテーブルに記録
  const batchRecord = await saveBatchPrint({
    file_name: fileName,
    file_path: filePath,
    file_size: pdfBytes.length,
    page_count: mergedPdf.getPageCount(),
    document_count: documentIds.length,
    document_ids: documentIds,
    success_ids: results.success,
    failed_ids: results.failed
  });

  console.log(`✅ PDF連結完了: ${fileName} (${results.success.length}件成功, ${results.failed.length}件失敗)`);

  return batchRecord;
};

/**
 * ジョブキューにPDF連結タスクを追加
 */
const addMergeJob = async (documentIds, sortBy, sortOrder) => {
  // documentIds の基本検証
  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    throw new Error('ドキュメントが選択されていません');
  }

  if (documentIds.length > MAX_DOCUMENTS) {
    throw new Error(`最大${MAX_DOCUMENTS}件まで選択可能です`);
  }

  // ジョブキューに追加
  const job = await jobQueue.add({
    documentIds,
    sortBy,
    sortOrder,
    timestamp: new Date().toISOString()
  });

  return job;
};

/**
 * 連結PDF履歴を取得
 */
const getBatchPrintHistory = async () => {
  const client = await db.getClient();

  try {
    const query = `
      SELECT
        id,
        file_name as "fileName",
        file_size as "fileSize",
        page_count as "pageCount",
        document_count as "documentCount",
        created_at as "createdAt",
        CASE
          WHEN created_at < NOW() - INTERVAL '60 days'
          THEN true
          ELSE false
        END as "isOld"
      FROM batch_prints
      ORDER BY created_at DESC
    `;

    const result = await client.query(query);

    const oldCount = result.rows.filter(r => r.isOld).length;

    return {
      prints: result.rows,
      oldCount
    };
  } finally {
    client.release();
  }
};

/**
 * 連結PDFを取得
 */
const getBatchPrint = async (batchId) => {
  const client = await db.getClient();

  try {
    const query = `
      SELECT file_path, file_name
      FROM batch_prints
      WHERE id = $1
    `;

    const result = await client.query(query, [batchId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } finally {
    client.release();
  }
};

/**
 * 連結PDFを削除（物理削除）
 */
const deleteBatchPrint = async (batchId) => {
  const client = await db.getClient();

  try {
    // ファイル情報を取得
    const query = `
      SELECT file_path
      FROM batch_prints
      WHERE id = $1
    `;

    const result = await client.query(query, [batchId]);

    if (result.rows.length === 0) {
      throw new Error('PDFが見つかりません');
    }

    const { file_path } = result.rows[0];

    // パスのセキュリティ検証（batch_printsディレクトリ内のみ削除可能）
    const resolvedPath = path.resolve(file_path);
    const resolvedBase = path.resolve(BATCH_PRINT_DIR);

    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new Error('無効なファイルパスです');
    }

    // 物理ファイルを削除
    if (await fs.pathExists(resolvedPath)) {
      await fs.unlink(resolvedPath);
      console.log(`🗑️ PDFファイルを削除: ${path.basename(resolvedPath)}`);
    }

    // DBレコードを削除
    await client.query('DELETE FROM batch_prints WHERE id = $1', [batchId]);

    return { success: true, message: 'PDFが正常に削除されました' };
  } finally {
    client.release();
  }
};

module.exports = {
  setWebSocketService,
  getReadyDocuments,
  addMergeJob,
  mergePDFs,
  getBatchPrintHistory,
  getBatchPrint,
  deleteBatchPrint
};
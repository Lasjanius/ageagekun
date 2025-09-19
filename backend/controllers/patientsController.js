const db = require('../config/database');

// 全患者一覧取得
const getAllPatients = async (req, res) => {
  try {
    const query = `
      SELECT
        patientID,
        patientName,
        birthdate,
        address,
        cm_name,
        office_name,
        vns_name,
        created_at
      FROM patient_full_view
      ORDER BY patientName
    `;

    const result = await db.query(query);

    res.json({
      success: true,
      count: result.rows.length,
      patients: result.rows
    });
  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch patients'
    });
  }
};

// 患者ID指定で詳細取得
const getPatientById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        patientID,
        patientName,
        birthdate,
        address,
        cm_id,
        cm_name,
        office_id,
        office_name,
        office_address,
        vns_id,
        vns_name,
        vns_address,
        vns_tel,
        created_at
      FROM patient_full_view
      WHERE patientID = $1
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Patient not found'
      });
    }

    res.json({
      success: true,
      patient: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching patient:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch patient'
    });
  }
};

// 患者をIDまたは名前で検索（書類履歴付き）
const searchPatient = async (req, res) => {
  try {
    const { patientId, patientName } = req.query;

    if (!patientId && !patientName) {
      return res.status(400).json({
        success: false,
        error: '患者IDまたは患者名を指定してください'
      });
    }

    let query;
    let params = [];

    // 患者IDが指定されている場合は優先
    if (patientId) {
      query = `
        WITH patient_info AS (
          SELECT
            p.patientID,
            p.patientName,
            p.birthdate,
            p.address,
            p.cm_id,
            p.cm_name,
            p.office_id,
            p.office_name,
            p.office_address,
            p.vns_id,
            p.vns_name,
            p.vns_address,
            p.vns_tel
          FROM patient_full_view p
          WHERE p.patientID = $1
        ),
        recent_docs AS (
          SELECT
            d.patientID,
            json_agg(
              json_build_object(
                'fileId', d.fileID,
                'fileName', d.fileName,
                'category', d.Category,
                'createdAt', d.created_at::date::text,
                'isAIGenerated', COALESCE(d.is_ai_generated, false)
              ) ORDER BY d.created_at DESC
            ) as recent_reports
          FROM Documents d
          WHERE d.patientID = $1
            AND d.is_ai_generated = true
          GROUP BY d.patientID
          LIMIT 10
        )
        SELECT
          pi.*,
          COALESCE(rd.recent_reports, '[]'::json) as recent_reports
        FROM patient_info pi
        LEFT JOIN recent_docs rd ON pi.patientID = rd.patientID
      `;
      params = [patientId];
    } else if (patientName) {
      // 患者名で部分一致検索
      query = `
        WITH patient_info AS (
          SELECT
            p.patientID,
            p.patientName,
            p.birthdate,
            p.address,
            p.cm_id,
            p.cm_name,
            p.office_id,
            p.office_name,
            p.office_address,
            p.vns_id,
            p.vns_name,
            p.vns_address,
            p.vns_tel
          FROM patient_full_view p
          WHERE p.patientName LIKE $1
          ORDER BY p.patientName
          LIMIT 1
        ),
        recent_docs AS (
          SELECT
            d.patientID,
            json_agg(
              json_build_object(
                'fileId', d.fileID,
                'fileName', d.fileName,
                'category', d.Category,
                'createdAt', d.created_at::date::text,
                'isAIGenerated', COALESCE(d.is_ai_generated, false)
              ) ORDER BY d.created_at DESC
            ) as recent_reports
          FROM Documents d
          JOIN patient_info pi ON d.patientID = pi.patientID
          WHERE d.is_ai_generated = true
          GROUP BY d.patientID
          LIMIT 10
        )
        SELECT
          pi.*,
          COALESCE(rd.recent_reports, '[]'::json) as recent_reports
        FROM patient_info pi
        LEFT JOIN recent_docs rd ON pi.patientID = rd.patientID
      `;
      params = [`%${patientName}%`];
    }

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: '該当する患者が見つかりませんでした'
      });
    }

    res.json({
      success: true,
      patient: result.rows[0]
    });
  } catch (error) {
    console.error('Error searching patient:', error);
    res.status(500).json({
      success: false,
      error: '患者検索に失敗しました'
    });
  }
};

// 年齢計算ヘルパー関数
const calculateAge = (birthdate) => {
  const birth = new Date(birthdate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
};

// 患者情報を報告書用に整形
const getPatientForReport = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        patientID,
        patientName,
        birthdate,
        address,
        cm_id,
        cm_name,
        office_id,
        office_name,
        office_address,
        vns_id,
        vns_name,
        vns_address,
        vns_tel
      FROM patient_full_view
      WHERE patientID = $1
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Patient not found'
      });
    }

    const patient = result.rows[0];

    // 報告書用にデータを整形
    const reportData = {
      patientId: patient.patientid,
      patientName: patient.patientname,
      birthdate: patient.birthdate,
      age: calculateAge(patient.birthdate),
      address: patient.address || '',
      cmName: patient.cm_name || '',
      officeName: patient.office_name || '',
      officeAddress: patient.office_address || '',
      vnsName: patient.vns_name || '',
      vnsAddress: patient.vns_address || '',
      vnsTel: patient.vns_tel || ''
    };

    res.json({
      success: true,
      data: reportData
    });
  } catch (error) {
    console.error('Error fetching patient for report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch patient data'
    });
  }
};

// 居宅療養管理指導報告書用データ取得
const getKyotakuReportData = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        patientID,
        patientName,
        birthdate,
        address,
        cm_id,
        cm_name,
        office_id,
        office_name,
        office_address,
        vns_id,
        vns_name,
        vns_address,
        vns_tel
      FROM patient_full_view
      WHERE patientID = $1
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Patient not found'
      });
    }

    const patient = result.rows[0];

    // 居宅療養管理指導報告書用データ
    const kyotakuData = {
      // 患者基本情報
      patient_id: patient.patientid,
      patient_name: patient.patientname,
      birthdate: patient.birthdate ? new Date(patient.birthdate).toLocaleDateString('ja-JP') : '',
      age: calculateAge(patient.birthdate),
      address: patient.address || '',

      // ケアマネージャー情報
      cm_name: patient.cm_name || '',

      // 居宅介護支援事業所情報（重要）
      homecare_office_name: patient.office_name || '',
      homecare_office_address: patient.office_address || '',

      // 訪問看護ステーション情報
      vns_name: patient.vns_name || '',
      vns_address: patient.vns_address || '',
      vns_tel: patient.vns_tel || '',

      // 報告書用の日付情報（サンプル）
      period_start: new Date(new Date().setDate(1)).toLocaleDateString('ja-JP'),
      period_end: new Date(new Date().setMonth(new Date().getMonth() + 1, 0)).toLocaleDateString('ja-JP'),
      exam_date: new Date().toLocaleDateString('ja-JP'),
      next_exam_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toLocaleDateString('ja-JP'),

      // 動的データ（実装時はDBから取得すべき）
      // フォールバック値を削除し、空またはnullで返す
      doctor_name: null,  // AIまたはユーザー入力から取得
      care_level: null,    // AIまたはユーザー入力から取得
      primary_disease: null, // AIまたはユーザー入力から取得
      medical_content: null, // AIまたはユーザー入力から取得
      advices: [],  // AIまたはユーザー入力から取得
      generated_date: new Date().toLocaleString('ja-JP')
    };

    res.json({
      success: true,
      data: kyotakuData
    });
  } catch (error) {
    console.error('Error fetching kyotaku report data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch kyotaku report data'
    });
  }
};

// AI報告書のメタデータを含む患者リスト取得
const getPatientsWithAIStatus = async (req, res) => {
  try {
    const {
      sort = 'name_asc',
      filter = '',
      category = ''
    } = req.query;

    // 基本クエリ - 患者情報とAI報告書の最新情報を結合
    let query = `
      WITH ai_report_summary AS (
        SELECT
          d.patientID,
          MAX(CASE WHEN d.is_ai_generated = true THEN d.created_at END) as last_ai_generated_at,
          COUNT(CASE WHEN d.is_ai_generated = true THEN 1 END) as ai_report_count,
          COUNT(CASE
            WHEN d.is_ai_generated = true
            AND DATE_TRUNC('month', d.created_at) = DATE_TRUNC('month', CURRENT_DATE)
            THEN 1
          END) as ai_report_count_this_month,
          ARRAY_AGG(DISTINCT d.Category) FILTER (WHERE d.is_ai_generated = true) as ai_categories,
          -- 最終作成書類のタイトルを取得
          (SELECT fileName FROM Documents
           WHERE patientID = d.patientID
             AND is_ai_generated = true
           ORDER BY created_at DESC
           LIMIT 1) as last_report_title,
          -- 最新5件の書類を取得（JSON配列として）
          (SELECT json_agg(json_build_object(
             'fileId', fileID,
             'fileName', fileName,
             'createdAt', created_at::date::text
           ) ORDER BY created_at DESC)
           FROM (
             SELECT fileID, fileName, created_at
             FROM Documents
             WHERE patientID = d.patientID
               AND is_ai_generated = true
             ORDER BY created_at DESC
             LIMIT 5
           ) recent
          ) as recent_reports
        FROM Documents d
        GROUP BY d.patientID
      )
      SELECT
        p.patientID,
        p.patientName,
        p.birthdate,
        p.cm_name,
        p.office_name,
        COALESCE(ars.last_ai_generated_at::date::text, null) as last_ai_generated_at,
        COALESCE(ars.ai_report_count, 0) as ai_report_count,
        COALESCE(ars.ai_report_count_this_month, 0) > 0 as has_ai_this_month,
        COALESCE(ars.ai_categories, '{}') as ai_categories,
        ars.last_report_title,
        COALESCE(ars.recent_reports, '[]'::json) as recent_reports
      FROM patient_full_view p
      LEFT JOIN ai_report_summary ars ON p.patientID = ars.patientID
    `;

    // WHERE句の構築
    const conditions = [];
    const values = [];

    // カテゴリフィルター
    if (category) {
      values.push(category);
      conditions.push(`$${values.length} = ANY(ars.ai_categories)`);
    }

    // 今月未作成フィルター
    if (filter === 'no-ai-this-month') {
      conditions.push(`(ars.ai_report_count_this_month IS NULL OR ars.ai_report_count_this_month = 0)`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // ソート処理
    let orderBy = '';
    switch (sort) {
      case 'last_ai_desc':
        orderBy = ' ORDER BY ars.last_ai_generated_at DESC NULLS LAST, p.patientName';
        break;
      case 'last_ai_asc':
        orderBy = ' ORDER BY ars.last_ai_generated_at ASC NULLS LAST, p.patientName';
        break;
      case 'name_desc':
        orderBy = ' ORDER BY p.patientName DESC';
        break;
      case 'name_asc':
      default:
        orderBy = ' ORDER BY p.patientName ASC';
        break;
    }
    query += orderBy;

    const result = await db.query(query, values);

    res.json({
      success: true,
      count: result.rows.length,
      patients: result.rows.map(row => ({
        ...row,
        // 日付を日本語形式に変換
        last_ai_generated_at: row.last_ai_generated_at
          ? new Date(row.last_ai_generated_at).toLocaleDateString('ja-JP')
          : null
      }))
    });
  } catch (error) {
    console.error('Error fetching patients with AI status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch patients with AI status'
    });
  }
};

// AI報告書のカテゴリ一覧を取得
const getAIReportCategories = async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT Category
      FROM Documents
      WHERE is_ai_generated = true
        AND Category IS NOT NULL
      ORDER BY Category
    `;

    const result = await db.query(query);

    res.json({
      success: true,
      categories: result.rows.map(row => row.category)
    });
  } catch (error) {
    console.error('Error fetching AI report categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch AI report categories'
    });
  }
};

module.exports = {
  getAllPatients,
  getPatientById,
  searchPatient,
  getPatientForReport,
  getKyotakuReportData,
  getPatientsWithAIStatus,
  getAIReportCategories
};
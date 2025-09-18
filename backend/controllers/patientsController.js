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

module.exports = {
  getAllPatients,
  getPatientById,
  getPatientForReport,
  getKyotakuReportData
};
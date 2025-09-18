const AIService = require('../services/aiService');
const db = require('../config/database');

const aiService = new AIService();

/**
 * 居宅療養管理指導報告書の生成
 */
const generateKyotakuReport = async (req, res) => {
  try {
    const { patient_id, karte_content } = req.body;

    // 入力検証
    if (!patient_id || !karte_content) {
      return res.status(400).json({
        success: false,
        error: 'patient_id and karte_content are required'
      });
    }

    // カルテ内容の文字数制限
    const sanitizedKarte = karte_content.slice(0, 5000);

    // 患者情報取得
    const patientQuery = `
      SELECT
        patientID,
        patientName,
        birthdate,
        address,
        CMName,
        homecareOffice
      FROM patients
      WHERE patientID = $1
    `;

    const patientResult = await db.query(patientQuery, [patient_id]);

    if (patientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Patient not found'
      });
    }

    const patient = patientResult.rows[0];

    // AI生成
    const aiResponse = await aiService.generateKyotakuReport(
      {
        patientName: patient.patientname,
        birthdate: patient.birthdate
      },
      sanitizedKarte
    );

    // 期間計算（AI抽出した診察日から計算）
    const period = AIService.getReportPeriod(aiResponse.exam_date);

    // 年齢計算
    const age = aiService.calculateAge(patient.birthdate);

    // 生年月日フォーマット
    const birthdate = new Date(patient.birthdate);
    const formattedBirthdate = `${birthdate.getFullYear()}年${birthdate.getMonth() + 1}月${birthdate.getDate()}日`;

    // レスポンス整形
    const reportData = {
      // 患者情報（データベースから - deterministic）
      patient_name: patient.patientname,
      birthdate: formattedBirthdate,
      age: age,
      address: patient.address || '',
      cm_name: patient.cmname || '',
      homecare_office: patient.homecareoffice || '',

      // 期間情報（計算値 - deterministic）
      period_start: period.period_start,
      period_end: period.period_end,

      // AIが抽出した情報
      exam_date: aiResponse.exam_date || new Date().toLocaleDateString('ja-JP'),
      doctor_name: 'たすくホームクリニック医師',
      next_exam_date: aiResponse.next_exam_date || '',
      care_level: aiResponse.care_level || '',
      primary_disease: aiResponse.primary_disease || '',

      // AI生成内容
      medical_content: aiResponse.medical_content,
      selected_advices: [aiResponse.selected_advice],  // 配列形式で返す
      advice_text: aiResponse.advice_text,

      // メタ情報
      generated_date: new Date().toISOString()
    };

    res.json({
      success: true,
      data: reportData
    });

  } catch (error) {
    console.error('Error generating Kyotaku report:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate report'
    });
  }
};

/**
 * APIキーの状態確認
 */
const checkApiStatus = async (req, res) => {
  const hasApiKey = !!process.env.OPENAI_API_KEY;

  res.json({
    success: true,
    hasApiKey,
    message: hasApiKey
      ? 'OpenAI API key is configured'
      : 'OpenAI API key not found. Please set OPENAI_API_KEY in .env.local'
  });
};

module.exports = {
  generateKyotakuReport,
  checkApiStatus
};
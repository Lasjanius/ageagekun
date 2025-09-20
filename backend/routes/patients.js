const express = require('express');
const router = express.Router();
const patientsController = require('../controllers/patientsController');

// 患者関連のルート
router.get('/all', patientsController.getAllPatients);
router.get('/search', patientsController.searchPatient);
router.get('/ai-report-status', patientsController.getPatientsWithAIStatus);
router.get('/ai-report-categories', patientsController.getAIReportCategories);
router.post('/', patientsController.createPatient);
router.get('/:id', patientsController.getPatientById);
router.put('/:id', patientsController.updatePatient);
router.get('/:id/report-data', patientsController.getPatientForReport);
router.get('/:id/kyotaku-report', patientsController.getKyotakuReportData);

module.exports = router;
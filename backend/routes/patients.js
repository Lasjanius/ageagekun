const express = require('express');
const router = express.Router();
const patientsController = require('../controllers/patientsController');

// 患者関連のルート
router.get('/all', patientsController.getAllPatients);
router.get('/:id', patientsController.getPatientById);
router.get('/:id/report-data', patientsController.getPatientForReport);
router.get('/:id/kyotaku-report', patientsController.getKyotakuReportData);

module.exports = router;
const express = require('express');

const {  } = require('../controllers/reports-videos');

const router = express.Router();

router.get('/reports/videos', async (req, res) => {
    reportsVideos_GET(req, res);
});

router.post('/reports/videos/archive', (req, res) => {
    reportsVideosArchive_POST(req, res);
});

router.delete('/reports/videos/:reportId/delete', async (req, res) => {
    reportsVideosReportIdDelete_DELETE(req, res);
});

router.get('/reports/videos/captcha', async (req, res) => {
    reportsVideosCaptcha_GET(req, res);
});

module.exports = router;
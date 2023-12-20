const express = require('express');

const { reportsArchiveVideos_GET, reportsArchiveVideosArchiveIdDelete_DELETE } = require('../controllers/reports-archive-videos');

const router = express.Router();

router.get('/reports/archive/videos', async (req, res) => {
    reportsArchiveVideos_GET(req, rep);
});

router.delete('/reports/archive/videos/:archiveId/delete', async (req, res) => {
    reportsArchiveVideosArchiveIdDelete_DELETE(req, rep);
});

module.exports = router;
const express = require('express');

const { reportsArchiveVideos_GET, reportsArchiveVideosArchiveIdDelete_DELETE } = require('../controllers/reports-archive-videos');

const router = express.Router();

router.get('/', async (req, res) => {
    reportsArchiveVideos_GET(req, res);
});

router.delete('/:archiveId/delete', async (req, res) => {
    reportsArchiveVideosArchiveIdDelete_DELETE(req, res);
});

module.exports = router;
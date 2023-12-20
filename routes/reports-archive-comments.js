const express = require('express');

const { reportsArchiveComments_GET, reportsArchiveCommentsArchiveIdDelete_DELETE } = require('../controllers/reports-archive-comments');

const router = express.Router();

router.get('/', async (req, res) => {
    reportsArchiveComments_GET(req, res);
});

router.delete('/:archiveId/delete', async (req, res) => {
    reportsArchiveCommentsArchiveIdDelete_DELETE(req, res);
});

module.exports = router;
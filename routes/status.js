const express = require('express');

const { information_GET, heartbeat_GET, videos_POST } = require('../controllers/status');

const router = express.Router();

router.get('/information', (req, res) => {
    information_GET(req, res);
});

router.get('/heartbeat', (req, res) => {
    heartbeat_GET(req, res);
});

router.post('/videos', (req, res) => {
    videos_POST(req, res);
});

module.exports = router;
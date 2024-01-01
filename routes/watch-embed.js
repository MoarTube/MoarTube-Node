const express = require('express');

const { videoVideoId_GET, chatVideoId_GET } = require('../controllers/watch-embed');

const router = express.Router();

router.get('/video/:videoId', async (req, res) => {
    videoVideoId_GET(req, res);
});

router.get('/chat/:videoId', async (req, res) => {
    chatVideoId_GET(req, res);
});

module.exports = router;
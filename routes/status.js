const express = require('express');

const { information_GET, heartbeat_GET, videos_POST } = require('../controllers/status');

const router = express.Router();

router.get('/information', async (req, res) => {
    const data = await information_GET(req, res);

    res.send(data);
});

router.get('/heartbeat', async (req, res) => {
    const data = await heartbeat_GET(req, res);

    res.send(data);
});

router.post('/videos', async (req, res) => {
    const videoIds = req.body.videoIds;

    const data = await videos_POST(videoIds);

    res.send(data);
});

module.exports = router;
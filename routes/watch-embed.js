const express = require('express');

const { videoVideoId_GET, chatVideoId_GET } = require('../controllers/watch-embed');
const { logDebugMessageToConsole } = require('../utils/logger');

const router = express.Router();

router.get('/video/:videoId', async (req, res) => {
    try {
        const videoId = req.params.videoId;

        const data = await videoVideoId_GET(videoId);

        if(data.videoData != null) {
            res.render('embed-video', data);
        }
        else {
            res.status(404).send('embed video not found');
        }
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack, true);
    
        res.status(500).send('embed video error');
    }
});

router.get('/chat/:videoId', async (req, res) => {
    try {
        const videoId = req.params.videoId;

        const data = chatVideoId_GET(videoId);

        if(data != null) {
            res.render('embed-chat', data);
        }
        else {
            res.status(404).send('embed chat not found');
        }
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack, true);
    
        res.status(500).send('embed chat error');
    }
});

module.exports = router;
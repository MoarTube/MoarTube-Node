const express = require('express');

const { 
    start_POST, videoIdStop_POST, videoIdAdaptiveFormatResolutionSegmentsRemove_POST, videoIdBandwidth_GET, 
    videoIdChatSettings_POST, videoIdChatHistory_GET 
} = require('../controllers/streams');
const { 
    logDebugMessageToConsole 
} = require('../utils/logger');
const { 
    performAuthenticationCheck 
} = require('../middleware/authentication');

const router = express.Router();

router.post('/start', performAuthenticationCheck(true), async (req, res) => {
    try {
        const title = req.body.title;
        const description = req.body.description;
        const tags = req.body.tags;
        const rtmpPort = req.body.rtmpPort;
        const uuid = req.body.uuid;
        const isRecordingStreamRemotely = req.body.isRecordingStreamRemotely;
        const isRecordingStreamLocally = req.body.isRecordingStreamLocally;
        const networkAddress = req.body.networkAddress;
        const resolution = req.body.resolution;
        const videoId = req.body.videoId;

        const data = await start_POST(title, description, tags, rtmpPort, uuid, isRecordingStreamRemotely, isRecordingStreamLocally, networkAddress, resolution, videoId);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/:videoId/stop', performAuthenticationCheck(true), async (req, res) => {
    try {
        const videoId = req.params.videoId;

        const data = await videoIdStop_POST(videoId);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/:videoId/adaptive/:format/:resolution/segments/remove', performAuthenticationCheck(true), async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const format = req.params.format;
        const resolution = req.params.resolution;
        const segmentName = req.body.segmentName;

        const data = await videoIdAdaptiveFormatResolutionSegmentsRemove_POST(videoId, format, resolution, segmentName);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.get('/:videoId/bandwidth', performAuthenticationCheck(true), async (req, res) => {
    try {
        const videoId = req.params.videoId;

        const data = await videoIdBandwidth_GET(videoId);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/:videoId/chat/settings', performAuthenticationCheck(true), async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const isChatHistoryEnabled = req.body.isChatHistoryEnabled;
        const chatHistoryLimit = req.body.chatHistoryLimit;

        const data = await videoIdChatSettings_POST(videoId, isChatHistoryEnabled, chatHistoryLimit);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.get('/:videoId/chat/history', performAuthenticationCheck(false), async (req, res) => {
    try {
        const videoId = req.params.videoId;

        const data = await videoIdChatHistory_GET(videoId);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

module.exports = router;
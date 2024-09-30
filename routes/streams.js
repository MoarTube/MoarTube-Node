const express = require('express');

const { 
    start_POST, videoIdStop_POST, videoIdAdaptiveFormatResolutionSegmentsNextExpectedSegmentIndex_GET, videoIdAdaptiveFormatResolutionSegmentsRemove_POST, videoIdBandwidth_GET,
    videoIdChatSettings_POST, videoIdChatHistory_GET
} = require('../controllers/streams');
const { logDebugMessageToConsole } = require('../utils/logger');
const { getAuthenticationStatus } = require('../utils/helpers');

const router = express.Router();

router.post('/start', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const title = req.body.title;
            const description = req.body.description;
            const tags = req.body.tags;
            const rtmpPort = req.body.rtmpPort;
            const uuid = req.body.uuid;
            let isRecordingStreamRemotely = req.body.isRecordingStreamRemotely;
            let isRecordingStreamLocally = req.body.isRecordingStreamLocally;
            const networkAddress = req.body.networkAddress;
            const resolution = req.body.resolution;
            let videoId = req.body.videoId;

            const data = await start_POST(title, description, tags, rtmpPort, uuid, isRecordingStreamRemotely, isRecordingStreamLocally, networkAddress, resolution, videoId);

            res.send(data);
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.post('/:videoId/stop', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;

            const data = await videoIdStop_POST(videoId);

            res.send(data);
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.get('/:videoId/adaptive/:format/:resolution/segments/nextExpectedSegmentIndex', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            const format = req.params.format;
            const resolution = req.params.resolution;

            const data = videoIdAdaptiveFormatResolutionSegmentsNextExpectedSegmentIndex_GET(videoId, format, resolution);

            res.send(data);
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.post('/:videoId/adaptive/:format/:resolution/segments/remove', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            const format = req.params.format;
            const resolution = req.params.resolution;
            const segmentName = req.body.segmentName;

            const data = videoIdAdaptiveFormatResolutionSegmentsRemove_POST(videoId, format, resolution, segmentName);

            res.send(data);
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.get('/:videoId/bandwidth', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;

            const data = await videoIdBandwidth_GET(videoId);

            res.send(data);
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.post('/:videoId/chat/settings', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            const isChatHistoryEnabled = req.body.isChatHistoryEnabled;
            const chatHistoryLimit = req.body.chatHistoryLimit;

            const data = await videoIdChatSettings_POST(videoId, isChatHistoryEnabled, chatHistoryLimit);
            
            res.send(data);
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.get('/:videoId/chat/history', async (req, res) => {
    const videoId = req.params.videoId;

    const data = await videoIdChatHistory_GET(videoId);

    res.send(data);
});

module.exports = router;
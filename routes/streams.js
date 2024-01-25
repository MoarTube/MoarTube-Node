const express = require('express');

const { 
    start_POST, videoIdStop_POST, videoIdAdaptiveFormatResolutionSegmentsNextExpectedSegmentIndex_GET, videoIdAdaptiveFormatResolutionSegmentsRemove_POST, videoIdBandwidth_GET,
    videoIdChatSettings_POST, videoidChatHistory_GET
} = require('../controllers/streams');

const router = express.Router();

router.post('/start', (req, res) => {
    start_POST(req, res);
});

router.post('/:videoId/stop', (req, res) => {
    videoIdStop_POST(req, res);
});

router.get('/:videoId/adaptive/:format/:resolution/segments/nextExpectedSegmentIndex', (req, res) => {
    videoIdAdaptiveFormatResolutionSegmentsNextExpectedSegmentIndex_GET(req, res);
});

router.post('/:videoId/adaptive/:format/:resolution/segments/remove', (req, res) => {
    videoIdAdaptiveFormatResolutionSegmentsRemove_POST(req, res);
});

router.get('/:videoId/bandwidth', (req, res) => {
    videoIdBandwidth_GET(req, res);
});

router.post('/:videoId/chat/settings', (req, res) => {
    videoIdChatSettings_POST(req, res);
});

router.get('/:videoId/chat/history', (req, res) => {
    videoidChatHistory_GET(req, res);
});

module.exports = router;
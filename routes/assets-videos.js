const express = require('express');

const {
    videoIdThumbnail_GET, videoIdPreview_GET, videoIdPoster_GET, videoIdAdaptiveFormatManifestsManifestName_GET, 
    videoIdAdaptiveFormatResolutionSegmentsSegmentName_GET, videoIdProgressiveFormatResolution_GET, videoIdProgressiveFormatResolutionDownload_GET
} = require('../controllers/assets-videos');

const router = express.Router();

router.get('/:videoId/thumbnail', (req, res) => {
    videoIdThumbnail_GET(req, res);
});

router.get('/:videoId/preview', (req, res) => {
    videoIdPreview_GET(req, res);
});

router.get('/:videoId/poster', (req, res) => {
    videoIdPoster_GET(req, res);
});

router.get('/:videoId/adaptive/:format/manifests/:manifestName', (req, res) => {
    videoIdAdaptiveFormatManifestsManifestName_GET(req, res);
});

router.get('/:videoId/adaptive/:format/:resolution/segments/:segmentName', (req, res) => {
    videoIdAdaptiveFormatResolutionSegmentsSegmentName_GET(req, res);
});

router.get('/:videoId/progressive/:format/:resolution', (req, res) => {
    videoIdProgressiveFormatResolution_GET(req, res);
});

router.get('/:videoId/progressive/:format/:resolution/download', (req, res) => {
    videoIdProgressiveFormatResolutionDownload_GET(req, res);
});

module.exports = router;
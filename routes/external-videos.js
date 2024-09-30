const express = require('express');

const {
    videoIdThumbnail_GET, videoIdPreview_GET, videoIdPoster_GET, videoIdAdaptiveTypeFormatManifestsManifestName_GET, 
    videoIdAdaptiveFormatResolutionSegmentsSegmentName_GET, videoIdProgressiveFormatResolution_GET, videoIdProgressiveFormatResolutionDownload_GET
} = require('../controllers/external-videos');

const router = express.Router();

router.get('/:videoId/thumbnail', (req, res) => {
    const videoId = req.params.videoId;

    const fileStream = videoIdThumbnail_GET(videoId);

    if(fileStream != null) {
        res.setHeader('Content-Type', 'image/jpeg');
            
        fileStream.pipe(res);
    }
    else {
        res.status(404).send('thumbnail not found');
    }
});

router.get('/:videoId/preview', (req, res) => {
    const videoId = req.params.videoId;

    const fileStream = videoIdPreview_GET(videoId);

    if(fileStream != null) {
        res.setHeader('Content-Type', 'image/jpeg');
    
        fileStream.pipe(res);
    }
    else {
        res.status(404).send('preview not found');
    }
});

router.get('/:videoId/poster', (req, res) => {
    const videoId = req.params.videoId;

    const fileStream = videoIdPoster_GET(videoId);
    
    if(fileStream != null) {
        res.setHeader('Content-Type', 'image/jpeg');
    
        fileStream.pipe(res);
    }
    else {
        res.status(404).send('poster not found');
    }
});

router.get('/:videoId/adaptive/:type/:format/manifests/:manifestName', (req, res) => {
    const videoId = req.params.videoId;
    const type = req.params.type;
    const format = req.params.format;
    const manifestName = req.params.manifestName;

    const fileStream = videoIdAdaptiveTypeFormatManifestsManifestName_GET(videoId, type, format, manifestName);

    if(fileStream != null) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');

        fileStream.pipe(res);
    }
    else {
        res.status(404).send('video not found');
    }
});

router.get('/:videoId/adaptive/:format/:resolution/segments/:segmentName', (req, res) => {
    const videoId = req.params.videoId;
    const format = req.params.format;
    const resolution = req.params.resolution;
    const segmentName = req.params.segmentName;

    const fileStream = videoIdAdaptiveFormatResolutionSegmentsSegmentName_GET(videoId, format, resolution, segmentName);

    if(fileStream != null) {
        res.setHeader('Content-Type', 'video/MP2T');

        fileStream.pipe(res);
    }
    else {
        res.status(404).send('video not found');
    }
});

router.get('/:videoId/progressive/:format/:resolution', (req, res) => {
    const videoId = req.params.videoId;
    const format = req.params.format;
    const resolution = req.params.resolution;

    const range = req.headers.range;

    const data = videoIdProgressiveFormatResolution_GET(videoId, format, resolution, range);

    if(data != null) {
        res.writeHead(data.status, data.responseHeaders);

        data.fileStream.pipe(res);
    }
    else {
        res.status(404).send('video not found');
    }
});

router.get('/:videoId/progressive/:format/:resolution/download', (req, res) => {
    const videoId = req.params.videoId;
    const format = req.params.format;
    const resolution = req.params.resolution;

    const data = videoIdProgressiveFormatResolutionDownload_GET(videoId, format, resolution);

    if(data != null) {
        const filePath = data.filePath;
        const fileName = data.fileName;

        res.download(filePath, fileName, (error) => {
            if (error) {
                res.status(404).send('video not found');
            }
        });
    }
    else {
        res.status(404).send('video not found');
    }
});

module.exports = router;
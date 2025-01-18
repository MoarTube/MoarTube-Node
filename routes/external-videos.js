const express = require('express');

const {
    videoIdThumbnail_GET, videoIdPreview_GET, videoIdPoster_GET, videoIdAdaptiveFormatTypeManifestsManifestName_GET, 
    videoIdAdaptiveFormatResolutionSegmentsSegmentName_GET, videoIdProgressiveFormatResolution_GET,
    externalVideosBaseUrl_GET
} = require('../controllers/external-videos');
const { logDebugMessageToConsole } = require('../utils/logger');
const { getAuthenticationStatus } = require('../utils/helpers');

const router = express.Router();

router.get('/baseUrl', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const externalVideosBaseUrl = externalVideosBaseUrl_GET();

                res.send({isError: false, externalVideosBaseUrl: externalVideosBaseUrl});
            }
            catch(error) {
                logDebugMessageToConsole(null, error, new Error().stack);
            
                res.send({isError: true, message: 'error communicating with the MoarTube node'});
            }
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.get('/:videoId/images/thumbnail.jpg', (req, res) => {
    try {
        const videoId = req.params.videoId;

        const fileStream = videoIdThumbnail_GET(videoId);

        if(fileStream != null) {
            res.setHeader('Content-Type', 'image/jpeg');
                
            fileStream.pipe(res);
        }
        else {
            res.status(404).send('thumbnail not found');
        }
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);
    
        res.status(404).send('thumbnail not found');
    }
});

router.get('/:videoId/images/preview.jpg', (req, res) => {
    try {
        const videoId = req.params.videoId;

        const fileStream = videoIdPreview_GET(videoId);

        if(fileStream != null) {
            res.setHeader('Content-Type', 'image/jpeg');
        
            fileStream.pipe(res);
        }
        else {
            res.status(404).send('preview not found');
        }
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.status(404).send('preview not found');
    }
});

router.get('/:videoId/images/poster.jpg', (req, res) => {
    try {
        const videoId = req.params.videoId;

        const fileStream = videoIdPoster_GET(videoId);
        
        if(fileStream != null) {
            res.setHeader('Content-Type', 'image/jpeg');
        
            fileStream.pipe(res);
        }
        else {
            res.status(404).send('poster not found');
        }
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.status(404).send('poster not found');
    }
});

router.get('/:videoId/adaptive/:format/:type/manifests/:manifestName', (req, res) => {
    try {
        const videoId = req.params.videoId;
        const format = req.params.format;
        const type = req.params.type;
        const manifestName = req.params.manifestName;

        const fileStream = videoIdAdaptiveFormatTypeManifestsManifestName_GET(videoId, format, type, manifestName);

        if(fileStream != null) {
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');

            fileStream.pipe(res);
        }
        else {
            res.status(404).send('video not found');
        }
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.status(404).send('video not found');
    }
});

router.get('/:videoId/adaptive/:format/:resolution/segments/:segmentName', (req, res) => {
    try {
        const videoId = req.params.videoId;
        const format = req.params.format;
        const resolution = req.params.resolution;
        const segmentName = req.params.segmentName;

        const fileStream = videoIdAdaptiveFormatResolutionSegmentsSegmentName_GET(videoId, format, resolution, segmentName);

        if(fileStream != null) {
            res.setHeader('Content-Type', 'video/mp2t');

            fileStream.pipe(res);
        }
        else {
            res.status(404).send('video not found');
        }
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.status(404).send('video not found');
    }
});

router.get('/:videoId/progressive/:format/:progressiveFilename', (req, res) => {
    try {
        const videoId = req.params.videoId;
        const format = req.params.format;
        const progressiveFilename = req.params.progressiveFilename;

        const range = req.headers.range;

        const data = videoIdProgressiveFormatResolution_GET(videoId, format, progressiveFilename, range);

        if(data != null) {
            res.writeHead(data.status, data.responseHeaders);

            data.fileStream.pipe(res);
        }
        else {
            res.status(404).send('video not found');
        }
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.status(404).send('video not found');
    }
});

module.exports = router;
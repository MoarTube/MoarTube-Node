const fs = require('fs');
const path = require('path');

const { logDebugMessageToConsole } = require('../utils/logger');
const { getVideosDirectoryPath } = require('../utils/paths');
const { submitDatabaseWriteJob } = require('../utils/database');
const { 
    isManifestNameValid, isSegmentNameValid, isVideoIdValid, isAdaptiveFormatValid, isProgressiveFormatValid, isResolutionValid
} = require('../utils/validators');

function videoIdThumbnail_GET(req, res) {
    const videoId = req.params.videoId;
    
    if(isVideoIdValid(videoId)) {
        const thumbnailFilePath = path.join(path.join(getVideosDirectoryPath(), videoId + '/images'), 'thumbnail.jpg');
        
        if (fs.existsSync(thumbnailFilePath)) {
            const fileStream = fs.createReadStream(thumbnailFilePath);
            
            res.setHeader('Content-Type', 'image/jpeg');
            
            fileStream.pipe(res);
        }
        else {
            res.status(404).send('thumbnail not found');
        }
    }
    else {
        res.status(404).send('thumbnail not found');
    }
}

function videoIdPreview_GET(req, res) {
    const videoId = req.params.videoId;
    
    if(isVideoIdValid(videoId)) {
        const previewFilePath = path.join(path.join(getVideosDirectoryPath(), videoId + '/images'), 'preview.jpg');
        
        if (fs.existsSync(previewFilePath)) {
            const fileStream = fs.createReadStream(previewFilePath);
            
            res.setHeader('Content-Type', 'image/jpeg');
            
            fileStream.pipe(res);
        }
        else {
            res.status(404).send('preview not found');
        }
    }
    else {
        res.status(404).send('preview not found');
    }
}

function videoIdPoster_GET(req, res) {
    const videoId = req.params.videoId;
    
    if(isVideoIdValid(videoId)) {
        const previewFilePath = path.join(path.join(getVideosDirectoryPath(), videoId + '/images'), 'poster.jpg');
        
        if (fs.existsSync(previewFilePath)) {
            const fileStream = fs.createReadStream(previewFilePath);
            
            res.setHeader('Content-Type', 'image/jpeg');
            
            fileStream.pipe(res);
        }
        else {
            res.status(404).send('poster not found');
        }
    }
    else {
        res.status(404).send('poster not found');
    }
}

var manifestBandwidthCounter = 0;
var manifestBandwidthIncrementTimer;
function videoIdAdaptiveFormatManifestsManifestName_GET(req, res) {
    const videoId = req.params.videoId;
    const format = req.params.format;
    const manifestName = req.params.manifestName;
    
    if(isVideoIdValid(videoId) && isAdaptiveFormatValid(format) && isManifestNameValid(manifestName)) {
        const manifestPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/' + format + '/' + manifestName);
        
        if(fs.existsSync(manifestPath)) {
            fs.stat(manifestPath, function(error, stats) {
                if (error) {
                    logDebugMessageToConsole(null, error, new Error().stack, true);
                } else {
                    manifestBandwidthCounter += stats.size;
        
                    clearTimeout(manifestBandwidthIncrementTimer);

                    manifestBandwidthIncrementTimer = setTimeout(function() {
                        const manifestBandwidthCounterTemp = manifestBandwidthCounter;
                        
                        manifestBandwidthCounter = 0;
                        
                        submitDatabaseWriteJob('UPDATE videos SET bandwidth = bandwidth + ? WHERE video_id = ?', [manifestBandwidthCounterTemp, videoId], function(isError) {
                            if(isError) {
                                // do nothing
                            }
                            else {
                                // do nothing
                            }
                        });
                    }, 100);
                }
            });
            
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            
            const fileStream = fs.createReadStream(manifestPath);
            
            fileStream.pipe(res);
        }
        else {
            res.status(404).send('video not found');
        }
    }
    else {
        res.status(404).send('video not found');
    }
}

var segmentBandwidthCounter = 0;
var segmentBandwidthIncrementTimer;
function videoIdAdaptiveFormatResolutionSegmentsSegmentName_GET(req, res) {
    const videoId = req.params.videoId;
    const format = req.params.format;
    const resolution = req.params.resolution;
    const segmentName = req.params.segmentName;
    
    if(isVideoIdValid(videoId) && isAdaptiveFormatValid(format) && isResolutionValid(resolution) && isSegmentNameValid(segmentName)) {
        const segmentPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/' + format + '/' + resolution + '/' + segmentName);
        
        if(fs.existsSync(segmentPath)) {
            fs.stat(segmentPath, function(error, stats) {
                if (error) {
                    logDebugMessageToConsole(null, error, new Error().stack, true);
                } else {
                    segmentBandwidthCounter += stats.size;
        
                    clearTimeout(segmentBandwidthIncrementTimer);

                    segmentBandwidthIncrementTimer = setTimeout(function() {
                        const segmentBandwidthCounterTemp = segmentBandwidthCounter;
                        
                        segmentBandwidthCounter = 0;

                        submitDatabaseWriteJob('UPDATE videos SET bandwidth = bandwidth + ? WHERE video_id = ?', [segmentBandwidthCounterTemp, videoId], function(isError) {
                            if(isError) {
                                // do nothing
                            }
                            else {
                                // do nothing
                            }
                        });
                    }, 100);
                }
            });
            
            res.setHeader('Content-Type', 'video/MP2T');
            
            const fileStream = fs.createReadStream(segmentPath);
            
            fileStream.pipe(res);
        }
        else {
            res.status(404).send('video not found');
        }
    }
    else {
        res.status(404).send('video not found');
    }
}

var progressiveBandwidthCounter = 0;
var progressiveBandwidthIncrementTimer;
function videoIdProgressiveFormatResolution_GET(req, res) {
    const videoId = req.params.videoId;
    const format = req.params.format;
    const resolution = req.params.resolution;
    
    if(isVideoIdValid(videoId) && isProgressiveFormatValid(format) && isResolutionValid(resolution)) {
        const filePath = path.join(getVideosDirectoryPath(), videoId + '/progressive/' + format + '/' + resolution + '/' + resolution + '.' + format);
        
        if(fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            const fileSize = stat.size;
            const range = req.headers.range;
            
            if (range) {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunkSize = (end - start) + 1;
                const file = fs.createReadStream(filePath, { start, end });
                
                progressiveBandwidthCounter += chunkSize;
        
                clearTimeout(progressiveBandwidthIncrementTimer);

                progressiveBandwidthIncrementTimer = setTimeout(function() {
                    const progressiveBandwidthCounterTemp = progressiveBandwidthCounter;
                        
                    progressiveBandwidthCounter = 0;

                    submitDatabaseWriteJob('UPDATE videos SET bandwidth = bandwidth + ? WHERE video_id = ?', [progressiveBandwidthCounterTemp, videoId], function(isError) {
                        if(isError) {
                            // do nothing
                        }
                        else {
                            // do nothing
                        }
                    });
                }, 100);
                
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': 'video/' + format
                });
                
                file.pipe(res);
            }
            else {
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': 'video/' + format
                });
                
                fs.createReadStream(filePath).pipe(res);
            }
        }
        else {
            res.status(404).send('video not found');
        }
    }
    else {
        res.status(404).send('video not found');
    }
}

function videoIdProgressiveFormatResolutionDownload_GET(req, res) {
    const videoId = req.params.videoId;
    const format = req.params.format;
    const resolution = req.params.resolution;
    
    if(isVideoIdValid(videoId) && isProgressiveFormatValid(format) && isResolutionValid(resolution)) {
        const filePath = path.join(getVideosDirectoryPath(), videoId + '/progressive/' + format + '/' + resolution + '/' + resolution + '.' + format);
        const fileName = videoId + '-' + resolution + '.' + format;
        
        if(fs.existsSync(filePath)) {
            res.download(filePath, fileName, (error) => {
                if (error) {
                    res.status(404).send('video not found');
                }
            });
        }
        else {
            res.status(404).send('video not found');
        }
    }
    else {
        res.status(404).send('video not found');
    }
}

module.exports = {
    videoIdThumbnail_GET,
    videoIdPreview_GET,
    videoIdPoster_GET,
    videoIdAdaptiveFormatManifestsManifestName_GET,
    videoIdAdaptiveFormatResolutionSegmentsSegmentName_GET,
    videoIdProgressiveFormatResolution_GET,
    videoIdProgressiveFormatResolutionDownload_GET
};
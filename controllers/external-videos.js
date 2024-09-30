const fs = require('fs');
const path = require('path');

const { logDebugMessageToConsole } = require('../utils/logger');
const { getVideosDirectoryPath } = require('../utils/paths');
const { submitDatabaseWriteJob } = require('../utils/database');
const { 
    isManifestNameValid, isSegmentNameValid, isVideoIdValid, isAdaptiveFormatValid, isProgressiveFormatValid, isResolutionValid, isManifestTypeValid
} = require('../utils/validators');

function videoIdThumbnail_GET(videoId) {
    if(isVideoIdValid(videoId, false)) {
        const thumbnailFilePath = path.join(path.join(getVideosDirectoryPath(), videoId + '/images'), 'thumbnail.jpg');
        
        if (fs.existsSync(thumbnailFilePath)) {
            const fileStream = fs.createReadStream(thumbnailFilePath);
            
            return fileStream;
        }
        else {
            return null;
        }
    }
    else {
        return null;
    }
}

function videoIdPreview_GET(videoId) {
    if(isVideoIdValid(videoId, false)) {
        const previewFilePath = path.join(path.join(getVideosDirectoryPath(), videoId + '/images'), 'preview.jpg');
        
        if (fs.existsSync(previewFilePath)) {
            const fileStream = fs.createReadStream(previewFilePath);

            return fileStream;
        }
        else {
            return null;
        }
    }
    else {
        return null;
    }
}

function videoIdPoster_GET(videoId) {
    if(isVideoIdValid(videoId, false)) {
        const posterFilePath = path.join(path.join(getVideosDirectoryPath(), videoId + '/images'), 'poster.jpg');
        
        if (fs.existsSync(posterFilePath)) {
            const fileStream = fs.createReadStream(posterFilePath);

            return fileStream;
        }
        else {
            return null;
        }
    }
    else {
        return null;
    }
}

function videoIdAdaptiveTypeFormatManifestsManifestName_GET(videoId, type, format, manifestName) {
    if(isVideoIdValid(videoId, false) && isManifestTypeValid(type) && isAdaptiveFormatValid(format) && isManifestNameValid(manifestName)) {
        const manifestPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/' + format + '/' + manifestName);

        if(fs.existsSync(manifestPath)) {
            const fileStream = fs.createReadStream(manifestPath);

            return fileStream;
        }
        else {
            return null;
        }
    }
    else {
        return null;
    }
}

let segmentBandwidthCounter = 0;
let segmentBandwidthIncrementTimer;
function videoIdAdaptiveFormatResolutionSegmentsSegmentName_GET(videoId, format, resolution, segmentName) {
    if(isVideoIdValid(videoId, false) && isAdaptiveFormatValid(format) && isResolutionValid(resolution) && isSegmentNameValid(segmentName)) {
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

            const fileStream = fs.createReadStream(segmentPath);
            
            return fileStream;
        }
        else {
            return null;
        }
    }
    else {
        return null;
    }
}

let progressiveBandwidthCounter = 0;
let progressiveBandwidthIncrementTimer;
function videoIdProgressiveFormatResolution_GET(videoId, format, resolution, range) {
    if(isVideoIdValid(videoId, false) && isProgressiveFormatValid(format) && isResolutionValid(resolution)) {
        const filePath = path.join(getVideosDirectoryPath(), videoId + '/progressive/' + format + '/' + resolution + '/' + resolution + '.' + format);
        
        if(fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            const fileSize = stat.size;

            let status;
            let responseHeaders;
            let fileStream;

            if (range) {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunkSize = (end - start) + 1;
                
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

                status = 206;
                responseHeaders = {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': 'video/' + format
                };
                fileStream = fs.createReadStream(filePath, { start, end });
            }
            else {
                status = 200;
                responseHeaders = {
                    'Content-Length': fileSize,
                    'Content-Type': 'video/' + format
                };
                fileStream = fs.createReadStream(filePath);
            }

            return {status: status, responseHeaders: responseHeaders, fileStream: fileStream};
        }
        else {
            return null;
        }
    }
    else {
        return null;
    }
}

function videoIdProgressiveFormatResolutionDownload_GET(videoId, format, resolution) {
    if(isVideoIdValid(videoId, false) && isProgressiveFormatValid(format) && isResolutionValid(resolution)) {
        const filePath = path.join(getVideosDirectoryPath(), videoId + '/progressive/' + format + '/' + resolution + '/' + resolution + '.' + format);
        const fileName = videoId + '-' + resolution + '.' + format;
        
        if(fs.existsSync(filePath)) {
            return {filePath: filePath, fileName: fileName};
        }
        else {
            return null;
        }
    }
    else {
        return null;
    }
}

module.exports = {
    videoIdThumbnail_GET,
    videoIdPreview_GET,
    videoIdPoster_GET,
    videoIdAdaptiveTypeFormatManifestsManifestName_GET,
    videoIdAdaptiveFormatResolutionSegmentsSegmentName_GET,
    videoIdProgressiveFormatResolution_GET,
    videoIdProgressiveFormatResolutionDownload_GET
};
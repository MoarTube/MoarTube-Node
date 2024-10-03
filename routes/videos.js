const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const { 
    import_POST, imported_POST, videoIdImportingStop_POST, publishing_POST, published_POST, videoIdPublishingStop_POST, videoIdUpload_POST, videoIdStream_POST, error_POST, 
    videoIdSourceFileExtension_POST, videoIdSourceFileExtension_GET, videoIdPublishes_GET, videoIdUnpublish_POST, videoIdData_POST, videoIdIndexAdd_POST, videoIdIndexRemove_POST,
    videoIdAlias_GET, search_GET, videoIdThumbnail_POST, videoIdPreview_POST, videoIdPoster_POST, videoIdLengths_POST, videoIdData_GET, delete_POST, finalize_POST, 
    videoIdComments_GET, videoIdCommentsCommentId_GET, videoIdCommentsComment_POST, videoIdCommentsCommentIdDelete_DELETE, videoIdLike_POST, videoIdDislike_POST, recommended_GET, 
    tags_GET, tagsAll_GET, videoIdWatch_GET, videoIdReport_POST, videoIdViewsIncrement_GET
} = require('../controllers/videos');
const { logDebugMessageToConsole } = require('../utils/logger');
const { getAuthenticationStatus, websocketNodeBroadcast } = require('../utils/helpers');
const { addToPublishVideoUploadingTracker, addToPublishVideoUploadingTrackerUploadRequests, isPublishVideoUploading } = require("../utils/trackers/publish-video-uploading-tracker");
const { getVideosDirectoryPath } = require('../utils/paths');
const { isSegmentNameValid, isVideoIdValid, isFormatValid, isResolutionValid } = require('../utils/validators');

const { submitDatabaseWriteJob } = require('../utils/database');

const router = express.Router();

router.post('/import', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const title = req.body.title;
                const description = req.body.description;
                const tags = req.body.tags;

                const data = await import_POST(title, description, tags);

                res.send(data);
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

router.post('/imported', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const videoId = req.body.videoId;

                const data = await imported_POST(videoId);

                res.send(data);
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

router.post('/:videoId/importing/stop', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const videoId = req.params.videoId;

                const data = await videoIdImportingStop_POST(videoId);

                res.send(data);
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

router.post('/publishing', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const videoId = req.body.videoId;

                const data = await publishing_POST(videoId);

                res.send(data);
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

router.post('/published', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const videoId = req.body.videoId;

                const data = await published_POST(videoId);

                res.send(data);
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

router.post('/:videoId/publishing/stop', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const videoId = req.params.videoId;

                const data = await videoIdPublishingStop_POST(videoId);

                res.send(data);
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

router.post('/:videoId/upload', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            const format = req.query.format;
            const resolution = req.query.resolution;

            logDebugMessageToConsole('uploading video with id <' + videoId + '> format <' + format + '> resolution <' + resolution + '>', null, null);

            const totalFileSize = parseInt(req.headers['content-length']);
            
            if(totalFileSize > 0) {
                addToPublishVideoUploadingTracker(videoId);

                addToPublishVideoUploadingTrackerUploadRequests(videoId, req);
                
                let lastPublishTimestamp = 0;
                let receivedFileSize = 0;
                req.on('data', function(chunk) {
                    if(!isPublishVideoUploading(videoId)) {
                        
                        receivedFileSize += chunk.length;
                        
                        const uploadProgress = Math.floor(((receivedFileSize / totalFileSize) * 100) / 2) + 50;
                        
                        // rate limit due to flooding
                        const currentPublishTimestamp = Date.now();
                        if((currentPublishTimestamp - lastPublishTimestamp > 1000) || uploadProgress === 100) {
                            lastPublishTimestamp = currentPublishTimestamp;
                            
                            websocketNodeBroadcast({eventName: 'echo', data: {eventName: 'video_status', payload: { type: 'publishing', videoId: videoId, format: format, resolution: resolution, progress: uploadProgress }}});
                        }
                    }
                });
                
                multer(
                {
                    fileFilter: function (req, file, cb) {
                        const mimeType = file.mimetype;
                        
                        if(mimeType === 'application/vnd.apple.mpegurl' || mimeType === 'video/mp2t' || mimeType === 'video/mp4' || mimeType === 'video/webm' || mimeType === 'video/ogg') {
                            cb(null, true);
                        }
                        else {
                            cb(new Error('unsupported upload file type'));
                        }
                    },
                    storage: multer.diskStorage({
                        destination: function (req, file, cb) {
                            let directoryPath = '';
                            
                            if(format === 'm3u8') {
                                const fileName = file.originalname;
                                const manifestFileName = 'manifest-' + resolution + '.m3u8';
                                
                                if(fileName === manifestFileName) {
                                    directoryPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/m3u8');
                                }
                                else if(isSegmentNameValid(fileName)) {
                                    directoryPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/m3u8/' + resolution);
                                }
                            }
                            else if(format === 'mp4') {
                                directoryPath = path.join(getVideosDirectoryPath(), videoId + '/progressive/mp4/' + resolution);
                            }
                            else if(format === 'webm') {
                                directoryPath = path.join(getVideosDirectoryPath(), videoId + '/progressive/webm/' + resolution);
                            }
                            else if(format === 'ogv') {
                                directoryPath = path.join(getVideosDirectoryPath(), videoId + '/progressive/ogv/' + resolution);
                            }
                            
                            if(directoryPath !== '') {
                                logDebugMessageToConsole('storing video with id <' + videoId + '> format <' + format + '> resolution <' + resolution + '> to directory <' + directoryPath + '>', null, null);
                                
                                fs.mkdirSync(directoryPath, { recursive: true });
                                
                                fs.access(directoryPath, fs.constants.F_OK, function(error) {
                                    if(error) {
                                        cb(new Error('directory creation error'), null);
                                    }
                                    else {
                                        cb(null, directoryPath);
                                    }
                                });
                            }
                            else {
                                cb(new Error('invalid directory path'), null);
                            }
                        },
                        filename: function (req, file, cb) {
                            cb(null, file.originalname);
                        }
                    })
                }).fields([{ name: 'video_files' }])
                (req, res, async function(error) {
                    if(error) {
                        logDebugMessageToConsole(null, error, new Error().stack);
                        
                        submitDatabaseWriteJob('UPDATE videos SET is_publishing = ?, is_error = ? WHERE video_id = ?', [0, 1, videoId], function(isError) {
                            if(isError) {
                                res.send({isError: true, message: 'error communicating with the MoarTube node'});
                            }
                            else {
                                res.send({isError: true, message: 'video upload error'});
                            }
                        });
                    }
                    else {
                        try {
                            const data = await videoIdUpload_POST(videoId, format, resolution);

                            res.send(data);
                        }
                        catch(error) {
                            logDebugMessageToConsole(null, error, new Error().stack);

                            res.send({isError: true, message: 'error communicating with the MoarTube node'});
                        }
                    }
                });
            }
            else {
                submitDatabaseWriteJob('UPDATE videos SET is_publishing = ?, is_error = ? WHERE video_id = ?', [0, 1, videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: true, message: 'invalid content-length'});
                    }
                });
            }
        }
        else {
            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.post('/:videoId/stream', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            const format = req.query.format;
            const resolution = req.query.resolution;

            if(isVideoIdValid(videoId, false) && isFormatValid(format) && isResolutionValid(resolution)) {
                const manifestFileName = 'manifest-' + resolution + '.m3u8';

                multer(
                {
                    fileFilter: function (req, file, cb) {
                        const mimeType = file.mimetype;
                        
                        if(mimeType === 'application/vnd.apple.mpegurl' || mimeType === 'video/mp2t') {
                            cb(null, true);
                        }
                        else {
                            cb(new Error('only application/vnd.apple.mpegurl and video/mp2t files are supported'));
                        }
                    },
                    storage: multer.diskStorage({
                        destination: function (req, file, cb) {
                            let directoryPath = '';
                            
                            if(format === 'm3u8') {
                                const fileName = file.originalname;

                                if(fileName === manifestFileName) {
                                    directoryPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/m3u8');
                                }
                                else if(isSegmentNameValid(fileName)) {
                                    directoryPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/m3u8/' + resolution);
                                }
                            }
                            else if(format === 'mp4') {
                                directoryPath = path.join(getVideosDirectoryPath(), videoId + '/progressive/mp4/' + resolution);
                            }
                            else if(format === 'webm') {
                                directoryPath = path.join(getVideosDirectoryPath(), videoId + '/progressive/webm/' + resolution);
                            }
                            else if(format === 'ogv') {
                                directoryPath = path.join(getVideosDirectoryPath(), videoId + '/progressive/ogv/' + resolution);
                            }
                            
                            if(directoryPath !== '') {
                                //logDebugMessageToConsole('storing stream with id <' + videoId + '> format <' + format + '> resolution <' + resolution + '> to directory <' + directoryPath + '>', null, null);
                                
                                fs.mkdirSync(directoryPath, { recursive: true });
                                
                                fs.access(directoryPath, fs.constants.F_OK, function(error) {
                                    if(error) {
                                        cb(new Error('directory creation error'), null);
                                    }
                                    else {
                                        cb(null, directoryPath);
                                    }
                                });
                            }
                            else {
                                cb(new Error('invalid directory path'), null);
                            }
                        },
                        filename: function (req, file, cb) {
                            if(file.originalname === manifestFileName) {
                                cb(null, file.originalname + '_temp');
                            }
                            else {
                                cb(null, file.originalname);
                            }
                        }
                    })
                }).fields([{ name: 'video_files' }])
                (req, res, async function(error) {
                    if(error) {
                        submitDatabaseWriteJob('UPDATE videos SET is_error = ? WHERE video_id = ?', [1, videoId], function(isError) {
                            if(isError) {
                                res.send({isError: true, message: 'error communicating with the MoarTube node'});
                            }
                            else {
                                res.send({isError: true, message: 'video upload error'});
                            }
                        });
                    }
                    else {
                        try {
                            const manifestFilePath_temp = req.files.video_files[0].path;
                            const manifestFilePath_new = path.join(getVideosDirectoryPath(), videoId + '/adaptive/m3u8/' + manifestFileName);
                            const segmentFileName = req.files.video_files[1].originalname;
                            
                            const data = await videoIdStream_POST(videoId, format, resolution, manifestFilePath_temp, manifestFilePath_new, segmentFileName);

                            res.send(data);
                        }
                        catch(error) {
                            logDebugMessageToConsole(null, error, new Error().stack);

                            res.send({isError: true, message: 'error communicating with the MoarTube node'});
                        }
                    }
                });
            }
            else {
                submitDatabaseWriteJob('UPDATE videos SET is_error = ? WHERE video_id = ?', [1, videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: true, message: 'invalid parameters'});
                    }
                });
            }
        }
        else {
            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.post('/error', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const videoId = req.body.videoId;

                const data = await error_POST(videoId);

                res.send(data);
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

router.post('/:videoId/sourceFileExtension', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const videoId = req.params.videoId;
                const sourceFileExtension = req.body.sourceFileExtension;

                const data = await videoIdSourceFileExtension_POST(videoId, sourceFileExtension);

                res.send(data);
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

router.get('/:videoId/sourceFileExtension', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const videoId = req.params.videoId;

                const data = await videoIdSourceFileExtension_GET(videoId);

                res.send(data);
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

router.get('/:videoId/publishes', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const videoId = req.params.videoId;

                const data = await videoIdPublishes_GET(videoId);

                res.send(data);
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

router.post('/:videoId/unpublish', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const videoId = req.params.videoId;
                const format = req.body.format;
                const resolution = req.body.resolution;

                const data = await videoIdUnpublish_POST(videoId, format, resolution);

                res.send(data);
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

router.post('/:videoId/data', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const videoId = req.params.videoId;
                const title = req.body.title;
                const description = req.body.description;
                const tags = req.body.tags;

                const data = await videoIdData_POST(videoId, title, description, tags);

                res.send(data);
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

router.post('/:videoId/index/add', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const videoId = req.params.videoId;
                const containsAdultContent = req.body.containsAdultContent;
                const termsOfServiceAgreed = req.body.termsOfServiceAgreed;
                const cloudflareTurnstileToken = req.body.cloudflareTurnstileToken;

                const data = await videoIdIndexAdd_POST(videoId, containsAdultContent, termsOfServiceAgreed, cloudflareTurnstileToken);

                res.send(data);
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

router.post('/:videoId/index/remove', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const videoId = req.params.videoId;
                const cloudflareTurnstileToken = req.body.cloudflareTurnstileToken;

                const data = await videoIdIndexRemove_POST(videoId, cloudflareTurnstileToken);

                res.send(data);
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

router.get('/:videoId/alias', async (req, res) => {
    try {
        const videoId = req.params.videoId;

        const data = await videoIdAlias_GET(videoId);

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.get('/search', async (req, res) => {
    try {
        const searchTerm = req.query.searchTerm;
        const sortTerm = req.query.sortTerm;
        const tagTerm = req.query.tagTerm;
        const tagLimit = req.query.tagLimit;
        const timestamp = req.query.timestamp;

        const data = await search_GET(searchTerm, sortTerm, tagTerm, tagLimit, timestamp);

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.post('/:videoId/thumbnail', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            
            if(isVideoIdValid(videoId, false)) {
                //logDebugMessageToConsole('uploading thumbnail for video id: ' + videoId, null, null);

                multer(
                {
                    fileFilter: function (req, file, cb) {
                        const mimeType = file.mimetype;
                        
                        if(mimeType === 'image/jpeg') {
                            cb(null, true);
                        }
                        else {
                            cb(new Error('unsupported upload file type'));
                        }
                    },
                    storage: multer.diskStorage({
                        destination: function (req, file, cb) {
                            const filePath = path.join(getVideosDirectoryPath(), videoId + '/images');
                            
                            fs.access(filePath, fs.constants.F_OK, function(error) {
                                if(error) {
                                    cb(new Error('file upload error'), null);
                                }
                                else {
                                    cb(null, filePath);
                                }
                            });
                        },
                        filename: function (req, file, cb) {
                            const mimeType = file.mimetype;
                            
                            if(mimeType === 'image/jpeg')
                            {
                                let extension;
                                
                                if(mimeType === 'image/jpeg')
                                {
                                    extension = '.jpg';
                                }
                                
                                const fileName = 'thumbnail' + extension;
                                
                                cb(null, fileName);
                            }
                            else
                            {
                                cb(new Error('Invalid Media Detected'), null);
                            }
                        }
                    })
                }).fields([{ name: 'thumbnailFile', maxCount: 1 }])
                (req, res, async function(error)
                {
                    if(error) {
                        logDebugMessageToConsole(null, error, new Error().stack);
                        
                        res.send({isError: true, message: error.message});
                    }
                    else {
                        try {
                            //logDebugMessageToConsole('uploaded thumbnail for video id <' + videoId + '>', null, null);

                            const data = await videoIdThumbnail_POST(videoId);

                            res.send(data);
                        }
                        catch(error) {
                            logDebugMessageToConsole(null, error, new Error().stack);

                            res.send({isError: true, message: 'error communicating with the MoarTube node'});
                        }
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
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

router.post('/:videoId/preview', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            
            if(isVideoIdValid(videoId, false)) {
                multer(
                {
                    fileFilter: function (req, file, cb) {
                        const mimeType = file.mimetype;
                        
                        if(mimeType === 'image/jpeg') {
                            cb(null, true);
                        }
                        else {
                            cb(new Error('unsupported upload file type'));
                        }
                    },
                    storage: multer.diskStorage({
                        destination: function (req, file, cb) {
                            const filePath = path.join(getVideosDirectoryPath(), videoId + '/images');
                            
                            fs.access(filePath, fs.constants.F_OK, function(error)
                            {
                                if(error)
                                {
                                    cb(new Error('file upload error'), null);
                                }
                                else
                                {
                                    cb(null, filePath);
                                }
                            });
                        },
                        filename: function (req, file, cb) {
                            const mimeType = file.mimetype;
                            
                            if(mimeType === 'image/jpeg')
                            {
                                let extension;
                                
                                if(mimeType === 'image/jpeg')
                                {
                                    extension = '.jpg';
                                }
                                
                                const fileName = 'preview' + extension;
                                
                                cb(null, fileName);
                            }
                            else
                            {
                                cb(new Error('Invalid Media Detected'), null);
                            }
                        }
                    })
                }).fields([{ name: 'previewFile', maxCount: 1 }])
                (req, res, async function(error)
                {
                    if(error) {
                        logDebugMessageToConsole(null, error, new Error().stack);
                        
                        res.send({isError: true, message: error.message});
                    }
                    else {
                        try {
                            //logDebugMessageToConsole('uploaded preview for video id <' + videoId + '>', null, null);

                            const data = await videoIdPreview_POST(videoId);

                            res.send(data);
                        }
                        catch(error) {
                            logDebugMessageToConsole(null, error, new Error().stack);

                            res.send({isError: true, message: 'error communicating with the MoarTube node'});
                        }
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
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

router.post('/:videoId/poster', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            
            if(isVideoIdValid(videoId, false)) {
                multer(
                {
                    fileFilter: function (req, file, cb) {
                        const mimeType = file.mimetype;
                        
                        if(mimeType === 'image/jpeg') {
                            cb(null, true);
                        }
                        else {
                            cb(new Error('unsupported upload file type'));
                        }
                    },
                    storage: multer.diskStorage({
                        destination: function (req, file, cb) {
                            const filePath = path.join(getVideosDirectoryPath(), videoId + '/images');
                            
                            fs.access(filePath, fs.constants.F_OK, function(error)
                            {
                                if(error)
                                {
                                    cb(new Error('file upload error'), null);
                                }
                                else
                                {
                                    cb(null, filePath);
                                }
                            });
                        },
                        filename: function (req, file, cb) {
                            const mimeType = file.mimetype;
                            
                            if(mimeType === 'image/jpeg')
                            {
                                let extension;
                                
                                if(mimeType === 'image/jpeg')
                                {
                                    extension = '.jpg';
                                }
                                
                                const fileName = 'poster' + extension;
                                
                                cb(null, fileName);
                            }
                            else
                            {
                                cb(new Error('Invalid Media Detected'), null);
                            }
                        }
                    })
                }).fields([{ name: 'posterFile', maxCount: 1 }])
                (req, res, async function(error)
                {
                    if(error) {
                        logDebugMessageToConsole(null, error, new Error().stack);
                        
                        res.send({isError: true, message: error.message});
                    }
                    else {
                        try {
                            //logDebugMessageToConsole('uploaded poster for video id <' + videoId + '>', null, null);

                            const data = videoIdPoster_POST(videoId);

                            res.send(data);
                        }
                        catch(error) {
                            logDebugMessageToConsole(null, error, new Error().stack);

                            res.send({isError: true, message: 'error communicating with the MoarTube node'});
                        }
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
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

router.post('/:videoId/lengths', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const videoId = req.params.videoId;
                const lengthSeconds = req.body.lengthSeconds;
                const lengthTimestamp = req.body.lengthTimestamp;

                const data = await videoIdLengths_POST(videoId, lengthSeconds, lengthTimestamp);

                res.send(data);
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

router.get('/:videoId/data', async (req, res) => {
    try {
        const videoId = req.params.videoId;

        const data = await videoIdData_GET(videoId);

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.post('/delete', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const videoIdsJson = req.body.videoIdsJson;

                const data = await delete_POST(videoIdsJson);

                res.send(data);
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

router.post('/finalize', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const videoIdsJson = req.body.videoIdsJson;

                const data = await finalize_POST(videoIdsJson);

                res.send(data);
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

router.get('/:videoId/comments', async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const type = req.query.type;
        const sort = req.query.sort;
        const timestamp = req.query.timestamp;

        const data = await videoIdComments_GET(videoId, type, sort, timestamp);

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.get('/:videoId/comments/:commentId', async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const commentId = req.params.commentId;

        const data = await videoIdCommentsCommentId_GET(videoId, commentId);

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.post('/:videoId/comments/comment', async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const commentPlainText = req.body.commentPlainText;
        const timestamp = req.body.timestamp;
        const cloudflareTurnstileToken = req.body.cloudflareTurnstileToken;

        const cloudflareConnectingIp = req.header('CF-Connecting-IP');

        const data = await videoIdCommentsComment_POST(videoId, commentPlainText, timestamp, cloudflareTurnstileToken, cloudflareConnectingIp);

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.delete('/:videoId/comments/:commentId/delete', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const videoId = req.params.videoId;
                const commentId = req.params.commentId;
                const timestamp = req.query.timestamp;

                const data = await videoIdCommentsCommentIdDelete_DELETE(videoId, commentId, timestamp);

                res.send(data);
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

router.post('/:videoId/like', async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const cloudflareTurnstileToken = req.body.cloudflareTurnstileToken;

        const cloudflareConnectingIp = req.header('CF-Connecting-IP');

        const data = await videoIdLike_POST(videoId, cloudflareTurnstileToken, cloudflareConnectingIp);

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.post('/:videoId/dislike', async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const cloudflareTurnstileToken = req.body.cloudflareTurnstileToken;

        const cloudflareConnectingIp = req.header('CF-Connecting-IP');

        const data = await videoIdDislike_POST(videoId, cloudflareTurnstileToken, cloudflareConnectingIp);

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.get('/recommended', async (req, res) => {
    try {
        const data = await recommended_GET();

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);
    
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.get('/tags', async (req, res) => {
    try {
        const data = await tags_GET();

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.get('/tags/all', async (req, res) => {
    try {
        const data = await tagsAll_GET();

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.post('/:videoId/report', async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const email = req.body.email;
        const reportType = req.body.reportType;
        const message = req.body.message;
        const cloudflareTurnstileToken = req.body.cloudflareTurnstileToken;

        const cloudflareConnectingIp = req.header('CF-Connecting-IP');

        const data = await videoIdReport_POST(videoId, email, reportType, message, cloudflareTurnstileToken, cloudflareConnectingIp);

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);
    
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.get('/:videoId/views/increment', async (req, res) => {
    try {
        const videoId = req.params.videoId;

        const data = await videoIdViewsIncrement_GET(videoId);

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);
    
            res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.get('/:videoId/watch', async (req, res) => {
    try {
        const videoId = req.params.videoId;

        const data = await videoIdWatch_GET(videoId);

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

module.exports = router;
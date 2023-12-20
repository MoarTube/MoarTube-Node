const express = require('express');

const { 
     
} = require('../controllers/videos');

const router = express.Router();

router.post('/import', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const title = req.body.title;
            const description = req.body.description;
            const tags = req.body.tags;
            
            if(!isTitleValid(title)) {
                res.send({isError: true, message: 'title is not valid'});
            }
            else if(!isDescriptionValid(description)) {
                res.send({isError: true, message: 'description is not valid'});
            }
            else if(!isTagsValid(tags)) {
                res.send({isError: true, message: 'tags are not valid'});
            }
            else {
                const videoId = await generateVideoId(database);
                const creationTimestamp = Date.now();
                
                const meta = JSON.stringify({});

                logDebugMessageToConsole('importing video with id <' + videoId + '>', null, null, true);
                
                const tagsSanitized = sanitizeTagsSpaces(tags);
                
                fs.mkdirSync(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images'), { recursive: true });
                fs.mkdirSync(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive'), { recursive: true });
                fs.mkdirSync(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive'), { recursive: true });
                
                const query = 'INSERT INTO videos(video_id, source_file_extension, title, description, tags, length_seconds, length_timestamp, views, comments, likes, dislikes, bandwidth, is_importing, is_imported, is_publishing, is_published, is_streaming, is_streamed, is_stream_recorded_remotely, is_stream_recorded_locally, is_live, is_indexed, is_index_outdated, is_error, is_finalized, meta, creation_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                const parameters = [videoId, '', title, description, tags, 0, '', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, meta, creationTimestamp];
                
                submitDatabaseWriteJob(query, parameters, function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        websocketNodeBroadcast({
                            eventName: 'echo', 
                            data: {
                                eventName: 'video_data', 
                                payload: {
                                    videoId: videoId, 
                                    thumbnail: '', 
                                    title: title, 
                                    description: description, 
                                    tags: tagsSanitized, 
                                    lengthSeconds: 0, 
                                    lengthTimestamp: '', 
                                    views: 0, 
                                    comments: 0, 
                                    likes: 0, 
                                    dislikes: 0, 
                                    bandwidth: 0, 
                                    isImporting: 1, 
                                    isImported: 0,
                                    isPublishing: 0,
                                    isPublished: 0,
                                    isLive: 0,
                                    isStreaming: 0,
                                    isStreamed: 0,
                                    isStreamRecordedRemotely: 0,
                                    isStreamRecordedLocally: 0,
                                    isIndexed: 0,
                                    isIndexOutdated: 0,
                                    isError: 0,
                                    isFinalized: 0,
                                    meta: meta,
                                    creationTimestamp: creationTimestamp
                                }
                            }
                        });
                        
                        res.send({isError: false, videoId: videoId});
                    }
                });
            }
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

router.post('/imported', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.body.videoId;
            
            if(isVideoIdValid(videoId)) {
                submitDatabaseWriteJob('UPDATE videos SET is_importing = ?, is_imported = ? WHERE video_id = ?', [0, 1, videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false});
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

router.post('/:videoId/importing/stop', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            
            if(isVideoIdValid(videoId)) {
                submitDatabaseWriteJob('UPDATE videos SET is_importing = 0 WHERE video_id = ?', [videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false});
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

router.post('/publishing', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.body.videoId;
            
            if(isVideoIdValid(videoId)) {
                submitDatabaseWriteJob('UPDATE videos SET is_publishing = ? WHERE video_id = ?', [1, videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false});
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

router.post('/published', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.body.videoId;
            
            if(isVideoIdValid(videoId)) {
                submitDatabaseWriteJob('UPDATE videos SET is_publishing = ?, is_published = ? WHERE video_id = ?', [0, 1, videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false});
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

router.post('/:videoId/publishing/stop', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            
            if(isVideoIdValid(videoId)) {
                submitDatabaseWriteJob('UPDATE videos SET is_publishing = 0 WHERE video_id = ?', [videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false});
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

router.post('/:videoId/upload', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            const format = req.query.format;
            const resolution = req.query.resolution;
            
            if(isVideoIdValid(videoId) && isFormatValid(format) && isResolutionValid(resolution)) {
                logDebugMessageToConsole('uploading video with id <' + videoId + '> format <' + format + '> resolution <' + resolution + '>', null, null, true);

                const totalFileSize = parseInt(req.headers['content-length']);
                
                if(totalFileSize > 0) {
                    if(!publishVideoUploadingTracker.hasOwnProperty(videoId)) {
                        publishVideoUploadingTracker[videoId] = {uploadRequests: [], stopping: false};
                    }
                    
                    publishVideoUploadingTracker[videoId].uploadRequests.push(req);
                    
                    var lastPublishTimestamp = 0;
                    var receivedFileSize = 0;
                    req.on('data', function(chunk) {
                        if(!publishVideoUploadingTracker[videoId].stopping) {
                            
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
                                var directoryPath = '';
                                
                                if(format === 'm3u8') {
                                    const fileName = file.originalname;
                                    const manifestFileName = 'manifest-' + resolution + '.m3u8';
                                    
                                    if(fileName === manifestFileName) {
                                        directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/m3u8');
                                    }
                                    else if(isSegmentNameValid(fileName)) {
                                        directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/m3u8/' + resolution);
                                    }
                                }
                                else if(format === 'mp4') {
                                    directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/mp4/' + resolution);
                                }
                                else if(format === 'webm') {
                                    directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/webm/' + resolution);
                                }
                                else if(format === 'ogv') {
                                    directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/ogv/' + resolution);
                                }
                                
                                if(directoryPath !== '') {
                                    logDebugMessageToConsole('storing video with id <' + videoId + '> format <' + format + '> resolution <' + resolution + '> to directory <' + directoryPath + '>', null, null, true);
                                    
                                    fs.mkdirSync(directoryPath, { recursive: true });
                                    
                                    fs.access(directoryPath, fs.F_OK, function(error) {
                                        if(error) {
                                            cb(new Error('directory creation error'));
                                        }
                                        else {
                                            cb(null, directoryPath);
                                        }
                                    });
                                }
                                else {
                                    cb(new Error('invalid directory path'));
                                }
                            },
                            filename: function (req, file, cb) {
                                cb(null, file.originalname);
                            }
                        })
                    }).fields([{ name: 'video_files' }])
                    (req, res, async function(error)
                    {
                        if(error) {
                            logDebugMessageToConsole(null, error, new Error().stack, true);
                            
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
                            if(format === 'm3u8') {
                                updateHlsVideoMasterManifestFile(videoId);
                            }
                            
                            res.send({isError: false});
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
                submitDatabaseWriteJob('UPDATE videos SET is_publishing = ?, is_error = ? WHERE video_id = ?', [0, 1, videoId], function(isError) {
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
            submitDatabaseWriteJob('UPDATE videos SET is_publishing = ?, is_error = ? WHERE video_id = ?', [0, 1, videoId], function(isError) {
                if(isError) {
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);
                    
                    res.send({isError: true, message: 'you are not logged in'});
                }
            });
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});


router.post('/:videoId/stream', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            const format = req.query.format;
            const resolution = req.query.resolution;
            
            if(isVideoIdValid(videoId) && isFormatValid(format) && isResolutionValid(resolution)) {
                multer(
                {
                    fileFilter: function (req, file, cb) {
                        const mimeType = file.mimetype;
                        
                        if(mimeType === 'application/vnd.apple.mpegurl' || mimeType === 'video/mp2t') {
                            cb(null, true);
                        }
                        else {
                            cb(new error('only application/vnd.apple.mpegurl and video/mp2t files are supported'));
                        }
                    },
                    storage: multer.diskStorage({
                        destination: function (req, file, cb) {
                            var directoryPath = '';
                            
                            if(format === 'm3u8') {
                                const fileName = file.originalname;
                                const manifestFileName = 'manifest-' + resolution + '.m3u8';
                                
                                if(fileName === manifestFileName) {
                                    directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/m3u8');
                                }
                                else if(isSegmentNameValid(fileName)) {
                                    directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/m3u8/' + resolution);
                                }
                            }
                            else if(format === 'mp4') {
                                directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/mp4/' + resolution);
                            }
                            else if(format === 'webm') {
                                directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/webm/' + resolution);
                            }
                            else if(format === 'ogv') {
                                directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/ogv/' + resolution);
                            }
                            
                            if(directoryPath !== '') {
                                logDebugMessageToConsole('storing stream with id <' + videoId + '> format <' + format + '> resolution <' + resolution + '> to directory <' + directoryPath + '>', null, null, true);
                                
                                fs.mkdirSync(directoryPath, { recursive: true });
                                
                                fs.access(directoryPath, fs.F_OK, function(error) {
                                    if(error) {
                                        cb(new Error('directory creation error'));
                                    }
                                    else {
                                        cb(null, directoryPath);
                                    }
                                });
                            }
                            else {
                                cb(new Error('invalid directory path'));
                            }
                        },
                        filename: function (req, file, cb) {
                            cb(null, file.originalname);
                        }
                    })
                }).fields([{ name: 'video_files' }])
                (req, res, async function(error)
                {
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
                        if(format === 'm3u8') {
                            updateHlsVideoMasterManifestFile(videoId);
                        }
                        
                        res.send({isError: false});
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
            submitDatabaseWriteJob('UPDATE videos SET is_error = ? WHERE video_id = ?', [1, videoId], function(isError) {
                if(isError) {
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

                    res.send({isError: true, message: 'you are not logged in'});
                }
            });
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});


router.post('/error', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.body.videoId;
            
            if(isVideoIdValid(videoId)) {
                submitDatabaseWriteJob('UPDATE videos SET is_error = ? WHERE video_id = ?', [1, videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false});
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

router.post('/ready', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.body.videoId;
            
            if(isVideoIdValid(videoId)) {
                submitDatabaseWriteJob('UPDATE videos SET is_ready = ? WHERE video_id = ?', [1, videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false});
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

router.post('/:videoId/sourceFileExtension', async (req, res) => {
    
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            const sourceFileExtension = req.body.sourceFileExtension;
            
            if(isVideoIdValid(videoId) && isSourceFileExtensionValid(sourceFileExtension)) {
                submitDatabaseWriteJob('UPDATE videos SET source_file_extension = ? WHERE video_id = ?', [sourceFileExtension, videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false});
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

router.get('/:videoId/sourceFileExtension', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            
            if(isVideoIdValid(videoId)) {
                database.get('SELECT source_file_extension FROM videos WHERE video_id = ?', videoId, function(error, row) {
                    if(error) {
                        logDebugMessageToConsole(null, error, new Error().stack, true);

                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        if(row != null) {
                            const sourceFileExtension = row.source_file_extension;
                            
                            res.send({isError: false, sourceFileExtension: sourceFileExtension});
                        }
                        else {
                            res.send({isError: true, message: 'that video does not exist'});
                        }
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

router.get('/:videoId/publishes', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            
            if(isVideoIdValid(videoId)) {
                database.get('SELECT * FROM videos WHERE video_id = ?', videoId, function(error, row) {
                    if(error) {
                        logDebugMessageToConsole(null, error, new Error().stack, true);
                        
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        if(row != null) {
                            const publishes = [
                                { format: 'm3u8', resolution: '2160p', isPublished: false },
                                { format: 'm3u8', resolution: '1440p', isPublished: false },
                                { format: 'm3u8', resolution: '1080p', isPublished: false },
                                { format: 'm3u8', resolution: '720p', isPublished: false },
                                { format: 'm3u8', resolution: '480p', isPublished: false },
                                { format: 'm3u8', resolution: '360p', isPublished: false },
                                { format: 'm3u8', resolution: '240p', isPublished: false },
                                
                                { format: 'mp4', resolution: '2160p', isPublished: false },
                                { format: 'mp4', resolution: '1440p', isPublished: false },
                                { format: 'mp4', resolution: '1080p', isPublished: false },
                                { format: 'mp4', resolution: '720p', isPublished: false },
                                { format: 'mp4', resolution: '480p', isPublished: false },
                                { format: 'mp4', resolution: '360p', isPublished: false },
                                { format: 'mp4', resolution: '240p', isPublished: false },
                                
                                { format: 'webm', resolution: '2160p', isPublished: false },
                                { format: 'webm', resolution: '1440p', isPublished: false },
                                { format: 'webm', resolution: '1080p', isPublished: false },
                                { format: 'webm', resolution: '720p', isPublished: false },
                                { format: 'webm', resolution: '480p', isPublished: false },
                                { format: 'webm', resolution: '360p', isPublished: false },
                                { format: 'webm', resolution: '240p', isPublished: false },
                                
                                { format: 'ogv', resolution: '2160p', isPublished: false },
                                { format: 'ogv', resolution: '1440p', isPublished: false },
                                { format: 'ogv', resolution: '1080p', isPublished: false },
                                { format: 'ogv', resolution: '720p', isPublished: false },
                                { format: 'ogv', resolution: '480p', isPublished: false },
                                { format: 'ogv', resolution: '360p', isPublished: false },
                                { format: 'ogv', resolution: '240p', isPublished: false },
                            ];
                            
                            if(row.is_published) {
                                const videosDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId);
                                const m3u8DirectoryPath = path.join(videosDirectoryPath, 'adaptive/m3u8');
                                const mp4DirectoryPath = path.join(videosDirectoryPath, 'progressive/mp4');
                                const webmDirectoryPath = path.join(videosDirectoryPath, 'progressive/webm');
                                const ogvDirectoryPath = path.join(videosDirectoryPath, 'progressive/ogv');
                                
                                if (fs.existsSync(m3u8DirectoryPath)) {
                                    fs.readdirSync(m3u8DirectoryPath).forEach(fileName => {
                                        const filePath = path.join(m3u8DirectoryPath, fileName);
                                        if (fs.lstatSync(filePath).isDirectory()) {
                                            modifyPublishMatrix('m3u8', fileName);
                                        }
                                    });
                                }
                                
                                if (fs.existsSync(mp4DirectoryPath)) {
                                    fs.readdirSync(mp4DirectoryPath).forEach(fileName => {
                                        const filePath = path.join(mp4DirectoryPath, fileName);
                                        if (fs.lstatSync(filePath).isDirectory()) {
                                            modifyPublishMatrix('mp4', fileName);
                                        }
                                    });
                                }
                                
                                if (fs.existsSync(webmDirectoryPath)) {
                                    fs.readdirSync(webmDirectoryPath).forEach(fileName => {
                                        const filePath = path.join(webmDirectoryPath, fileName);
                                        if (fs.lstatSync(filePath).isDirectory()) {
                                            modifyPublishMatrix('webm', fileName);
                                        }
                                    });
                                }
                                
                                if (fs.existsSync(ogvDirectoryPath)) {
                                    fs.readdirSync(ogvDirectoryPath).forEach(fileName => {
                                        const filePath = path.join(ogvDirectoryPath, fileName);
                                        if (fs.lstatSync(filePath).isDirectory()) {
                                            modifyPublishMatrix('ogv', fileName);
                                        }
                                    });
                                }
                                
                                function modifyPublishMatrix(format, resolution) {
                                    for(publish of publishes) {
                                        if(publish.format === format && publish.resolution === resolution) {
                                            publish.isPublished = true;
                                            break;
                                        }
                                    }
                                }
                            }
                            
                            res.send({isError: false, publishes: publishes});
                        }
                        else {
                            res.send({isError: true, message: 'that video does not exist'});
                        }
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

router.post('/:videoId/unpublish', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            const format = req.body.format;
            const resolution = req.body.resolution;
            
            if(isVideoIdValid(videoId) && isFormatValid(format) && isResolutionValid(resolution)) {
                logDebugMessageToConsole('unpublishing video with id <' + videoId + '> format <' + format + '> resolution <' + resolution + '>', null, null, true);
                
                var videoDirectoryPath = '';
                var manifestFilePath = '';
                
                if(format === 'm3u8') {
                    manifestFilePath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/' + format + '/manifest-' + resolution + '.m3u8');
                    videoDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/' + format + '/' + resolution);
                }
                else if(format === 'mp4') {
                    videoDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/' + format + '/' + resolution);
                }
                else if(format === 'webm') {
                    videoDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/' + format + '/' + resolution);
                }
                else if(format === 'ogv') {
                    videoDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/' + format + '/' + resolution);
                }
                
                if(fs.existsSync(videoDirectoryPath)) {
                    deleteDirectoryRecursive(videoDirectoryPath);
                }
                
                if(fs.existsSync(manifestFilePath)) {
                    fs.unlinkSync(manifestFilePath);
                }
                
                if(format === 'm3u8') {
                    updateHlsVideoMasterManifestFile(videoId);
                }
                
                res.send({isError: false});
            }
            else {
                res.send({isError: true, message: 'incorrect parameters'});
            }
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

router.get('/:videoId/information', (req, res) => {
    const videoId = req.params.videoId;
    
    if(isVideoIdValid(videoId)) {
        database.get('SELECT * FROM videos WHERE video_id = ?', videoId, function(error, row) {
            if(error) {
                logDebugMessageToConsole(null, error, new Error().stack, true);
                
                res.send({isError: true, message: 'error communicating with the MoarTube node'});
            }
            else {
                if(row != null) {
                    const nodeSettings = getNodeSettings();
                    
                    const information = {
                        videoId: row.video_id,
                        title: row.title,
                        description: row.description,
                        tags: row.tags,
                        views: row.views,
                        isLive: row.is_live,
                        isStreaming: row.is_streaming,
                        isFinalized: row.is_finalized,
                        timestamp: row.creation_timestamp,
                        tags: row.tags,
                        nodeName: nodeSettings.nodeName
                    };
                    
                    res.send({isError: false, information: information});
                }
                else {
                    res.send({isError: true, message: 'that video does not exist'});
                }
            }
        });
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
});

// Saves information about a video (title, description, tags)
router.post('/:videoId/information', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            var videoId = req.params.videoId;
            var title = req.body.title;
            var description = req.body.description;
            var tags = req.body.tags;
            
            if(!isVideoIdValid(videoId)) {
                res.send({isError: true, message: 'video id is not valid'});
            }
            else if(!isTitleValid(title)) {
                res.send({isError: true, message: 'title is not valid'});
            }
            else if(!isDescriptionValid(description)) {
                res.send({isError: true, message: 'description is not valid'});
            }
            else if(!isTagsValid(tags)) {
                res.send({isError: true, message: 'tags are not valid'});
            }
            else {
                const tagsSanitized = sanitizeTagsSpaces(tags);
                
                submitDatabaseWriteJob('UPDATE videos SET title = ?, description = ?, tags = ?, is_index_outdated = CASE WHEN is_indexed = 1 THEN 1 ELSE is_index_outdated END WHERE video_id = ?', [title, description, tagsSanitized, videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false, information: {title: title, tags: tags}});
                    }
                });
            }
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

router.post('/:videoId/index/add', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            const captchaResponse = req.body.captchaResponse;
            const containsAdultContent = req.body.containsAdultContent;
            const termsOfServiceAgreed = req.body.termsOfServiceAgreed;

            if(isVideoIdValid(videoId) && isBooleanValid(containsAdultContent) && isBooleanValid(termsOfServiceAgreed)) {
                if(termsOfServiceAgreed) {
                    const nodeSettings = getNodeSettings();
                    
                    if(nodeSettings.isNodePrivate) {
                        res.send({isError: true, message: "MoarTube Indexer unavailable; node is private"});
                    }
                    else if(!nodeSettings.isNodeConfigured) {
                        res.send({isError: true, message: "MoarTube Indexer unavailable; this node has not performed initial configuration"});
                    }
                    else {
                        const nodeId = nodeSettings.nodeId;
                        const nodeName = nodeSettings.nodeName;
                        const nodeAbout = nodeSettings.nodeAbout;
                        const publicNodeProtocol = nodeSettings.publicNodeProtocol;
                        const publicNodeAddress = nodeSettings.publicNodeAddress;
                        const publicNodePort = nodeSettings.publicNodePort;
                        
                        database.get('SELECT * FROM videos WHERE video_id = ?', videoId, function(error, video) {
                            if(error) {
                                logDebugMessageToConsole(null, error, new Error().stack, true);
                                
                                res.send({isError: true, message: 'error retrieving video data'});
                            }
                            else {
                                if(video != null) {
                                    if(video.is_published || video.is_live) {
                                        performNodeIdentification(false)
                                        .then(() => {
                                            const nodeIdentification = getNodeIdentification();
                                            
                                            const nodeIdentifier = nodeIdentification.nodeIdentifier;
                                            const nodeIdentifierProof = nodeIdentification.nodeIdentifierProof;
                                            
                                            const title = video.title;
                                            const tags = video.tags;
                                            const views = video.views;
                                            const isLive = (video.is_live === 1);
                                            const isStreaming = (video.is_streaming === 1);
                                            const lengthSeconds = video.length_seconds;
                                            const creationTimestamp = video.creation_timestamp;

                                            var nodeIconBase64 = getNodeIconBase64();

                                            const videoPreviewImageBase64 = fs.readFileSync(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images/preview.jpg')).toString('base64');
                                            
                                            const data = {
                                                videoId: videoId,
                                                nodeId: nodeId,
                                                nodeIdentifier: nodeIdentifier,
                                                nodeIdentifierProof: nodeIdentifierProof,
                                                nodeName: nodeName,
                                                nodeAbout: nodeAbout,
                                                publicNodeProtocol: publicNodeProtocol,
                                                publicNodeAddress: publicNodeAddress,
                                                publicNodePort: publicNodePort,
                                                title: title,
                                                tags: tags,
                                                views: views,
                                                isLive: isLive,
                                                isStreaming: isStreaming,
                                                lengthSeconds: lengthSeconds,
                                                creationTimestamp: creationTimestamp,
                                                captchaResponse: captchaResponse,
                                                containsAdultContent: containsAdultContent,
                                                nodeIconBase64: nodeIconBase64,
                                                videoPreviewImageBase64: videoPreviewImageBase64
                                            };
                                            
                                            indexer_addVideoToIndex(data)
                                            .then(indexerResponseData => {
                                                if(indexerResponseData.isError) {
                                                    res.send({isError: true, message: indexerResponseData.message});
                                                }
                                                else {
                                                    submitDatabaseWriteJob('UPDATE videos SET is_indexed = 1 WHERE video_id = ?', [videoId], function(isError) {
                                                        if(isError) {
                                                            res.send({isError: true, message: 'error communicating with the MoarTube node'});
                                                        }
                                                        else {
                                                            res.send({isError: false});
                                                        }
                                                    });
                                                }
                                            })
                                            .catch(error => {
                                                res.send('error communicating with the MoarTube indexer');
                                            });
                                        })
                                        .catch(error => {
                                            res.send({isError: true, message: 'an error occurred while attempting to index, please try again later'});
                                        });
                                    }
                                    else {
                                        res.send({isError: true, message: 'videos have to be published before they can be indexed'});
                                    }
                                }
                                else {
                                    res.send({isError: true, message: 'that video does not exist'});
                                }
                            }
                        });
                    }
                }
                else {
                    res.send({isError: true, message: 'you must agree to the terms of service'});
                }
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

router.post('/:videoId/index/remove', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;

            if(isVideoIdValid(videoId)) {
                const nodeSettings = getNodeSettings();

                if(nodeSettings.isNodePrivate) {
                    res.send({isError: true, message: "MoarTube Indexer unavailable; node is private"});
                }
                else if(!nodeSettings.isNodeConfigured) {
                    res.send({isError: true, message: "MoarTube Indexer; this node has not performed initial configuration"});
                }
                else {
                    database.get('SELECT * FROM videos WHERE video_id = ?', videoId, function(error, video) {
                        if(error) {
                            logDebugMessageToConsole(null, error, new Error().stack, true);
                            
                            res.send({isError: true, message: 'error retrieving video data'});
                        }
                        else {
                            if(video != null) {
                                performNodeIdentification(false)
                                .then(() => {
                                    const nodeIdentification = getNodeIdentification();
                                    
                                    const nodeIdentifier = nodeIdentification.nodeIdentifier;
                                    const nodeIdentifierProof = nodeIdentification.nodeIdentifierProof;
                                    
                                    const data = {
                                        videoId: videoId,
                                        nodeIdentifier: nodeIdentifier,
                                        nodeIdentifierProof: nodeIdentifierProof
                                    };
                                    
                                    indexer_removeVideoFromIndex(data)
                                    .then(indexerResponseData => {
                                        if(indexerResponseData.isError) {
                                            res.send({isError: true, message: indexerResponseData.message});
                                        }
                                        else {
                                            submitDatabaseWriteJob('UPDATE videos SET is_indexed = 0 WHERE video_id = ?', [videoId], function(isError) {
                                                if(isError) {
                                                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                                                }
                                                else {
                                                    res.send({isError: false});
                                                }
                                            });
                                        }
                                    })
                                    .catch(error => {
                                        res.send('error communicating with the MoarTube indexer');
                                    });
                                })
                                .catch(error => {
                                    res.send({isError: true, message: 'an error occurred while attempting to index, please try again later'});
                                });
                            }
                            else {
                                res.send({isError: true, message: 'that video does not exist'});
                            }
                        }
                    });
                }
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

router.post('/:videoId/alias', (req, res) => {
    const videoId = req.params.videoId;
    const captchaResponse = req.body.captchaResponse;

    if(isVideoIdValid(videoId)) {
        const nodeSettings = getNodeSettings();

        if(nodeSettings.isNodePrivate) {
            res.send({isError: true, message: "aliasing unavailable; this node currently running privately"});
        }
        else if(!nodeSettings.isNodeConfigured) {
            res.send({isError: true, message: "aliasing unavailable; this node has not performed initial configuration"});
        }
        else {
            performNodeIdentification(false)
            .then(() => {
                const nodeIdentification = getNodeIdentification();
                
                const data = {
                    videoId: videoId,
                    nodeId: nodeSettings.nodeId,
                    nodeName: nodeSettings.nodeName,
                    nodeAbout: nodeSettings.nodeAbout,
                    publicNodeProtocol: nodeSettings.publicNodeProtocol,
                    publicNodeAddress: nodeSettings.publicNodeAddress,
                    publicNodePort: nodeSettings.publicNodePort,
                    nodeIdentifier: nodeIdentification.nodeIdentifier,
                    nodeIdentifierProof: nodeIdentification.nodeIdentifierProof,
                    captchaResponse: captchaResponse
                };
                
                aliaser_doAliasVideo(data)
                .then(aliaserResponseData => {
                    if(aliaserResponseData.isError) {
                        logDebugMessageToConsole(aliaserResponseData.message, null, new Error().stack, true);
                        
                        res.send({isError: true, message: aliaserResponseData.message});
                    }
                    else {
                        res.send({isError: false, videoAliasUrl: aliaserResponseData.videoAliasUrl});
                    }
                })
                .catch(error => {
                    logDebugMessageToConsole(null, error, new Error().stack, true);
                    
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                });
            })
            .catch(error => {
                res.send({isError: true, message: 'an error occurred while attempting to index, please try again later'});
            });
        }
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
});

router.get('/:videoId/alias', (req, res) => {
    const videoId = req.params.videoId;
    
    if(isVideoIdValid(videoId)) {
        const nodeSettings = getNodeSettings();

        database.get('SELECT is_indexed FROM videos WHERE video_id = ?', [videoId], function(error, video) {
            if(error) {
                logDebugMessageToConsole(null, error, new Error().stack, true);
                
                res.send({isError: true, message: 'error communicating with the MoarTube node'});
            }
            else {
                if(video != null) {
                    const isIndexed = video.is_indexed;

                    if(isIndexed) {
                        var videoAliasUrl;

                        if(IS_DEVELOPER_MODE) {
                            videoAliasUrl = 'http://localhost:' + MOARTUBE_ALIASER_PORT + '/nodes/' + nodeId + '/videos/' + videoId;
                        }
                        else {
                            videoAliasUrl = 'https://moartu.be/nodes/' + nodeSettings.nodeId + '/videos/' + videoId;
                        }

                        res.send({isError: false, videoAliasUrl: videoAliasUrl});
                    }
                    else {
                        if(!nodeSettings.isNodePrivate) {
                            performNodeIdentification(false)
                            .then(() => {
                                const nodeIdentification = getNodeIdentification();
                                
                                aliaser_getVideoAlias(videoId, nodeIdentification.nodeIdentifier, nodeIdentification.nodeIdentifierProof)
                                .then(aliaserResponseData => {
                                    if(aliaserResponseData.isError) {
                                        logDebugMessageToConsole(aliaserResponseData.message, null, new Error().stack, true);
                                        
                                        res.send({isError: true, message: aliaserResponseData.message});
                                    }
                                    else {
                                        res.send({isError: false, videoAliasUrl: aliaserResponseData.videoAliasUrl});
                                    }
                                })
                                .catch(error => {
                                    logDebugMessageToConsole(null, error, new Error().stack, true);
                                    
                                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                                });
                            })
                            .catch(error => {
                                res.send({isError: true, message: 'an error occurred while retrieving the video alias, please try again later'});
                            });
                        }
                        else {
                            res.send({isError: true, message: 'MoarTube Aliaser unavailable; node is private'});
                        }
                    }
                }
                else {
                    res.send({isError: true, message: 'MoarTube Aliaser link unavailable'});
                }
            }
        });
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
});

router.get('/search', (req, res) => {
    const searchTerm = req.query.searchTerm;
    const sortTerm = req.query.sortTerm;
    const tagTerm = req.query.tagTerm;
    var tagLimit = req.query.tagLimit;
    const timestamp = req.query.timestamp;
    
    if(isSearchTermValid(searchTerm) && isSortTermValid(sortTerm) && isTagTermValid(tagTerm, true) && isTagLimitValid(tagLimit) && isTimestampValid(timestamp)) {
        tagLimit = Number(tagLimit);

        var query;
        var params;

        if(searchTerm.length === 0) {
            query = 'SELECT * FROM videos WHERE creation_timestamp < ?';
            params = [timestamp];
        }
        else {
            query = 'SELECT * FROM videos WHERE creation_timestamp < ? AND title LIKE ?';
            params = [timestamp, '%' + searchTerm + '%'];
        }
        
        database.all(query, params, function(error, rows) {
            if(error) {
                logDebugMessageToConsole(null, error, new Error().stack, true);
                
                res.send({isError: true, message: 'error communicating with the MoarTube node'});
            }
            else {
                if(sortTerm === 'latest') {
                    rows.sort(function compareByTimestampDescending(a, b) {
                        return b.creation_timestamp - a.creation_timestamp;
                    });
                }
                else if(sortTerm === 'popular') {
                    rows.sort(function compareByTimestampDescending(a, b) {
                        return b.views - a.views;
                    });
                }
                else if(sortTerm === 'oldest') {
                    rows.sort(function compareByTimestampDescending(a, b) {
                        return a.creation_timestamp - b.creation_timestamp;
                    });
                }

                var rowsToSend = [];
                
                if(tagTerm.length === 0) {
                    if(tagLimit === 0) {
                        rowsToSend = rows;
                    }
                    else {
                        rowsToSend = rows.slice(0, tagLimit);
                    }
                }
                else {
                    for(const row of rows) {
                        const tagsArray = row.tags.split(',');

                        if (tagsArray.includes(tagTerm) && !rowsToSend.includes(row)) {
                            rowsToSend.push(row);
                        }

                        if(tagLimit !== 0 && rowsToSend.length === tagLimit) {
                            break;
                        }
                    }
                }
                
                res.send({isError: false, searchResults: rowsToSend});
            }
        });
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
});



// Retrieve thumbnail for video
router.get('/:videoId/thumbnail', (req, res) => {
    const videoId = req.params.videoId;
    
    if(isVideoIdValid(videoId)) {
        const thumbnailFilePath = path.join(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images'), 'thumbnail.jpg');
        
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
});

// Upload thumbnail for video
router.post('/:videoId/thumbnail', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            
            if(isVideoIdValid(videoId)) {
                logDebugMessageToConsole('uploading thumbnail for video id: ' + videoId, null, null, true);

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
                            const filePath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images');
                            
                            fs.access(filePath, fs.F_OK, function(error) {
                                if(error) {
                                    cb(new Error('file upload error'));
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
                                var extension;
                                
                                if(mimeType === 'image/jpeg')
                                {
                                    extension = '.jpg';
                                }
                                
                                const fileName = 'thumbnail' + extension;
                                
                                cb(null, fileName);
                            }
                            else
                            {
                                cb(new Error('Invalid Media Detected'));
                            }
                        }
                    })
                }).fields([{ name: 'thumbnailFile', minCount: 1, maxCount: 1 }])
                (req, res, async function(error)
                {
                    if(error) {
                        logDebugMessageToConsole(null, error, new Error().stack, true);
                        
                        res.send({isError: true, message: error.message});
                    }
                    else {
                        logDebugMessageToConsole('uploaded thumbnail for video id <' + videoId + '>', null, null, true);
                        
                        res.send({isError: false});
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

// Retrieve preview for video
router.get('/:videoId/preview', (req, res) => {
    const videoId = req.params.videoId;
    
    if(isVideoIdValid(videoId)) {
        const previewFilePath = path.join(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images'), 'preview.jpg');
        
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
});

// Retrieve poster for video
router.get('/:videoId/poster', (req, res) => {
    const videoId = req.params.videoId;
    
    if(isVideoIdValid(videoId)) {
        const previewFilePath = path.join(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images'), 'poster.jpg');
        
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
});

// Upload preview for video
router.post('/:videoId/preview', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            
            if(isVideoIdValid(videoId)) {
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
                            const filePath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images');
                            
                            fs.access(filePath, fs.F_OK, function(error)
                            {
                                if(error)
                                {
                                    cb(new Error('file upload error'));
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
                                var extension;
                                
                                if(mimeType === 'image/jpeg')
                                {
                                    extension = '.jpg';
                                }
                                
                                const fileName = 'preview' + extension;
                                
                                cb(null, fileName);
                            }
                            else
                            {
                                cb(new Error('Invalid Media Detected'));
                            }
                        }
                    })
                }).fields([{ name: 'previewFile', minCount: 1, maxCount: 1 }])
                (req, res, async function(error)
                {
                    if(error) {
                        logDebugMessageToConsole(null, error, new Error().stack, true);
                        
                        res.send({isError: true, message: error.message});
                    }
                    else {
                        logDebugMessageToConsole('uploaded preview for video id <' + videoId + '>', null, null, true);

                        submitDatabaseWriteJob('UPDATE videos SET is_index_outdated = CASE WHEN is_indexed = 1 THEN 1 ELSE is_index_outdated END WHERE video_id = ?', [videoId], function(isError) {
                            if(isError) {
                                res.send({isError: true, message: 'error communicating with the MoarTube node'});
                            }
                            else {
                                res.send({isError: false});
                            }
                        });
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

// Upload poster for video
router.post('/:videoId/poster', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            
            if(isVideoIdValid(videoId)) {
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
                            const filePath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images');
                            
                            fs.access(filePath, fs.F_OK, function(error)
                            {
                                if(error)
                                {
                                    cb(new Error('file upload error'));
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
                                var extension;
                                
                                if(mimeType === 'image/jpeg')
                                {
                                    extension = '.jpg';
                                }
                                
                                const fileName = 'poster' + extension;
                                
                                cb(null, fileName);
                            }
                            else
                            {
                                cb(new Error('Invalid Media Detected'));
                            }
                        }
                    })
                }).fields([{ name: 'posterFile', minCount: 1, maxCount: 1 }])
                (req, res, async function(error)
                {
                    if(error) {
                        logDebugMessageToConsole(null, error, new Error().stack, true);
                        
                        res.send({isError: true, message: error.message});
                    }
                    else {
                        logDebugMessageToConsole('uploaded poster for video id <' + videoId + '>', null, null, true);
                        
                        res.send({isError: false});
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

router.post('/:videoId/lengths', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            const lengthSeconds = req.body.lengthSeconds;
            const lengthTimestamp = req.body.lengthTimestamp;
            
            if(isVideoIdValid(videoId)) {
                submitDatabaseWriteJob('UPDATE videos SET length_seconds = ?, length_timestamp = ?, is_index_outdated = CASE WHEN is_indexed = 1 THEN 1 ELSE is_index_outdated END WHERE video_id = ?', [lengthSeconds, lengthTimestamp, videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false});
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

router.get('/:videoId/data', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            
            if(isVideoIdValid(videoId)) {
                database.get('SELECT * FROM videos WHERE video_id = ?', videoId, function(error, videoData) {
                    if(error) {
                        logDebugMessageToConsole(null, error, new Error().stack, true);
                        
                        res.send({isError: true, message: 'error retrieving video data'});
                    }
                    else {
                        if(videoData != null) {
                            res.send({isError: false, videoData: videoData});
                        }
                        else {
                            res.send({isError: true, message: 'that video does not exist'});
                        }
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

router.post('/delete', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoIdsJson = req.body.videoIdsJson;
            const videoIds = JSON.parse(videoIdsJson);
            
            if(isVideoIdsValid(videoIds)) {
                submitDatabaseWriteJob('DELETE FROM videos WHERE (is_importing = 0 AND is_publishing = 0 AND is_streaming = 0 AND is_indexed = 0) AND video_id IN (' + videoIds.map(() => '?').join(',') + ')', videoIds, function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        database.all('SELECT * FROM videos WHERE (is_importing = 1 OR is_publishing = 1 OR is_streaming = 1 OR is_indexed = 1) AND video_id IN (' + videoIds.map(() => '?').join(',') + ')', videoIds, (error, videos) => {
                            if (error) {
                                logDebugMessageToConsole(null, error, new Error().stack, true);
                                
                                res.send({isError: true, message: error.message});
                            } else {
                                const deletedVideoIds = [];
                                const nonDeletedVideoIds = [];
                                
                                videos.forEach(function(video) {
                                    const videoId = video.video_id;
                                    
                                    nonDeletedVideoIds.push(videoId);
                                });
                                
                                videoIds.forEach(function(videoId) {
                                    if(!nonDeletedVideoIds.includes(videoId)) {
                                        const videoDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId);
                    
                                        deleteDirectoryRecursive(videoDirectoryPath);
                                        
                                        deletedVideoIds.push(videoId);
                                    }
                                });

                                submitDatabaseWriteJob('DELETE FROM comments WHERE video_id IN (' + deletedVideoIds.map(() => '?').join(',') + ')', deletedVideoIds, function(isError) {
                                    if(isError) {
                                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                                    }
                                    else {
                                        res.send({isError: false, deletedVideoIds: deletedVideoIds, nonDeletedVideoIds: nonDeletedVideoIds});
                                    }
                                });
                            }
                        });
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

router.post('/finalize', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoIdsJson = req.body.videoIdsJson;
            const videoIds = JSON.parse(videoIdsJson);
            
            if(isVideoIdsValid(videoIds)) {
                submitDatabaseWriteJob('UPDATE videos SET is_finalized = 1 WHERE (is_importing = 0 AND is_publishing = 0 AND is_streaming = 0) AND video_id IN (' + videoIds.map(() => '?').join(',') + ')', videoIds, function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        database.all('SELECT * FROM videos WHERE (is_importing = 1 OR is_publishing = 1 OR is_streaming = 1) AND video_id IN (' + videoIds.map(() => '?').join(',') + ')', videoIds, (error, videos) => {
                            if (error) {
                                logDebugMessageToConsole(null, error, new Error().stack, true);
                                
                                res.send({isError: true, message: error.message});
                            } else {
                                const finalizedVideoIds = [];
                                const nonFinalizedVideoIds = [];
                                
                                videos.forEach(function(video) {
                                    const videoId = video.video_id;
                                    
                                    nonFinalizedVideoIds.push(videoId);
                                });
                                
                                videoIds.forEach(function(videoId) {
                                    if(!nonFinalizedVideoIds.includes(videoId)) {
                                        finalizedVideoIds.push(videoId);
                                    }
                                });
                                
                                res.send({isError: false, finalizedVideoIds: finalizedVideoIds, nonFinalizedVideoIds: nonFinalizedVideoIds});
                            }
                        });
                    }
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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

router.get('/:videoId/discussion', (req, res) => {
    const videoId = req.params.videoId;
    const timestamp = req.query.timestamp;
    const type = req.query.type;
    const minimumCommentId = req.query.minimumCommentId;
    const maximumCommentId = req.query.maximumCommentId;
    
    if(isVideoIdValid(videoId) && isTimestampValid(timestamp) && isDiscussionTypeValid(type) && isCommentIdValid(minimumCommentId) && isCommentIdValid(maximumCommentId)) {
        if(type === 'before') {
            database.all('SELECT * FROM comments WHERE video_id = ? AND timestamp > ? ORDER BY timestamp ASC', [videoId, timestamp], function(error, rows) {
                if (error) {
                    logDebugMessageToConsole(null, error, new Error().stack, true);
                    
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    res.send({isError: false, comments: rows});
                }
            });
        }
        else if(type === 'after') {
            if(minimumCommentId == 0 && maximumCommentId == 0) {
                database.all('SELECT * FROM comments WHERE video_id = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT 20', [videoId, timestamp], function(error, rows) {
                    if (error) {
                        logDebugMessageToConsole(null, error, new Error().stack, true);
                        
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false, comments: rows});
                    }
                });
            }
            else if(minimumCommentId >= 0 && maximumCommentId > 0) {
                database.all('SELECT * FROM comments WHERE video_id = ? AND timestamp < ? AND id >= ? AND id < ? ORDER BY timestamp DESC', [videoId, timestamp, minimumCommentId, maximumCommentId], function(error, rows) {
                    if (error) {
                        logDebugMessageToConsole(null, error, new Error().stack, true);
                        
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false, comments: rows});
                    }
                });
            }
            else if(minimumCommentId > 0 && maximumCommentId == 0) {
                database.all('SELECT * FROM comments WHERE video_id = ? AND timestamp < ? AND id >= ? ORDER BY timestamp DESC', [videoId, timestamp, minimumCommentId], function(error, rows) {
                    if (error) {
                        logDebugMessageToConsole(null, error, new Error().stack, true);
                        
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false, comments: rows});
                    }
                });
            }
        }
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
});

router.get('/:videoId/discussion/:commentId', (req, res) => {
    const videoId = req.params.videoId;
    const commentId = req.params.commentId;
    
    if(isVideoIdValid(videoId) && isCommentIdValid(commentId)) {
        database.get('SELECT * FROM comments WHERE video_id = ? AND id = ?', [videoId, commentId], function(error, comment) {
            if (error) {
                logDebugMessageToConsole(null, error, new Error().stack, true);
                
                res.send({isError: true, message: 'error communicating with the MoarTube node'});
            }
            else {
                if(comment != null) {
                    res.send({isError: false, comment: comment});
                }
                else {
                    res.send({isError: true, message: 'that comment does not exist'});
                }
            }
        });
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
});

router.post('/:videoId/discussion/comment', (req, res) => {
    const videoId = req.params.videoId;
    const commentPlainText = req.body.commentPlainText;
    const captchaResponse = req.body.captchaResponse;
    const captchaType = req.body.captchaType;
    const timestamp = req.body.timestamp;
    
    if(isVideoIdValid(videoId) && isVideoCommentValid(commentPlainText) && isCaptchaTypeValid(captchaType) && isTimestampValid(timestamp)) {
        var captchaAnswer = '';
        
        if(captchaType === 'static') {
            captchaAnswer = req.session.staticDiscussionCaptcha;
        }
        else if(captchaType === 'dynamic') {
            captchaAnswer = req.session.dynamicDiscussionCaptcha;
        }
        
        if(isCaptchaResponseValid(captchaResponse, captchaAnswer)) {
            const commentPlainTextSanitized = sanitizeHtml(commentPlainText, {allowedTags: [], allowedAttributes: {}});
            const commentTimestamp = Date.now();
            
            submitDatabaseWriteJob('INSERT INTO comments(video_id, comment_plain_text_sanitized, timestamp) VALUES (?, ?, ?)', [videoId, commentPlainTextSanitized, commentTimestamp], function(isError) {
                if(isError) {
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    submitDatabaseWriteJob('UPDATE videos SET comments = comments + 1 WHERE video_id = ?', [videoId], function(isError) {
                        if(isError) {
                            res.send({isError: true, message: 'error communicating with the MoarTube node'});
                        }
                        else {
                            database.all('SELECT * FROM comments WHERE video_id = ? AND timestamp > ? ORDER BY timestamp ASC', [videoId, timestamp], function(error, comments) {
                                if (error) {
                                    logDebugMessageToConsole(null, error, new Error().stack, true);
                                    
                                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                                }
                                else {
                                    var commentId = 0;
                                    
                                    for (let i = comments.length - 1; i >= 0; i--) {
                                        if(commentTimestamp === comments[i].timestamp) {
                                            commentId = comments[i].id;
                                            break;
                                        }
                                    }
                                    
                                    res.send({isError: false, commentId: commentId, comments: comments});
                                }
                            });
                        }
                    });
                }
            });
        }
        else {
            if(captchaType === 'static') {
                delete req.session.staticDiscussionCaptcha;
            }
            else if(captchaType === 'dynamic') {
                delete req.session.dynamicDiscussionCaptcha;
            }
            
            res.send({isError: true, message: 'the captcha was not correct'});
        }
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
});

router.delete('/:videoId/comments/:commentId/delete', (req, res) => {
    const videoId = req.params.videoId;
    const commentId = req.params.commentId;
    const timestamp = req.query.timestamp;
    
    if(isVideoIdValid(videoId) && isCommentIdValid(commentId) && isTimestampValid(timestamp)) {
        submitDatabaseWriteJob('DELETE FROM comments WHERE id = ? AND video_id = ? AND timestamp = ?', [commentId, videoId, timestamp], function(isError) {
            if(isError) {
                res.send({isError: true, message: 'error communicating with the MoarTube node'});
            }
            else {
                submitDatabaseWriteJob('UPDATE videos SET comments = comments - 1 WHERE video_id = ?', [videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false});
                    }
                });
            }
        });
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
});

router.post('/:videoId/like', (req, res) => {
    const videoId = req.params.videoId;
    const isLiking = req.body.isLiking;
    const isUnDisliking = req.body.isUnDisliking;
    const captchaResponse = req.body.captchaResponse;
    
    if(isVideoIdValid(videoId) && isBooleanValid(isLiking) && isBooleanValid(isUnDisliking)) {
        const captchaAnswer = req.session.likeDislikeCaptcha;
        
        if(isCaptchaResponseValid(captchaResponse, captchaAnswer)) {
            if(isLiking) {
                submitDatabaseWriteJob('UPDATE videos SET likes = likes + 1 WHERE video_id = ?', [videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        if(isUnDisliking) {
                            submitDatabaseWriteJob('UPDATE videos SET dislikes = dislikes - 1 WHERE video_id = ?', [videoId], function(isError) {
                                if(isError) {
                                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                                }
                                else {
                                    res.send({isError: false});
                                }
                            });
                        }
                        else {
                            res.send({isError: false});
                        }
                    }
                });
            }
            else {
                submitDatabaseWriteJob('UPDATE videos SET likes = likes - 1 WHERE video_id = ?', [videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false});
                    }
                });
            }
        }
        else {
            delete req.session.likeDislikeCaptcha;
            
            res.send({isError: true, message: 'the captcha was not correct'});
        }
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
});

router.post('/:videoId/dislike', (req, res) => {
    const videoId = req.params.videoId;
    const isDisliking = req.body.isDisliking;
    const isUnliking = req.body.isUnliking;
    const captchaResponse = req.body.captchaResponse;
    
    if(isVideoIdValid(videoId) && isBooleanValid(isDisliking) && isBooleanValid(isUnliking)) {
        const captchaAnswer = req.session.likeDislikeCaptcha;
        
        if(isCaptchaResponseValid(captchaResponse, captchaAnswer)) {
            if(isDisliking) {
                submitDatabaseWriteJob('UPDATE videos SET dislikes = dislikes + 1 WHERE video_id = ?', [videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        if(isUnliking) {
                            submitDatabaseWriteJob('UPDATE videos SET likes = likes - 1 WHERE video_id = ?', [videoId], function(isError) {
                                if(isError) {
                                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                                }
                                else {
                                    res.send({isError: false});
                                }
                            });
                        }
                    }
                });
            }
            else {
                submitDatabaseWriteJob('UPDATE videos SET dislikes = dislikes - 1 WHERE video_id = ?', [videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false});
                    }
                });
            }
        }
        else {
            delete req.session.likeDislikeCaptcha;
            
            res.send({isError: true, message: 'the captcha was not correct'});
        }
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
});

router.get('/recommendations', (req, res) => {
    const tagTerm = req.query.tagTerm;
    const timestamp = req.query.timestamp;
    
    if(isTagTermValid(tagTerm, true) && isTimestampValid(timestamp)) {
        if(tagTerm.length === 0) {
            database.all('SELECT * FROM videos WHERE (is_published = 1 OR is_live = 1) AND creation_timestamp < ? ORDER BY creation_timestamp DESC LIMIT 20', [timestamp], function(error, recommendations) {
                if (error) {
                    logDebugMessageToConsole(null, error, new Error().stack, true);
                    
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    res.send({isError: false, recommendations: recommendations});
                }
            });
        }
        else {
            database.all('SELECT * FROM videos WHERE (is_published = 1 OR is_live = 1) AND tags LIKE ? AND creation_timestamp < ? ORDER BY creation_timestamp DESC LIMIT 20', ['%' + tagTerm + '%', timestamp], (error, rows) => {
                if (error) {
                    logDebugMessageToConsole(null, error, new Error().stack, true);
                    
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    const recommendations = [];
                    
                    rows.forEach(function(row) {
                        const tagsArray = row.tags.split(',');
                        if (tagsArray.includes(tagTerm)) {
                            recommendations.push(row);
                        }
                    });
                    
                    res.send({isError: false, recommendations: recommendations});
                }
            });
        }
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
});

// Get all tags for all videos
router.get('/tags', (req, res) => {
    const tags = [];
    
    database.all('SELECT * FROM videos WHERE (is_published = 1 OR is_live = 1) ORDER BY creation_timestamp DESC', function(error, rows) {
        if(error) {
            logDebugMessageToConsole(null, error, new Error().stack, true);
            
            res.send({isError: true, message: 'error communicating with the MoarTube node'});
        }
        else {
            rows.forEach(function(row) {
                const tagsArray = row.tags.split(',');
                
                tagsArray.forEach(function(tag) {
                    if (!tags.includes(tag)) {
                        tags.push(tag);
                    }
                });
            });
            
            res.send({isError: false, tags: tags});
        }
    });
});

// Get all tags for all videos
router.get('/tags/all', (req, res) => {
    const tags = [];
    
    database.all('SELECT * FROM videos ORDER BY creation_timestamp DESC', function(error, rows) {
        if(error) {
            logDebugMessageToConsole(null, error, new Error().stack, true);
            
            res.send({isError: true, message: 'error communicating with the MoarTube node'});
        }
        else {
            rows.forEach(function(row) {
                const tagsArray = row.tags.split(',');
                
                tagsArray.forEach(function(tag) {
                    if (!tags.includes(tag)) {
                        tags.push(tag);
                    }
                });
            });
            
            res.send({isError: false, tags: tags});
        }
    });
});

var viewCounter = 0;
var viewCounterIncrementTimer;
router.get('/:videoId/watch', async (req, res) => {
    const videoId = req.params.videoId;
    
    if(isVideoIdValid(videoId)) {
        viewCounter++;
        
        clearTimeout(viewCounterIncrementTimer);
        
        viewCounterIncrementTimer = setTimeout(function() {
            const viewCounterTemp = viewCounter;
            
            viewCounter = 0;
            
            submitDatabaseWriteJob('UPDATE videos SET views = views + ?, is_index_outdated = CASE WHEN is_indexed = 1 THEN 1 ELSE is_index_outdated END WHERE video_id = ?', [viewCounterTemp, videoId], function(isError) {
                if(isError) {
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    // do nothing
                }
            });
        }, 500);
        
        database.get('SELECT * FROM videos WHERE video_id = ?', [videoId], function(error, video) {
            if(error) {
                res.send({isError: true, message: 'database communication error'});
            }
            else {
                if(video != null) {
                    const nodeSettings = getNodeSettings();
                    
                    const nodeName = nodeSettings.nodeName;
                    
                    const adaptiveVideosDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive');
                    const progressiveVideosDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive');
                    
                    const adaptiveFormats = [{format: 'm3u8', type: 'application/vnd.apple.mpegurl'}];
                    const progressiveFormats = [{format: 'mp4', type: 'video/mp4'}, {format: 'webm', type: 'video/webm'}, {format: 'ogv', type: 'video/ogg'}];
                    const resolutions = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p'];
                    
                    const adaptiveSources = [];
                    const progressiveSources = [];
                    const sourcesFormatsAndResolutions = {m3u8: [], mp4: [], webm: [], ogv: []};
                    
                    var isHlsAvailable = false;
                    var isMp4Available = false;
                    var isWebmAvailable = false;
                    var isOgvAvailable = false;
                    
                    adaptiveFormats.forEach(function(adaptiveFormat) {
                        const format = adaptiveFormat.format;
                        const type = adaptiveFormat.type;

                        const adaptiveVideoFormatPath = path.join(adaptiveVideosDirectoryPath, format);
                        const adaptiveVideoMasterManifestPath = path.join(adaptiveVideoFormatPath, 'manifest-master.' + format);
                        
                        if(fs.existsSync(adaptiveVideoMasterManifestPath)) {
                            if(format === 'm3u8') {
                                isHlsAvailable = true;
                            }
                            
                            const src = '/videos/' + videoId + '/adaptive/' + format + '/manifests/manifest-master.' + format;
                            
                            const source = {src: src, type: type};
                            
                            adaptiveSources.push(source);
                        }

                        resolutions.forEach(function(resolution) {
                            const adaptiveVideoFilePath = path.join(adaptiveVideosDirectoryPath, format + '/manifest-' + resolution + '.' + format);
                            
                            if(fs.existsSync(adaptiveVideoFilePath)) {
                                sourcesFormatsAndResolutions[format].push(resolution);

                                const src = '/videos/' + videoId + '/adaptive/' + format + '/manifests/manifest-' + resolution + '.' + format;
                                
                                const source = {src: src, type: type};
                                
                                adaptiveSources.push(source);
                            }
                        });
                    });
                    
                    progressiveFormats.forEach(function(progressiveFormat) {
                        const format = progressiveFormat.format;
                        const type = progressiveFormat.type;
                        
                        resolutions.forEach(function(resolution) {
                            const progressiveVideoFilePath = path.join(progressiveVideosDirectoryPath, format + '/' + resolution + '/' + resolution + '.' + format);
                            
                            if(fs.existsSync(progressiveVideoFilePath)) {
                                if(format === 'mp4') {
                                    isMp4Available = true;
                                }
                                else if(format === 'webm') {
                                    isWebmAvailable = true;
                                }
                                else if(format === 'ogv') {
                                    isOgvAvailable = true;
                                }

                                sourcesFormatsAndResolutions[format].push(resolution);
                                
                                const src = '/videos/' + videoId + '/progressive/' + format + '/' + resolution;
                                
                                const source = {src: src, type: type};
                                
                                progressiveSources.push(source);
                            }
                        });
                    });
                    
                    const videoData = {
                        nodeName: nodeName,
                        title: video.title,
                        description: video.description,
                        views: video.views,
                        likes: video.likes,
                        dislikes: video.dislikes,
                        isPublished: video.is_published,
                        isPublishing: video.is_publishing,
                        isLive: video.is_live,
                        isStreaming: video.is_streaming,
                        isStreamed: video.is_streamed,
                        comments: video.comments,
                        creationTimestamp: video.creation_timestamp,
                        isHlsAvailable: isHlsAvailable,
                        isMp4Available: isMp4Available,
                        isWebmAvailable: isWebmAvailable,
                        isOgvAvailable: isOgvAvailable,
                        adaptiveSources: adaptiveSources,
                        progressiveSources: progressiveSources,
                        sourcesFormatsAndResolutions: sourcesFormatsAndResolutions
                    };
                    
                    res.send({isError: false, videoData: videoData});
                }
                else {
                    res.send({isError: true, message: 'that video does not exist'});
                }
            }
        });
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
});

router.post('/:videoId/report', async (req, res) => {
    const videoId = req.params.videoId;
    var email = req.body.email;
    const reportType = req.body.reportType;
    var message = req.body.message;
    const captchaResponse = req.body.captchaResponse;
    
    if(isVideoIdValid(videoId) && isReportEmailValid(email) && isReportTypeValid(reportType) && isReportMessageValid(message)) {
        email = sanitizeHtml(email, {allowedTags: [], allowedAttributes: {}});
        message = sanitizeHtml(message, {allowedTags: [], allowedAttributes: {}});
        
        const captchaAnswer = req.session.videoReportCaptcha;
        
        if(isCaptchaResponseValid(captchaResponse, captchaAnswer)) {
            database.get('SELECT * FROM videos WHERE video_id = ?', [videoId], function(error, result) {
                if(error) {
                    logDebugMessageToConsole(null, error, new Error().stack, true);
                    
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    if(result != null) {
                        const creationTimestamp = result.creation_timestamp;
                        
                        submitDatabaseWriteJob('INSERT INTO videoReports(timestamp, video_timestamp, video_id, email, type, message) VALUES (?, ?, ?, ?, ?, ?)', [Date.now(), creationTimestamp, videoId, email, reportType, message], function(isError) {
                            if(isError) {
                                res.send({isError: true, message: 'error communicating with the MoarTube node'});
                            }
                            else {
                                res.send({isError: false});
                            }
                        });
                    }
                    else {
                        res.send({isError: true, message: 'that video does not exist'});
                    }
                }
            });
        }
        else {
            delete req.session.videoReportCaptcha;
            
            res.send({isError: true, message: 'the captcha was not correct'});
        }
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
});

router.get('/comments/all', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            database.all('SELECT timestamp,video_id,id,comment_plain_text_sanitized FROM comments ORDER BY timestamp DESC', function(error, comments) {
                if(error) {
                    logDebugMessageToConsole(null, error, new Error().stack, true);
                    
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    res.send({isError: false, comments: comments});
                }
            });
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

var manifestBandwidthCounter = 0;
var manifestBandwidthIncrementTimer;
router.get('/:videoId/adaptive/:format/manifests/:manifestName', (req, res) => {
    const videoId = req.params.videoId;
    const format = req.params.format;
    const manifestName = req.params.manifestName;
    
    if(isVideoIdValid(videoId) && isAdaptiveFormatValid(format) && isManifestNameValid(manifestName)) {
        const manifestPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/' + format + '/' + manifestName);
        
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
});

var segmentBandwidthCounter = 0;
var segmentBandwidthIncrementTimer;
router.get('/:videoId/adaptive/:format/:resolution/segments/:segmentName', (req, res) => {
    const videoId = req.params.videoId;
    const format = req.params.format;
    const resolution = req.params.resolution;
    const segmentName = req.params.segmentName;
    
    if(isVideoIdValid(videoId) && isAdaptiveFormatValid(format) && isResolutionValid(resolution) && isSegmentNameValid(segmentName)) {
        const segmentPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/' + format + '/' + resolution + '/' + segmentName);
        
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
});

var progressiveBandwidthCounter = 0;
var progressiveBandwidthIncrementTimer;
router.get('/:videoId/progressive/:format/:resolution', (req, res) => {
    const videoId = req.params.videoId;
    const format = req.params.format;
    const resolution = req.params.resolution;
    
    if(isVideoIdValid(videoId) && isProgressiveFormatValid(format) && isResolutionValid(resolution)) {
        const filePath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/' + format + '/' + resolution + '/' + resolution + '.' + format);
        
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
});

router.get('/:videoId/progressive/:format/:resolution/download', (req, res) => {
    const videoId = req.params.videoId;
    const format = req.params.format;
    const resolution = req.params.resolution;
    
    if(isVideoIdValid(videoId) && isProgressiveFormatValid(format) && isResolutionValid(resolution)) {
        const filePath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/' + format + '/' + resolution + '/' + resolution + '.' + format);
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
});

module.exports = router;
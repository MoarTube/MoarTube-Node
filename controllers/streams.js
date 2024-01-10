const fs = require('fs');
const path = require('path');

const { logDebugMessageToConsole } = require('../utils/logger');
const { getVideosDirectoryPath } = require('../utils/paths');
const { getAuthenticationStatus, generateVideoId, sanitizeTagsSpaces, websocketNodeBroadcast, deleteDirectoryRecursive } = require('../utils/helpers');
const { 
    isTitleValid, isDescriptionValid, isTagsValid, isPortValid, isVideoIdValid, isAdaptiveFormatValid, isResolutionValid, isSegmentNameValid, isBooleanValid, 
    isNetworkAddressValid, isChatHistoryLimitValid 
} = require('../utils/validators');
const { performDatabaseReadJob_ALL, performDatabaseReadJob_GET, submitDatabaseWriteJob } = require('../utils/database');

const { updateHlsVideoMasterManifestFile } = require('../utils/filesystem');
const { 
    cloudflare_purgeWatchPages, cloudflare_purgeNodePage
} = require('../utils/cloudflare-communications');

function start_POST(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const title = req.body.title;
            const description = req.body.description;
            const tags = req.body.tags;
            const rtmpPort = req.body.rtmpPort;
            const uuid = req.body.uuid;
            var isRecordingStreamRemotely = req.body.isRecordingStreamRemotely;
            var isRecordingStreamLocally = req.body.isRecordingStreamLocally;
            const networkAddress = req.body.networkAddress;

            if(!isTitleValid(title)) {
                res.send({isError: true, message: 'title is not valid'});
            }
            else if(!isDescriptionValid(description)) {
                res.send({isError: true, message: 'description is not valid'});
            }
            else if(!isTagsValid(tags)) {
                res.send({isError: true, message: 'tags are not valid'});
            }
            else if(!isPortValid(rtmpPort)) {
                res.send({isError: true, message: 'rtmp port not valid'});
            }
            else if(uuid !== 'moartube') {
                res.send({isError: true, message: 'uuid not valid'});
            }
            else if(!isBooleanValid(isRecordingStreamRemotely)) {
                res.send({isError: true, message: 'isRecordingStreamRemotely not valid'});
            }
            else if(!isBooleanValid(isRecordingStreamLocally)) {
                res.send({isError: true, message: 'isRecordingStreamLocally not valid'});
            }
            else if(!isNetworkAddressValid(networkAddress)) {
                res.send({isError: true, message: 'networkAddress not valid'});
            }
            else {
                const videoId = await generateVideoId();
                const creationTimestamp = Date.now();
                
                isRecordingStreamRemotely = isRecordingStreamRemotely ? 1 : 0;
                isRecordingStreamLocally = isRecordingStreamLocally ? 1 : 0;
                
                const meta = JSON.stringify({chatSettings: {isChatHistoryEnabled: true, chatHistoryLimit: 0}, rtmpPort: rtmpPort, uuid: uuid, networkAddress: networkAddress});
                
                const tagsSanitized = sanitizeTagsSpaces(tags);
                
                fs.mkdirSync(path.join(getVideosDirectoryPath(), videoId + '/images'), { recursive: true });
                fs.mkdirSync(path.join(getVideosDirectoryPath(), videoId + '/adaptive'), { recursive: true });
                fs.mkdirSync(path.join(getVideosDirectoryPath(), videoId + '/progressive'), { recursive: true });
                
                const query = 'INSERT INTO videos(video_id, source_file_extension, title, description, tags, length_seconds, length_timestamp, views, comments, likes, dislikes, bandwidth, is_importing, is_imported, is_publishing, is_published, is_streaming, is_streamed, is_stream_recorded_remotely, is_stream_recorded_locally, is_live, is_indexed, is_index_outdated, is_error, is_finalized, meta, creation_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                const parameters = [videoId, '', title, description, tags, 0, '', 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, isRecordingStreamRemotely, isRecordingStreamLocally, 1, 0, 0, 0, 0, meta, creationTimestamp];
                
                submitDatabaseWriteJob(query, parameters, function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        try {
                            performDatabaseReadJob_ALL('SELECT video_id, tags FROM videos', [])
                            .then(async videos => {
                                const videoIds = videos.map(video => video.video_id);
                                const tags = Array.from(new Set(videos.map(video => video.tags.split(',')).flat()));

                                cloudflare_purgeWatchPages(videoIds);
                                cloudflare_purgeNodePage(tags);
                            })
                            .catch(error => {
                                // do nothing
                            });
                        }
                        catch(error) {
                            logDebugMessageToConsole(null, error, new Error().stack, true);
                        }

                        websocketNodeBroadcast({eventName: 'echo', data: {eventName: 'video_data', payload: { 
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
                                isImporting: 0, 
                                isImported: 0,
                                isPublishing: 0,
                                isPublished: 0,
                                isLive: 1,
                                isStreaming: 1,
                                isStreamed: 0,
                                isStreamRecordedRemotely: isRecordingStreamRemotely,
                                isStreamRecordedLocally: isRecordingStreamLocally,
                                isIndexed: 0,
                                isIndexOutdated: 0,
                                isError: 0,
                                isFinalized: 0,
                                meta: meta,
                                creationTimestamp: creationTimestamp
                            }
                        }});
                        
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
}

function videoIdStop_POST(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            
            if(isVideoIdValid(videoId)) {
                submitDatabaseWriteJob('UPDATE videos SET is_streaming = 0, is_streamed = 1, is_index_outdated = CASE WHEN is_indexed = 1 THEN 1 ELSE is_index_outdated END WHERE video_id = ?', [videoId], async function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        try {
                            await updateHlsVideoMasterManifestFile(videoId);
                        }
                        catch(error) {
                            logDebugMessageToConsole(null, error, new Error().stack, true);
                        }

                        try {
                            performDatabaseReadJob_ALL('SELECT video_id, tags FROM videos', [])
                            .then(async videos => {
                                const videoIds = videos.map(video => video.video_id);
                                const tags = Array.from(new Set(videos.map(video => video.tags.split(',')).flat()));
                                
                                cloudflare_purgeWatchPages(videoIds);
                                cloudflare_purgeNodePage(tags);
                            })
                            .catch(error => {
                                // do nothing
                            });
                        }
                        catch(error) {
                            logDebugMessageToConsole(null, error, new Error().stack, true);
                        }

                        performDatabaseReadJob_GET('SELECT is_stream_recorded_remotely FROM videos WHERE video_id = ?', [videoId])
                        .then(video => {
                            if(video != null) {
                                if(video.is_stream_recorded_remotely) {
                                    submitDatabaseWriteJob('UPDATE videos SET is_published = 1 WHERE video_id = ?', [videoId], function(isError) {
                                        if(isError) {
                                            
                                        }
                                        else {
                                            
                                        }
                                    });
                                }
                                else {
                                    const m3u8DirectoryPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/m3u8');
                                    
                                    deleteDirectoryRecursive(m3u8DirectoryPath);
                                }
                            }

                            submitDatabaseWriteJob('DELETE FROM liveChatMessages WHERE video_id = ?', [videoId], function(isError) {
                                if(isError) {
                                    
                                }
                                else {
                                    
                                }
                            });
                            
                            res.send({isError: false});
                        })
                        .catch(error => {
                            res.send({isError: true, message: 'error communicating with the MoarTube node'});
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
}

function videoIdAdaptiveFormatResolutionSegmentsNextEcpectedSegmentIndex_GET(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            const format = req.params.format;
            const resolution = req.params.resolution;
            
            if(isVideoIdValid(videoId) && isAdaptiveFormatValid(format) && isResolutionValid(resolution)) {
                var nextExpectedSegmentIndex = -1;
                
                const segmentsDirectoryPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/' + format + '/' + resolution);
                
                if (fs.existsSync(segmentsDirectoryPath) && fs.statSync(segmentsDirectoryPath).isDirectory()) {
                    fs.readdirSync(segmentsDirectoryPath).forEach(segmentFileName => {
                        const segmentFileNameArray = segmentFileName.split('-');
                        const nextExpectedSegmentIndexTemp = Number(segmentFileNameArray[2].split('.')[0]);

                        if(nextExpectedSegmentIndexTemp > nextExpectedSegmentIndex) {
                            nextExpectedSegmentIndex = nextExpectedSegmentIndexTemp;
                        }
                    });
                }
                
                nextExpectedSegmentIndex++;
                
                res.send({isError: false, nextExpectedSegmentIndex: nextExpectedSegmentIndex});
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
}

function videoIdAdaptiveFormatResolutionSegmentsRemove_POST(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            const format = req.params.format;
            const resolution = req.params.resolution;
            const segmentName = req.body.segmentName;
            
            if(isVideoIdValid(videoId) && isAdaptiveFormatValid(format) && isResolutionValid(resolution) && isSegmentNameValid(segmentName)) {
                const segmentPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/' + format + '/' + resolution + '/' + segmentName);
                
                fs.unlinkSync(segmentPath);
                
                res.send({isError: false});
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
}

function videoIdBandwidth_GET(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.params.videoId;
            
            if(isVideoIdValid(videoId)) {
                performDatabaseReadJob_GET('SELECT bandwidth FROM videos WHERE video_id = ?', [videoId])
                .then(video => {
                    if(video != null) {
                        const bandwidth = video.bandwidth;
                        
                        res.send({isError: false, bandwidth: bandwidth});
                    }
                    else {
                        res.send({isError: true, message: 'that video does not exist'});
                    }
                })
                .catch(error => {
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
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
}

function videoIdChatSettings_POST(req, res) {
    const videoId = req.params.videoId;
    const isChatHistoryEnabled = req.body.isChatHistoryEnabled;
    const chatHistoryLimit = req.body.chatHistoryLimit;
    
    if(isVideoIdValid(videoId) && isBooleanValid(isChatHistoryEnabled) && isChatHistoryLimitValid(chatHistoryLimit)) {
        performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId])
        .then(video => {
            if(video != null) {
                const meta = JSON.parse(video.meta);
                
                meta.chatSettings.isChatHistoryEnabled = isChatHistoryEnabled;
                meta.chatSettings.chatHistoryLimit = chatHistoryLimit;
                
                submitDatabaseWriteJob('UPDATE videos SET meta = ? WHERE video_id = ?', [JSON.stringify(meta), videoId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        if(!isChatHistoryEnabled) {
                            submitDatabaseWriteJob('DELETE FROM liveChatMessages WHERE video_id = ?', [videoId], function(isError) {
                                if(isError) {
                                    
                                }
                                else {
                                    
                                }
                            });
                        }
                        else if(chatHistoryLimit !== 0) {
                            submitDatabaseWriteJob('DELETE FROM liveChatMessages WHERE chat_message_id NOT IN (SELECT chat_message_id FROM liveChatMessages where video_id = ? ORDER BY chat_message_id DESC LIMIT ?)', [videoId, chatHistoryLimit], function(isError) {
                                if(isError) {
                                    
                                }
                                else {
                                    
                                }
                            });
                        }
                        
                        res.send({isError: false});
                    }
                });
            }
            else {
                res.send({isError: true, message: 'that video does not exist'});
            }
        })
        .catch(error => {
            res.send({isError: true, message: 'error retrieving video data'});
        });
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
}

function videoidChatHistory_GET(req, res) {
    const videoId = req.params.videoId;
    
    if(isVideoIdValid(videoId)) {
        performDatabaseReadJob_ALL('SELECT * FROM liveChatMessages WHERE video_id = ?', [videoId])
        .then(chatHistory => {
            res.send({isError: false, chatHistory: chatHistory});
        })
        .catch(error => {
            res.send({isError: true, message: 'error retrieving chat history'});
        });
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
}

module.exports = {
    start_POST,
    videoIdStop_POST,
    videoIdAdaptiveFormatResolutionSegmentsNextEcpectedSegmentIndex_GET,
    videoIdAdaptiveFormatResolutionSegmentsRemove_POST,
    videoIdBandwidth_GET,
    videoIdChatSettings_POST,
    videoidChatHistory_GET
}
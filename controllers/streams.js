const fs = require('fs');
const path = require('path');

const { logDebugMessageToConsole } = require('../utils/logger');
const { getVideosDirectoryPath, getPublicDirectoryPath } = require('../utils/paths');
const { getAuthenticationStatus, generateVideoId, sanitizeTagsSpaces, websocketNodeBroadcast, deleteDirectoryRecursive } = require('../utils/helpers');
const { 
    isTitleValid, isDescriptionValid, isTagsValid, isPortValid, isVideoIdValid, isAdaptiveFormatValid, isResolutionValid, isSegmentNameValid, isBooleanValid, 
    isNetworkAddressValid, isChatHistoryLimitValid 
} = require('../utils/validators');
const { performDatabaseReadJob_ALL, performDatabaseReadJob_GET, submitDatabaseWriteJob } = require('../utils/database');

const { endStreamedHlsManifestFiles, updateHlsVideoMasterManifestFile } = require('../utils/filesystem');
const { 
    cloudflare_purgeWatchPages, cloudflare_purgeNodePage
} = require('../utils/cloudflare-communications');

function start_POST(title, description, tags, rtmpPort, uuid, isRecordingStreamRemotely, isRecordingStreamLocally, networkAddress, resolution, videoId) {
    return new Promise(async function(resolve, reject) {
        if(!isTitleValid(title)) {
            resolve({isError: true, message: 'title is not valid'});
        }
        else if(!isDescriptionValid(description)) {
            resolve({isError: true, message: 'description is not valid'});
        }
        else if(!isTagsValid(tags)) {
            resolve({isError: true, message: 'tags are not valid'});
        }
        else if(!isPortValid(rtmpPort)) {
            resolve({isError: true, message: 'rtmp port not valid'});
        }
        else if(uuid !== 'moartube') {
            resolve({isError: true, message: 'uuid not valid'});
        }
        else if(!isBooleanValid(isRecordingStreamRemotely)) {
            resolve({isError: true, message: 'isRecordingStreamRemotely not valid'});
        }
        else if(!isBooleanValid(isRecordingStreamLocally)) {
            resolve({isError: true, message: 'isRecordingStreamLocally not valid'});
        }
        else if(!isNetworkAddressValid(networkAddress)) {
            resolve({isError: true, message: 'networkAddress not valid'});
        }
        else if(!isResolutionValid(resolution)) {
            resolve({isError: true, message: 'resolution not valid'});
        }
        else if(!isVideoIdValid(videoId, true)) {
            resolve({isError: true, message: 'videoId not valid'});
        }
        else {
            let isResumingStream = true;

            if(videoId === '') {
                isResumingStream = false;

                videoId = await generateVideoId();
            }

            if(isResumingStream) {
                await deleteDirectoryRecursive(path.join(getVideosDirectoryPath(), videoId));
            }

            isRecordingStreamRemotely = isRecordingStreamRemotely ? 1 : 0;
            isRecordingStreamLocally = isRecordingStreamLocally ? 1 : 0;

            const tagsSanitized = sanitizeTagsSpaces(tags);

            const publicImagesDirectory = path.join(getPublicDirectoryPath(), '/images');
            const publicThumbnailImageFilePath = path.join(publicImagesDirectory, 'thumbnail.jpg');
            const publicPreviewImageFilePath = path.join(publicImagesDirectory, 'preview.jpg');
            const publicPosterImageFilePath = path.join(publicImagesDirectory, 'poster.jpg');

            const videoImagesDirectory = path.join(getVideosDirectoryPath(), videoId + '/images');
            const videoThumbnailImageFilePath = path.join(videoImagesDirectory, 'thumbnail.jpg');
            const videoPreviewImageFilePath = path.join(videoImagesDirectory, 'preview.jpg');
            const videoPosterImageFilePath = path.join(videoImagesDirectory, 'poster.jpg');

            fs.mkdirSync(videoImagesDirectory, { recursive: true });
            fs.mkdirSync(path.join(getVideosDirectoryPath(), videoId + '/adaptive'), { recursive: true });
            fs.mkdirSync(path.join(getVideosDirectoryPath(), videoId + '/progressive'), { recursive: true });

            fs.copyFileSync(publicThumbnailImageFilePath, videoThumbnailImageFilePath);
            fs.copyFileSync(publicPreviewImageFilePath, videoPreviewImageFilePath);
            fs.copyFileSync(publicPosterImageFilePath, videoPosterImageFilePath);

            let query;
            let parameters;

            if (isResumingStream) {
                performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId])
                .then(video => {
                    if(video != null) {
                        let meta = JSON.parse(video.meta);

                        meta.rtmpPort = rtmpPort;
                        meta.networkAddress = networkAddress;
                        meta.resolution = resolution;
                        meta.isRecordingStreamRemotely = isRecordingStreamRemotely;
                        meta.isRecordingStreamLocally = isRecordingStreamLocally;

                        meta = JSON.stringify(meta);

                        query = 'UPDATE videos SET title = ?, description = ?, tags = ?, length_seconds = ?, length_timestamp = ?, views = ?, comments = ?, likes = ?, dislikes = ?, bandwidth = ?, is_publishing = ?, is_published = ?, is_streaming = ?, is_streamed = ?, is_stream_recorded_remotely = ?, is_stream_recorded_locally = ?, is_error = ?, meta = ?, creation_timestamp = ? WHERE video_id = ?';
                        parameters = [title, description, tags, 0, '', 0, 0, 0, 0, 0, 0, 0, 1, 0, isRecordingStreamRemotely, isRecordingStreamLocally, 0, meta, Date.now(), videoId];

                        performDatabaseWriteJob();
                    }
                    else {
                        resolve({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                })
                .catch(error => {
                    logDebugMessageToConsole(null, error, new Error().stack, true);

                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                });
            }
            else {
                const creationTimestamp = Date.now();

                const meta = JSON.stringify(
                    {
                        chatSettings: {
                            isChatHistoryEnabled: true, 
                            chatHistoryLimit: 0
                        }, 
                        rtmpPort: rtmpPort,
                        uuid: uuid,
                        networkAddress: networkAddress,
                        resolution: resolution,
                        isRecordingStreamRemotely: isRecordingStreamRemotely,
                        isRecordingStreamLocally: isRecordingStreamLocally
                    }
                );

                query = 'INSERT INTO videos(video_id, source_file_extension, title, description, tags, length_seconds, length_timestamp, views, comments, likes, dislikes, bandwidth, is_importing, is_imported, is_publishing, is_published, is_streaming, is_streamed, is_stream_recorded_remotely, is_stream_recorded_locally, is_live, is_indexing, is_indexed, is_index_outdated, is_error, is_finalized, meta, creation_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                parameters = [videoId, '', title, description, tags, 0, '', 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, isRecordingStreamRemotely, isRecordingStreamLocally, 1, 0, 0, 0, 0, 0, meta, creationTimestamp];

                performDatabaseWriteJob();
            }

            function performDatabaseWriteJob() {
                submitDatabaseWriteJob(query, parameters, function(isError) {
                    if(isError) {
                        resolve({isError: true, message: 'error communicating with the MoarTube node'});
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

                        if (isResumingStream) {
                            submitDatabaseWriteJob('DELETE FROM comments WHERE video_id = ?', [videoId], null);
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
                                isIndexing: 0,
                                isIndexed: 0,
                                isIndexOutdated: 0,
                                isError: 0,
                                isFinalized: 0
                            }
                        }});

                        resolve({isError: false, videoId: videoId});
                    }
                });
            }
        }
    });
}

function videoIdStop_POST(videoId) {
    return new Promise(function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            submitDatabaseWriteJob('UPDATE videos SET is_streaming = 0, is_streamed = 1, is_index_outdated = CASE WHEN is_indexed = 1 THEN 1 ELSE is_index_outdated END WHERE video_id = ?', [videoId], async function(isError) {
                if(isError) {
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    try {
                        await endStreamedHlsManifestFiles();
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
                    .then(async video => {
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
                                
                                await deleteDirectoryRecursive(m3u8DirectoryPath);
                            }
                        }

                        submitDatabaseWriteJob('DELETE FROM liveChatMessages WHERE video_id = ?', [videoId], function(isError) {
                            if(isError) {
                                
                            }
                            else {
                                
                            }
                        });
                        
                        resolve({isError: false});
                    })
                    .catch(error => {
                        resolve({isError: true, message: 'error communicating with the MoarTube node'});
                    });
                }
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdAdaptiveFormatResolutionSegmentsNextExpectedSegmentIndex_GET(videoId, format, resolution) {
    if(isVideoIdValid(videoId, false) && isAdaptiveFormatValid(format) && isResolutionValid(resolution)) {
        let nextExpectedSegmentIndex = -1;
        
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
        
        return {isError: false, nextExpectedSegmentIndex: nextExpectedSegmentIndex};
    }
    else {
        return {isError: true, message: 'invalid parameters'};
    }
}

function videoIdAdaptiveFormatResolutionSegmentsRemove_POST(videoId, format, resolution, segmentName) {
    if(isVideoIdValid(videoId, false) && isAdaptiveFormatValid(format) && isResolutionValid(resolution) && isSegmentNameValid(segmentName)) {
        const segmentPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/' + format + '/' + resolution + '/' + segmentName);

        try {
            if(fs.existsSync(segmentPath)) {
                fs.unlinkSync(segmentPath);
            }
        }
        catch(error) {
            // do nothing
        }
        
        return {isError: false};
    }
    else {
        return {isError: true, message: 'invalid parameters'};
    }
}

function videoIdBandwidth_GET(videoId) {
    return new Promise(function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            performDatabaseReadJob_GET('SELECT bandwidth FROM videos WHERE video_id = ?', [videoId])
            .then(video => {
                if(video != null) {
                    const bandwidth = video.bandwidth;
                    
                    resolve({isError: false, bandwidth: bandwidth});
                }
                else {
                    resolve({isError: true, message: 'that video does not exist'});
                }
            })
            .catch(error => {
                resolve({isError: true, message: 'error communicating with the MoarTube node'});
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdChatSettings_POST(videoId, isChatHistoryEnabled, chatHistoryLimit) {
    return new Promise(function(resolve, reject) {
        if(isVideoIdValid(videoId, false) && isBooleanValid(isChatHistoryEnabled) && isChatHistoryLimitValid(chatHistoryLimit)) {
            performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId])
            .then(video => {
                if(video != null) {
                    const meta = JSON.parse(video.meta);
                    
                    meta.chatSettings.isChatHistoryEnabled = isChatHistoryEnabled;
                    meta.chatSettings.chatHistoryLimit = chatHistoryLimit;
                    
                    submitDatabaseWriteJob('UPDATE videos SET meta = ? WHERE video_id = ?', [JSON.stringify(meta), videoId], function(isError) {
                        if(isError) {
                            resolve({isError: true, message: 'error communicating with the MoarTube node'});
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
                            
                            resolve({isError: false});
                        }
                    });
                }
                else {
                    resolve({isError: true, message: 'that video does not exist'});
                }
            })
            .catch(error => {
                resolve({isError: true, message: 'error retrieving video data'});
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdChatHistory_GET(videoId) {
    return new Promise(function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            performDatabaseReadJob_ALL('SELECT * FROM liveChatMessages WHERE video_id = ?', [videoId])
            .then(chatHistory => {
                resolve({isError: false, chatHistory: chatHistory});
            })
            .catch(error => {
                resolve({isError: true, message: 'error retrieving chat history'});
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

module.exports = {
    start_POST,
    videoIdStop_POST,
    videoIdAdaptiveFormatResolutionSegmentsNextExpectedSegmentIndex_GET,
    videoIdAdaptiveFormatResolutionSegmentsRemove_POST,
    videoIdBandwidth_GET,
    videoIdChatSettings_POST,
    videoIdChatHistory_GET
}
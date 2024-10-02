const fs = require('fs');
const path = require('path');
const sanitizeHtml = require('sanitize-html');

const { logDebugMessageToConsole } = require('../utils/logger');
const { getVideosDirectoryPath } = require('../utils/paths');
const { updateHlsVideoMasterManifestFile } = require('../utils/filesystem');
const { 
    getNodeSettings, websocketNodeBroadcast, getIsDeveloperMode, generateVideoId, performNodeIdentification, getNodeIdentification, 
    sanitizeTagsSpaces, deleteDirectoryRecursive, getNodeIconPngBase64, getNodeAvatarPngBase64, getNodeBannerPngBase64, getVideoPreviewJpgBase64
} = require('../utils/helpers');
const { getMoarTubeAliaserPort } = require('../utils/urls');
const { performDatabaseReadJob_GET, submitDatabaseWriteJob, performDatabaseReadJob_ALL } = require('../utils/database');
const { 
    isSearchTermValid, isSourceFileExtensionValid, isBooleanValid, isVideoCommentValid, isTimestampValid, isCommentsTypeValid, isCommentIdValid, 
    isSortTermValid, isTagLimitValid, isReportEmailValid, isReportTypeValid, isReportMessageValid, isVideoIdValid, isVideoIdsValid, isFormatValid, isResolutionValid, 
    isTitleValid, isDescriptionValid, isTagTermValid, isTagsValid, isCloudflareTurnstileTokenValid, isSortValid
} = require('../utils/validators');
const { indexer_addVideoToIndex, indexer_removeVideoFromIndex } = require('../utils/indexer-communications');
const { 
    cloudflare_purgeWatchPages, cloudflare_purgeAdaptiveVideos, cloudflare_purgeProgressiveVideos, cloudflare_purgeVideoPreviewImages, cloudflare_purgeVideoPosterImages, 
    cloudflare_purgeVideo, cloudflare_purgeEmbedVideoPages, cloudflare_purgeNodePage, cloudflare_purgeVideoThumbnailImages, cloudflare_cacheVideoSegment,
    cloudflare_validateTurnstileToken
} = require('../utils/cloudflare-communications');

function import_POST(title, description, tags) {
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
        else {
            const videoId = await generateVideoId();
            const creationTimestamp = Date.now();
            
            const meta = JSON.stringify({});

            logDebugMessageToConsole('importing video with id <' + videoId + '>', null, null);
            
            const tagsSanitized = sanitizeTagsSpaces(tags);
            
            fs.mkdirSync(path.join(getVideosDirectoryPath(), videoId + '/images'), { recursive: true });
            fs.mkdirSync(path.join(getVideosDirectoryPath(), videoId + '/adaptive'), { recursive: true });
            fs.mkdirSync(path.join(getVideosDirectoryPath(), videoId + '/progressive'), { recursive: true });
            
            const query = 'INSERT INTO videos(video_id, source_file_extension, title, description, tags, length_seconds, length_timestamp, views, comments, likes, dislikes, bandwidth, is_importing, is_imported, is_publishing, is_published, is_streaming, is_streamed, is_stream_recorded_remotely, is_stream_recorded_locally, is_live, is_indexing, is_indexed, is_index_outdated, is_error, is_finalized, meta, creation_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
            const parameters = [videoId, '', title, description, tags, 0, '', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, meta, creationTimestamp];
            
            submitDatabaseWriteJob(query, parameters, function(isError) {
                if(isError) {
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
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
                                isIndexing: 0,
                                isIndexOutdated: 0,
                                isError: 0,
                                isFinalized: 0,
                                meta: meta,
                                creationTimestamp: creationTimestamp
                            }
                        }
                    });
                    
                    resolve({isError: false, videoId: videoId});
                }
            });
        }
    });
}

function imported_POST(videoId) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            submitDatabaseWriteJob('UPDATE videos SET is_importing = ?, is_imported = ? WHERE video_id = ?', [0, 1, videoId], function(isError) {
                if(isError) {
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    resolve({isError: false});
                }
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdImportingStop_POST(videoId) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            submitDatabaseWriteJob('UPDATE videos SET is_importing = 0 WHERE video_id = ?', [videoId], function(isError) {
                if(isError) {
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    resolve({isError: false});
                }
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function publishing_POST(videoId) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            submitDatabaseWriteJob('UPDATE videos SET is_publishing = ? WHERE video_id = ?', [1, videoId], function(isError) {
                if(isError) {
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    resolve({isError: false});
                }
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function published_POST(videoId) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            submitDatabaseWriteJob('UPDATE videos SET is_publishing = ?, is_published = ? WHERE video_id = ?', [0, 1, videoId], function(isError) {
                if(isError) {
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    resolve({isError: false});
                }
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdPublishingStop_POST(videoId) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            submitDatabaseWriteJob('UPDATE videos SET is_publishing = 0 WHERE video_id = ?', [videoId], function(isError) {
                if(isError) {
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    resolve({isError: false});
                }
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdUpload_POST(videoId, format, resolution) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false) && isFormatValid(format) && isResolutionValid(resolution)) {
            if(format === 'm3u8') {
                try {
                    await updateHlsVideoMasterManifestFile(videoId);
                }
                catch(error) {
                    logDebugMessageToConsole(null, error, new Error().stack);
                }
            }

            try {
                performDatabaseReadJob_ALL('SELECT video_id, tags FROM videos', [])
                .then(async videos => {
                    const videoIds = videos.map(video => video.video_id);
                    const tags = Array.from(new Set(videos.map(video => video.tags.split(',')).flat()));

                    cloudflare_purgeNodePage(tags);
                    cloudflare_purgeWatchPages(videoIds);
                    cloudflare_purgeVideo(videoId, format, resolution);
                })
                .catch(error => {
                    logDebugMessageToConsole(null, error, new Error().stack);
                });
            }
            catch(error) {
                logDebugMessageToConsole(null, error, new Error().stack);
            }

            resolve({isError: false});
        }
        else {
            submitDatabaseWriteJob('UPDATE videos SET is_publishing = ?, is_error = ? WHERE video_id = ?', [0, 1, videoId], function(isError) {
                if(isError) {
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    resolve({isError: true, message: 'invalid parameters'});
                }
            });
        }
    });
}

function videoIdStream_POST(videoId, format, resolution, manifestFilePath_temp, manifestFilePath_new, segmentFileName) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false) && isFormatValid(format) && isResolutionValid(resolution)) {
            if(format === 'm3u8') {
                try {
                    updateHlsVideoMasterManifestFile(videoId);

                    const nodeSettings = getNodeSettings();

                    if(nodeSettings.isCloudflareIntegrationEnabled) {
                        const publicNodeProtocol = nodeSettings.publicNodeProtocol;
                        const publicNodeAddress = nodeSettings.publicNodeAddress;
                        let publicNodePort = nodeSettings.publicNodePort;

                        if(publicNodeProtocol === 'http') {
                            publicNodePort = publicNodePort == 80 ? '' : ':' + publicNodePort;
                        } 
                        else if(publicNodeProtocol === 'https') {
                            publicNodePort = publicNodePort == 443 ? '' : ':' + publicNodePort;
                        }

                        const segmentFileUrl = publicNodeProtocol + '://' + publicNodeAddress + publicNodePort + '/external/videos/' + videoId + '/adaptive/' + format + '/' + resolution + '/segments/' + segmentFileName;

                        cloudflare_cacheVideoSegment(segmentFileUrl)
                        .then(() => {
                            const data = fs.readFileSync(manifestFilePath_temp, 'utf-8');
                            const lines = data.split(/\r?\n/);

                            if(lines.length >= 10) {
                                lines.splice(lines.length - 3, 3);
                                const newContent = lines.join('\n');
                                fs.writeFileSync(manifestFilePath_new, newContent, 'utf-8');
                            }
                            else {
                                fs.copyFileSync(manifestFilePath_temp, manifestFilePath_new); 
                            }
                        })
                        .catch(error => {
                            logDebugMessageToConsole(null, error, new Error().stack);
                        });
                    }
                    else {
                        fs.copyFileSync(manifestFilePath_temp, manifestFilePath_new); 
                    }
                }
                catch(error) {
                    logDebugMessageToConsole(null, error, new Error().stack);
                }
            }

            resolve({isError: false});
        }
        else {
            submitDatabaseWriteJob('UPDATE videos SET is_error = ? WHERE video_id = ?', [1, videoId], function(isError) {
                reject();
            });
        }
    });
}

function error_POST(videoId) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            submitDatabaseWriteJob('UPDATE videos SET is_error = ? WHERE video_id = ?', [1, videoId], function(isError) {
                if(isError) {
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    resolve({isError: false});
                }
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdSourceFileExtension_POST(videoId, sourceFileExtension) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false) && isSourceFileExtensionValid(sourceFileExtension)) {
            submitDatabaseWriteJob('UPDATE videos SET source_file_extension = ? WHERE video_id = ?', [sourceFileExtension, videoId], function(isError) {
                if(isError) {
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    resolve({isError: false});
                }
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdSourceFileExtension_GET(videoId) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            performDatabaseReadJob_GET('SELECT source_file_extension FROM videos WHERE video_id = ?', [videoId])
            .then(video => {
                if(video != null) {
                    const sourceFileExtension = video.source_file_extension;
                    
                    resolve({isError: false, sourceFileExtension: sourceFileExtension});
                }
                else {
                    resolve({isError: true, message: 'that video does not exist'});
                }
            })
            .catch(error => {
                reject(error);
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdPublishes_GET(videoId) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId])
            .then(video => {
                if(video != null) {
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
                    
                    if(video.is_published) {
                        const videoDirectoryPath = path.join(getVideosDirectoryPath(), videoId);
                        const m3u8DirectoryPath = path.join(videoDirectoryPath, 'adaptive/m3u8');
                        const mp4DirectoryPath = path.join(videoDirectoryPath, 'progressive/mp4');
                        const webmDirectoryPath = path.join(videoDirectoryPath, 'progressive/webm');
                        const ogvDirectoryPath = path.join(videoDirectoryPath, 'progressive/ogv');
                        
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
                            for(const publish of publishes) {
                                if(publish.format === format && publish.resolution === resolution) {
                                    publish.isPublished = true;
                                    break;
                                }
                            }
                        }
                    }
                    
                    resolve({isError: false, publishes: publishes});
                }
                else {
                    resolve({isError: true, message: 'that video does not exist'});
                }
            })
            .catch(error => {
                reject(error);
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdUnpublish_POST(videoId, format, resolution) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false) && isFormatValid(format) && isResolutionValid(resolution)) {
            logDebugMessageToConsole('unpublishing video with id <' + videoId + '> format <' + format + '> resolution <' + resolution + '>', null, null);

            try {
                performDatabaseReadJob_ALL('SELECT video_id FROM videos', [])
                .then(async videos => {
                    const videoIds = videos.map(video => video.video_id);

                    /*
                    awaits are needed because Cloudflare purge logic needs directory names,
                    yet they are subsequently deleted; the purge will intermitently
                    fail due to race condition.
                    */

                    await cloudflare_purgeEmbedVideoPages(videoIds);
                    await cloudflare_purgeWatchPages(videoIds);
                    await cloudflare_purgeVideo(videoId, format, resolution);
                })
                .catch(error => {
                    logDebugMessageToConsole(null, error, new Error().stack);
                });
            }
            catch(error) {
                logDebugMessageToConsole(null, error, new Error().stack);
            }
            
            let videoDirectoryPath = '';
            let manifestFilePath = '';
            
            if(format === 'm3u8') {
                manifestFilePath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/' + format + '/manifest-' + resolution + '.m3u8');
                videoDirectoryPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/' + format + '/' + resolution);
            }
            else if(format === 'mp4') {
                videoDirectoryPath = path.join(getVideosDirectoryPath(), videoId + '/progressive/' + format + '/' + resolution);
            }
            else if(format === 'webm') {
                videoDirectoryPath = path.join(getVideosDirectoryPath(), videoId + '/progressive/' + format + '/' + resolution);
            }
            else if(format === 'ogv') {
                videoDirectoryPath = path.join(getVideosDirectoryPath(), videoId + '/progressive/' + format + '/' + resolution);
            }
            
            await deleteDirectoryRecursive(videoDirectoryPath);
            
            if(fs.existsSync(manifestFilePath)) {
                fs.unlinkSync(manifestFilePath);
            }
            
            if(format === 'm3u8') {
                try {
                    await updateHlsVideoMasterManifestFile(videoId);
                }
                catch(error) {
                    logDebugMessageToConsole(null, error, new Error().stack);
                }
            }
            
            resolve({isError: false});
        }
        else {
            resolve({isError: true, message: 'incorrect parameters'});
        }
    });
}

function videoIdData_POST(videoId, title, description, tags) {
    return new Promise(async function(resolve, reject) {
        if(!isVideoIdValid(videoId, false)) {
            resolve({isError: true, message: 'video id is not valid'});
        }
        else if(!isTitleValid(title)) {
            resolve({isError: true, message: 'title is not valid'});
        }
        else if(!isDescriptionValid(description)) {
            resolve({isError: true, message: 'description is not valid'});
        }
        else if(!isTagsValid(tags)) {
            resolve({isError: true, message: 'tags are not valid'});
        }
        else {
            const tagsSanitized = sanitizeTagsSpaces(tags);
            
            submitDatabaseWriteJob('UPDATE videos SET title = ?, description = ?, tags = ?, is_index_outdated = CASE WHEN is_indexed = 1 THEN 1 ELSE is_index_outdated END WHERE video_id = ?', [title, description, tagsSanitized, videoId], function(isError) {
                if(isError) {
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    performDatabaseReadJob_ALL('SELECT video_id, tags FROM videos', [])
                    .then(async videos => {
                        const tags = Array.from(new Set(videos.map(video => video.tags.split(',')).flat()));

                        cloudflare_purgeEmbedVideoPages([videoId]);
                        cloudflare_purgeWatchPages([videoId]);
                        cloudflare_purgeNodePage(tags);
                    })
                    .catch(error => {
                        logDebugMessageToConsole(null, error, new Error().stack);
                    });

                    resolve({isError: false, videoData: {title: title, tags: tags}});
                }
            });
        }
    });
}

function videoIdIndexAdd_POST(videoId, containsAdultContent, termsOfServiceAgreed, cloudflareTurnstileToken) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false) && isBooleanValid(containsAdultContent) && isBooleanValid(termsOfServiceAgreed) && isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, false)) {
            if(termsOfServiceAgreed) {
                const nodeSettings = getNodeSettings();

                const nodeId = nodeSettings.nodeId;
                const nodeName = nodeSettings.nodeName;
                const nodeAbout = nodeSettings.nodeAbout;
                const publicNodeProtocol = nodeSettings.publicNodeProtocol;
                const publicNodeAddress = nodeSettings.publicNodeAddress;
                const publicNodePort = nodeSettings.publicNodePort;

                performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId])
                .then(video => {
                    if(video != null) {
                        if(video.is_published || video.is_live) {
                            performNodeIdentification()
                            .then(() => {
                                const nodeIdentification = getNodeIdentification();
                                
                                const moarTubeTokenProof = nodeIdentification.moarTubeTokenProof;
                                
                                const title = video.title;
                                const tags = video.tags;
                                const views = video.views;
                                const isLive = (video.is_live === 1);
                                const isStreaming = (video.is_streaming === 1);
                                const lengthSeconds = video.length_seconds;
                                const creationTimestamp = video.creation_timestamp;

                                const nodeIconPngBase64 = getNodeIconPngBase64();
                                const nodeAvatarPngBase64 = getNodeAvatarPngBase64();
                                //const nodeBannerPngBase64 = getNodeBannerPngBase64();

                                const videoPreviewJpgBase64 = getVideoPreviewJpgBase64(videoId);
                                
                                const data = {
                                    videoId: videoId,
                                    nodeId: nodeId,
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
                                    containsAdultContent: containsAdultContent,
                                    nodeIconPngBase64: nodeIconPngBase64,
                                    nodeAvatarPngBase64: nodeAvatarPngBase64,
                                    videoPreviewJpgBase64: videoPreviewJpgBase64,
                                    moarTubeTokenProof: moarTubeTokenProof,
                                    cloudflareTurnstileToken: cloudflareTurnstileToken
                                };
                                
                                submitDatabaseWriteJob('UPDATE videos SET is_indexing = 1 WHERE video_id = ?', [videoId], function(isError) {
                                    if(isError) {
                                        resolve({isError: true, message: 'error communicating with the MoarTube node'});
                                    }
                                    else {
                                        indexer_addVideoToIndex(data)
                                        .then(indexerResponseData => {
                                            if(indexerResponseData.isError) {
                                                submitDatabaseWriteJob('UPDATE videos SET is_indexing = 0, is_indexed = 0 WHERE video_id = ?', [videoId], function(isError) {
                                                    if(isError) {
                                                        resolve({isError: true, message: 'error communicating with the MoarTube node'});
                                                    }
                                                    else {
                                                        resolve({isError: true, message: indexerResponseData.message});
                                                    }
                                                });
                                            }
                                            else {
                                                submitDatabaseWriteJob('UPDATE videos SET is_indexing = 0, is_indexed = 1 WHERE video_id = ?', [videoId], function(isError) {
                                                    if(isError) {
                                                        resolve({isError: true, message: 'error communicating with the MoarTube node'});
                                                    }
                                                    else {
                                                        resolve({isError: false});
                                                    }
                                                });
                                            }
                                        })
                                        .catch(error => {
                                            submitDatabaseWriteJob('UPDATE videos SET is_indexing = 0, is_indexed = 0 WHERE video_id = ?', [videoId], function(isError) {

                                            });

                                            reject(error);
                                        });
                                    }
                                });
                            })
                            .catch(error => {
                                reject(error);
                            });
                        }
                        else {
                            resolve({isError: true, message: 'videos have to be published before they can be indexed'});
                        }
                    }
                    else {
                        resolve({isError: true, message: 'that video does not exist'});
                    }
                })
                .catch(error => {
                    reject(error);
                });
            }
            else {
                resolve({isError: true, message: 'you must agree to the terms of service'});
            }
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdIndexRemove_POST(videoId, cloudflareTurnstileToken) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false) && isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, false)) {
            performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId])
            .then(video => {
                if(video != null) {
                    performNodeIdentification()
                    .then(() => {
                        const nodeIdentification = getNodeIdentification();
                        
                        const moarTubeTokenProof = nodeIdentification.moarTubeTokenProof;
                        
                        const data = {
                            videoId: videoId,
                            moarTubeTokenProof: moarTubeTokenProof,
                            cloudflareTurnstileToken: cloudflareTurnstileToken
                        };
                        
                        indexer_removeVideoFromIndex(data)
                        .then(indexerResponseData => {
                            if(indexerResponseData.isError) {
                                resolve({isError: true, message: indexerResponseData.message});
                            }
                            else {
                                submitDatabaseWriteJob('UPDATE videos SET is_indexed = 0 WHERE video_id = ?', [videoId], function(isError) {
                                    if(isError) {
                                        resolve({isError: true, message: 'error communicating with the MoarTube node'});
                                    }
                                    else {
                                        resolve({isError: false});
                                    }
                                });
                            }
                        })
                        .catch(error => {
                            reject(error);
                        });
                    })
                    .catch(error => {
                        reject(error);
                    });
                }
                else {
                    resolve({isError: true, message: 'that video does not exist'});
                }
            })
            .catch(error => {
                reject(error);
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdAlias_GET(videoId) {
    return new Promise(function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            const nodeSettings = getNodeSettings();

            performDatabaseReadJob_GET('SELECT is_indexed FROM videos WHERE video_id = ?', [videoId])
            .then(video => {
                if(video != null) {
                    const isIndexed = video.is_indexed;

                    if(isIndexed) {
                        let videoAliasUrl;

                        if(getIsDeveloperMode()) {
                            videoAliasUrl = 'http://localhost:' + getMoarTubeAliaserPort() + '/nodes/' + nodeSettings.nodeId + '/videos/' + videoId;
                        }
                        else {
                            videoAliasUrl = 'https://moartu.be/nodes/' + nodeSettings.nodeId + '/videos/' + videoId;
                        }

                        resolve({isError: false, videoAliasUrl: videoAliasUrl});
                    }
                    else {
                        resolve({isError: true, message: 'that video is not indexed'});
                    }
                }
                else {
                    resolve({isError: true, message: 'video does not exist'});
                }
            })
            .catch(() => {
                resolve({isError: true, message: 'error communicating with the MoarTube node'});
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function search_GET(searchTerm, sortTerm, tagTerm, tagLimit, timestamp) {
    return new Promise(function(resolve, reject) {
        if(isSearchTermValid(searchTerm) && isSortTermValid(sortTerm) && isTagTermValid(tagTerm, true) && isTagLimitValid(tagLimit) && isTimestampValid(timestamp)) {
            tagLimit = Number(tagLimit);

            let query;
            let params;

            if(searchTerm.length === 0) {
                query = 'SELECT * FROM videos WHERE creation_timestamp < ?';
                params = [timestamp];
            }
            else {
                query = 'SELECT * FROM videos WHERE creation_timestamp < ? AND title LIKE ?';
                params = [timestamp, '%' + searchTerm + '%'];
            }

            performDatabaseReadJob_ALL(query, params)
            .then(rows => {
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

                let rowsToSend = [];
                
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
                
                resolve({isError: false, searchResults: rowsToSend});
            })
            .catch(error => {
                reject(error);
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdThumbnail_POST(videoId) {
    if(isVideoIdValid(videoId, false)) {
        try {
            cloudflare_purgeVideoThumbnailImages([videoId]);
        }
        catch(error) {
            logDebugMessageToConsole(null, error, new Error().stack);
        }
        
        return {isError: false};
    }
    else {
        return {isError: true, message: 'invalid parameters'};
    }
}

function videoIdPreview_POST(videoId) {
    return new Promise(function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            try {
                cloudflare_purgeVideoPreviewImages([videoId]);
            }
            catch(error) {
                logDebugMessageToConsole(null, error, new Error().stack);
            }

            submitDatabaseWriteJob('UPDATE videos SET is_index_outdated = CASE WHEN is_indexed = 1 THEN 1 ELSE is_index_outdated END WHERE video_id = ?', [videoId], function(isError) {
                if(isError) {
                    reject();
                }
                else {
                    resolve({isError: false});
                }
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdPoster_POST(videoId) {
    if(isVideoIdValid(videoId, false)) {
        try {
            cloudflare_purgeVideoPosterImages([videoId]);
        }
        catch(error) {
            logDebugMessageToConsole(null, error, new Error().stack);
        }
        
        return {isError: false};
    }
    else {
        return {isError: true, message: 'invalid parameters'};
    }
}

function videoIdLengths_POST(videoId, lengthSeconds, lengthTimestamp) {
    return new Promise(function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            submitDatabaseWriteJob('UPDATE videos SET length_seconds = ?, length_timestamp = ?, is_index_outdated = CASE WHEN is_indexed = 1 THEN 1 ELSE is_index_outdated END WHERE video_id = ?', [lengthSeconds, lengthTimestamp, videoId], function(isError) {
                if(isError) {
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    resolve({isError: false});
                }
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdData_GET(videoId) {
    return new Promise(function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId])
            .then(video => {
                if(video != null) {
                    const videoId = video.video_id;
                    const title = video.title;
                    const description = video.description;
                    const tags = video.tags;
                    const views = video.views;
                    const isIndexed = video.is_indexed;
                    const isLive = video.is_live;
                    const isStreaming = video.is_streaming;
                    const isFinalized = video.is_finalized;
                    const timestamp = video.creation_timestamp;
                    const meta = JSON.parse(video.meta);

                    let videoAliasUrl = 'MoarTube Aliaser link unavailable';

                    if(video.is_indexed) {
                        const nodeSettings = getNodeSettings();

                        if(getIsDeveloperMode()) {
                            videoAliasUrl = 'http://localhost:' + getMoarTubeAliaserPort() + '/nodes/' + nodeSettings.nodeId + '/videos/' + video.video_id;
                        }
                        else {
                            videoAliasUrl = 'https://moartu.be/nodes/' + nodeSettings.nodeId + '/videos/' + video.video_id;
                        }
                    }

                    const videoData = {
                        videoId: videoId,
                        title: title,
                        description: description,
                        tags: tags,
                        views: views,
                        isIndexed: isIndexed,
                        isLive: isLive,
                        isStreaming: isStreaming,
                        isFinalized: isFinalized,
                        timestamp: timestamp,
                        videoAliasUrl: videoAliasUrl,
                        meta: meta
                    };
                
                    resolve({isError: false, videoData: videoData});
                }
                else {
                    resolve({isError: true, message: 'that video does not exist'});
                }
            })
            .catch(error => {
                reject(error);
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function delete_POST(videoIdsJson) {
    return new Promise(function(resolve, reject) {
        const submittedVideoids = JSON.parse(videoIdsJson);

        if(isVideoIdsValid(submittedVideoids)) {
            performDatabaseReadJob_ALL('SELECT * FROM videos', [])
            .then(async allVideos => {
                const allVideoIds = allVideos.map(video => video.video_id);
                const allTags = Array.from(new Set(allVideos.map(video => video.tags.split(',')).flat()));

                submitDatabaseWriteJob('DELETE FROM videos WHERE (is_importing = 0 AND is_publishing = 0 AND is_streaming = 0) AND video_id IN (' + submittedVideoids.map(() => '?').join(',') + ')', submittedVideoids, function(isError) {
                    if(isError) {
                        resolve({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        performDatabaseReadJob_ALL('SELECT * FROM videos WHERE (is_importing = 1 OR is_publishing = 1 OR is_streaming = 1) AND video_id IN (' + submittedVideoids.map(() => '?').join(',') + ')', submittedVideoids)
                        .then(async nonDeletedVideos => {
                            const nonDeletedVideoIds = nonDeletedVideos.map(video => video.video_id);
                            const deletedVideoIds = submittedVideoids.filter(videoId => !nonDeletedVideoIds.includes(videoId));

                            try {
                                cloudflare_purgeNodePage(allTags);
                                cloudflare_purgeEmbedVideoPages(deletedVideoIds);
                                cloudflare_purgeAdaptiveVideos(deletedVideoIds);
                                cloudflare_purgeProgressiveVideos(deletedVideoIds);
                                cloudflare_purgeWatchPages(allVideoIds);
                            }
                            catch(error) {
                                logDebugMessageToConsole(null, error, new Error().stack);
                            }

                            deletedVideoIds.forEach(async function(deletedVideoId) {
                                const videoDirectoryPath = path.join(getVideosDirectoryPath(), deletedVideoId);
            
                                await deleteDirectoryRecursive(videoDirectoryPath);
                            });

                            submitDatabaseWriteJob('DELETE FROM comments WHERE video_id IN (' + deletedVideoIds.map(() => '?').join(',') + ')', deletedVideoIds, function(isError) {
                                if(isError) {
                                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                                }
                                else {
                                    resolve({isError: false, deletedVideoIds: deletedVideoIds, nonDeletedVideoIds: nonDeletedVideoIds});
                                }
                            });
                        })
                        .catch(error => {
                            reject(error);
                        });
                    }
                });
            })
            .catch(error => {
                reject(error);
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function finalize_POST(videoIdsJson) {
    return new Promise(function(resolve, reject) {
        const videoIds = JSON.parse(videoIdsJson);

        if(isVideoIdsValid(videoIds)) {
            submitDatabaseWriteJob('UPDATE videos SET is_finalized = 1 WHERE (is_importing = 0 AND is_publishing = 0 AND is_streaming = 0) AND video_id IN (' + videoIds.map(() => '?').join(',') + ')', videoIds, function(isError) {
                if(isError) {
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    performDatabaseReadJob_ALL('SELECT * FROM videos WHERE (is_importing = 1 OR is_publishing = 1 OR is_streaming = 1) AND video_id IN (' + videoIds.map(() => '?').join(',') + ')', videoIds)
                    .then(videos => {
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
                        
                        resolve({isError: false, finalizedVideoIds: finalizedVideoIds, nonFinalizedVideoIds: nonFinalizedVideoIds});
                    })
                    .catch(error => {
                        reject(error);
                    });
                }
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdComments_GET(videoId, type, sort, timestamp) {
    return new Promise(function(resolve, reject) {
        if(isVideoIdValid(videoId, false) && isCommentsTypeValid(type) && isSortValid(sort) && isTimestampValid(timestamp)) {
            let sortTerm;

            if(sort === 'ascending') {
                sortTerm = 'ASC';
            }
            else if(sort === 'descending') {
                sortTerm = 'DESC';
            }

            if(type === 'after') {
                performDatabaseReadJob_ALL('SELECT * FROM comments WHERE video_id = ? AND timestamp > ? ORDER BY timestamp ' + sortTerm, [videoId, timestamp])
                .then(comments => {
                    resolve({isError: false, comments: comments});
                })
                .catch(error => {
                    reject(error);
                });
            }
            else if(type === 'before') {
                performDatabaseReadJob_ALL('SELECT * FROM comments WHERE video_id = ? AND timestamp < ? ORDER BY timestamp ' + sortTerm, [videoId, timestamp])
                .then(comments => {
                    resolve({isError: false, comments: comments});
                })
                .catch(error => {
                    reject(error);
                });
            }
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdCommentsCommentId_GET(videoId, commentId) {
    return new Promise(function(resolve, reject) {
        if(isVideoIdValid(videoId, false) && isCommentIdValid(commentId)) {
            performDatabaseReadJob_GET('SELECT * FROM comments WHERE video_id = ? AND id = ?', [videoId, commentId])
            .then(comment => {
                if(comment != null) {
                    resolve({isError: false, comment: comment});
                }
                else {
                    resolve({isError: true, message: 'that comment does not exist'});
                }
            })
            .catch(error => {
                reject(error);
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

async function videoIdCommentsComment_POST(videoId, commentPlainText, timestamp, cloudflareTurnstileToken, cloudflareConnectingIp) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false) && isVideoCommentValid(commentPlainText) && isTimestampValid(timestamp) && isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, true)) {
            let canProceed = true;
            let errorMessage;

            try {
                const nodeSettings = getNodeSettings();
                
                if(nodeSettings.isCloudflareTurnstileEnabled) {
                    if(cloudflareTurnstileToken.length === 0) {
                        errorMessage = 'human verification was enabled on this MoarTube Node, please refresh your browser';

                        canProceed = false;
                    }
                    else {
                        const response = await cloudflare_validateTurnstileToken(cloudflareTurnstileToken, cloudflareConnectingIp);

                        if(response.isError) {
                            logDebugMessageToConsole(null, response.message, new Error().stack);

                            errorMessage = response.message;

                            canProceed = false;
                        }
                    }
                }
            }
            catch(error) {
                logDebugMessageToConsole(null, error, new Error().stack);

                errorMessage = 'error communicating with the MoarTube node';

                canProceed = false;
            }

            if(canProceed) {
                const commentPlainTextSanitized = sanitizeHtml(commentPlainText, {allowedTags: [], allowedAttributes: {}});
                const commentTimestamp = Date.now();
                
                submitDatabaseWriteJob('INSERT INTO comments(video_id, comment_plain_text_sanitized, timestamp) VALUES (?, ?, ?)', [videoId, commentPlainTextSanitized, commentTimestamp], function(isError) {
                    if(isError) {
                        resolve({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        submitDatabaseWriteJob('UPDATE videos SET comments = comments + 1 WHERE video_id = ?', [videoId], function(isError) {
                            if(isError) {
                                resolve({isError: true, message: 'error communicating with the MoarTube node'});
                            }
                            else {
                                try {
                                    cloudflare_purgeWatchPages([videoId]);
                                }
                                catch(error) {
                                    logDebugMessageToConsole(null, error, new Error().stack);
                                }

                                performDatabaseReadJob_ALL('SELECT * FROM comments WHERE video_id = ? AND timestamp > ? ORDER BY timestamp ASC', [videoId, timestamp])
                                .then(comments => {
                                    let commentId = 0;
                                        
                                        for (let i = comments.length - 1; i >= 0; i--) {
                                            if(commentTimestamp === comments[i].timestamp) {
                                                commentId = comments[i].id;
                                                break;
                                            }
                                        }
                                        
                                        resolve({isError: false, commentId: commentId, comments: comments});
                                })
                                .catch(error => {
                                    reject(error);
                                });
                            }
                        });
                    }
                });
            }
            else {
                resolve({isError: true, message: errorMessage});
            }
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdCommentsCommentIdDelete_DELETE(videoId, commentId, timestamp) {
    return new Promise(function(resolve, reject) {
        if(isVideoIdValid(videoId, false) && isCommentIdValid(commentId) && isTimestampValid(timestamp)) {
            performDatabaseReadJob_GET('SELECT * FROM comments WHERE id = ? AND video_id = ? AND timestamp = ?', [commentId, videoId, timestamp])
            .then(comment => {
                if(comment != null) {
                    submitDatabaseWriteJob('DELETE FROM comments WHERE id = ? AND video_id = ? AND timestamp = ?', [commentId, videoId, timestamp], function(isError) {
                        if(isError) {
                            reject();
                        }
                        else {
                            submitDatabaseWriteJob('UPDATE videos SET comments = comments - 1 WHERE video_id = ? AND comments > 0', [videoId], function(isError) {
                                if(isError) {
                                    reject();
                                }
                                else {
                                    try {
                                        cloudflare_purgeWatchPages([videoId]);
                                    }
                                    catch(error) {
                                        logDebugMessageToConsole(null, error, new Error().stack);
                                    }

                                    resolve({isError: false});
                                }
                            });
                        }
                    });
                }
                else {
                    resolve({isError: true, message: 'that comment does not exist'});
                }
            })
            .catch(error => {
                reject(error);
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

async function videoIdLike_POST(videoId, isLiking, isUnDisliking, cloudflareTurnstileToken, cloudflareConnectingIp) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false) && isBooleanValid(isLiking) && isBooleanValid(isUnDisliking) && isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, true)) {
            let canProceed = true;
            let errorMessage;

            try {
                const nodeSettings = getNodeSettings();
                
                if(nodeSettings.isCloudflareTurnstileEnabled) {
                    if(cloudflareTurnstileToken.length === 0) {
                        errorMessage = 'human verification was enabled on this MoarTube Node, please refresh your browser';

                        canProceed = false;
                    }
                    else {
                        const response = await cloudflare_validateTurnstileToken(cloudflareTurnstileToken, cloudflareConnectingIp);

                        if(response.isError) {
                            logDebugMessageToConsole(null, response.message, new Error().stack);

                            errorMessage = response.message;

                            canProceed = false;
                        }
                    }
                }
            }
            catch(error) {
                logDebugMessageToConsole(null, error, new Error().stack);

                errorMessage = 'error communicating with the MoarTube node';

                canProceed = false;
            }

            if(canProceed) {
                if(isLiking) {
                    submitDatabaseWriteJob('UPDATE videos SET likes = likes + 1 WHERE video_id = ?', [videoId], function(isError) {
                        if(isError) {
                            resolve({isError: true, message: 'error communicating with the MoarTube node'});
                        }
                        else {
                            if(isUnDisliking) {
                                submitDatabaseWriteJob('UPDATE videos SET dislikes = dislikes - 1 WHERE video_id = ?', [videoId], function(isError) {
                                    if(isError) {
                                        resolve({isError: true, message: 'error communicating with the MoarTube node'});
                                    }
                                    else {
                                        try {
                                            cloudflare_purgeWatchPages([videoId]);
                                        }
                                        catch(error) {
                                            logDebugMessageToConsole(null, error, new Error().stack);
                                        }

                                        resolve({isError: false});
                                    }
                                });
                            }
                            else {
                                try {
                                    cloudflare_purgeWatchPages([videoId]);
                                }
                                catch(error) {
                                    logDebugMessageToConsole(null, error, new Error().stack);
                                }

                                resolve({isError: false});
                            }
                        }
                    });
                }
                else {
                    submitDatabaseWriteJob('UPDATE videos SET likes = likes - 1 WHERE video_id = ?', [videoId], function(isError) {
                        if(isError) {
                            resolve({isError: true, message: 'error communicating with the MoarTube node'});
                        }
                        else {
                            try {
                                cloudflare_purgeWatchPages([videoId]);
                            }
                            catch(error) {
                                logDebugMessageToConsole(null, error, new Error().stack);
                            }

                            resolve({isError: false});
                        }
                    });
                }
            }
            else {
                resolve({isError: true, message: errorMessage});
            }
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

async function videoIdDislike_POST(videoId, isDisliking, isUnliking, cloudflareTurnstileToken, cloudflareConnectingIp) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false) && isBooleanValid(isDisliking) && isBooleanValid(isUnliking) && isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, true)) {
            let canProceed = true;
            let errorMessage;

            try {
                const nodeSettings = getNodeSettings();
                
                if(nodeSettings.isCloudflareTurnstileEnabled) {
                    if(cloudflareTurnstileToken.length === 0) {
                        errorMessage = 'human verification was enabled on this MoarTube Node, please refresh your browser';

                        canProceed = false;
                    }
                    else {
                        const response = await cloudflare_validateTurnstileToken(cloudflareTurnstileToken, cloudflareConnectingIp);

                        if(response.isError) {
                            logDebugMessageToConsole(null, response.message, new Error().stack);

                            errorMessage = response.message;

                            canProceed = false;
                        }
                    }
                }
            }
            catch(error) {
                logDebugMessageToConsole(null, error, new Error().stack);

                errorMessage = 'error communicating with the MoarTube node';

                canProceed = false;
            }

            if(canProceed) {
                if(isDisliking) {
                    submitDatabaseWriteJob('UPDATE videos SET dislikes = dislikes + 1 WHERE video_id = ?', [videoId], function(isError) {
                        if(isError) {
                            resolve({isError: true, message: 'error communicating with the MoarTube node'});
                        }
                        else {
                            if(isUnliking) {
                                submitDatabaseWriteJob('UPDATE videos SET likes = likes - 1 WHERE video_id = ?', [videoId], function(isError) {
                                    if(isError) {
                                        resolve({isError: true, message: 'error communicating with the MoarTube node'});
                                    }
                                    else {
                                        try {
                                            cloudflare_purgeWatchPages([videoId]);
                                        }
                                        catch(error) {
                                            logDebugMessageToConsole(null, error, new Error().stack);
                                        }

                                        resolve({isError: false});
                                    }
                                });
                            }
                            else {
                                try {
                                    cloudflare_purgeWatchPages([videoId]);
                                }
                                catch(error) {
                                    logDebugMessageToConsole(null, error, new Error().stack);
                                }

                                resolve({isError: false});
                            }
                        }
                    });
                }
                else {
                    submitDatabaseWriteJob('UPDATE videos SET dislikes = dislikes - 1 WHERE video_id = ?', [videoId], function(isError) {
                        if(isError) {
                            resolve({isError: true, message: 'error communicating with the MoarTube node'});
                        }
                        else {
                            try {
                                cloudflare_purgeWatchPages([videoId]);
                            }
                            catch(error) {
                                logDebugMessageToConsole(null, error, new Error().stack);
                            }
                            
                            resolve({isError: false});
                        }
                    });
                }
            }
            else {
                resolve({isError: true, message: errorMessage});
            }
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function recommended_GET() {
    return new Promise(function(resolve, reject) {
        performDatabaseReadJob_ALL('SELECT * FROM videos WHERE (is_published = 1 OR is_live = 1) ORDER BY creation_timestamp DESC', [])
        .then(recommendedVideos => {
            resolve({isError: false, recommendedVideos: recommendedVideos});
        })
        .catch(error => {
            reject(error);
        });
    });
}

function tags_GET() {
    return new Promise(function(resolve, reject) {
        performDatabaseReadJob_ALL('SELECT * FROM videos WHERE (is_published = 1 OR is_live = 1) ORDER BY creation_timestamp DESC', [])
        .then(rows => {
            const tags = [];

            rows.forEach(function(row) {
                const tagsArray = row.tags.split(',');
                
                tagsArray.forEach(function(tag) {
                    if (!tags.includes(tag)) {
                        tags.push(tag);
                    }
                });
            });
            
            resolve({isError: false, tags: tags});
        })
        .catch(error => {
            reject(error);
        });
    });
}

function tagsAll_GET() {
    return new Promise(function(resolve, reject) {
        performDatabaseReadJob_ALL('SELECT * FROM videos ORDER BY creation_timestamp DESC', [])
        .then(videos => {
            const tags = [];

            videos.forEach(function(videos) {
                const tagsArray = videos.tags.split(',');

                tagsArray.forEach(function(tag) {
                    if (!tags.includes(tag)) {
                        tags.push(tag);
                    }
                });
            });
            
            resolve({isError: false, tags: tags});
        })
        .catch(error => {
            reject(error);
        });
    });
}

async function videoIdReport_POST(videoId, email, reportType, message, cloudflareTurnstileToken, cloudflareConnectingIp) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false) && isReportEmailValid(email) && isReportTypeValid(reportType) && isReportMessageValid(message) && isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, true)) {
            let canProceed = true;
            let errorMessage;

            try {
                const nodeSettings = getNodeSettings();
                
                if(nodeSettings.isCloudflareTurnstileEnabled) {
                    if(cloudflareTurnstileToken.length === 0) {
                        errorMessage = 'human verification was enabled on this MoarTube Node, please refresh your browser';

                        canProceed = false;
                    }
                    else {
                        const response = await cloudflare_validateTurnstileToken(cloudflareTurnstileToken, cloudflareConnectingIp);

                        if(response.isError) {
                            logDebugMessageToConsole(null, response.message, new Error().stack);

                            errorMessage = response.message;

                            canProceed = false;
                        }
                    }
                }
            }
            catch(error) {
                logDebugMessageToConsole(null, error, new Error().stack);

                errorMessage = 'error communicating with the MoarTube node';

                canProceed = false;
            }

            if(canProceed) {
                email = sanitizeHtml(email, {allowedTags: [], allowedAttributes: {}});
                message = sanitizeHtml(message, {allowedTags: [], allowedAttributes: {}});

                performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId])
                .then(video => {
                    if(video != null) {
                        const creationTimestamp = video.creation_timestamp;
                        
                        submitDatabaseWriteJob('INSERT INTO videoReports(timestamp, video_timestamp, video_id, email, type, message) VALUES (?, ?, ?, ?, ?, ?)', [Date.now(), creationTimestamp, videoId, email, reportType, message], function(isError) {
                            if(isError) {
                                reject();
                            }
                            else {
                                resolve({isError: false});
                            }
                        });
                    }
                    else {
                        resolve({isError: true, message: 'that video does not exist'});
                    }
                })
                .catch(error => {
                    reject(error);
                });
            }
            else {
                resolve({isError: true, message: errorMessage});
            }
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

let viewCounter = 0;
let viewCounterIncrementTimer;
function videoIdViewsIncrement_GET(videoId) {
    return new Promise(function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            viewCounter++;
            
            clearTimeout(viewCounterIncrementTimer);
            
            viewCounterIncrementTimer = setTimeout(function() {
                const viewCounterTemp = viewCounter;
                
                viewCounter = 0;
                
                submitDatabaseWriteJob('UPDATE videos SET views = views + ?, is_index_outdated = CASE WHEN is_indexed = 1 THEN 1 ELSE is_index_outdated END WHERE video_id = ?', [viewCounterTemp, videoId], function(isError) {
                    if(isError) {
                        resolve({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        // do nothing
                    }
                });
            }, 500);

            performDatabaseReadJob_GET('SELECT views FROM videos WHERE video_id = ?', [videoId])
            .then(video => {
                if(video != null) {
                    const views = video.views + viewCounter

                    resolve({isError: false, views: views});
                }
                else{
                    resolve({isError: true, message: 'that video does not exist'});
                }
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

function videoIdWatch_GET(videoId) {
    return new Promise(function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId])
            .then(video => {
                if(video != null) {
                    let manifestType;

                    if(video.is_streaming) {
                        manifestType = 'dynamic';
                    }
                    else {
                        manifestType = 'static';
                    }
                    
                    const adaptiveVideosDirectoryPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive');
                    const progressiveVideosDirectoryPath = path.join(getVideosDirectoryPath(), videoId + '/progressive');
                    
                    const adaptiveFormats = [{format: 'm3u8', type: 'application/vnd.apple.mpegurl'}];
                    const progressiveFormats = [{format: 'mp4', type: 'video/mp4'}, {format: 'webm', type: 'video/webm'}, {format: 'ogv', type: 'video/ogg'}];
                    const resolutions = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p'];
                    
                    const adaptiveSources = [];
                    const progressiveSources = [];
                    const sourcesFormatsAndResolutions = {m3u8: [], mp4: [], webm: [], ogv: []};
                    
                    let isHlsAvailable = false;
                    let isMp4Available = false;
                    let isWebmAvailable = false;
                    let isOgvAvailable = false;
                    
                    adaptiveFormats.forEach(function(adaptiveFormat) {
                        const format = adaptiveFormat.format;
                        const type = adaptiveFormat.type;

                        const adaptiveVideoFormatPath = path.join(adaptiveVideosDirectoryPath, format);
                        const adaptiveVideoMasterManifestPath = path.join(adaptiveVideoFormatPath, 'manifest-master.' + format);
                        
                        if(fs.existsSync(adaptiveVideoMasterManifestPath)) {
                            if(format === 'm3u8') {
                                isHlsAvailable = true;
                            }
                            
                            const src = '/external/videos/' + videoId + '/adaptive/' + manifestType + '/' + format + '/manifests/manifest-master.' + format;
                            
                            const source = {src: src, type: type};
                            
                            adaptiveSources.push(source);
                        }

                        resolutions.forEach(function(resolution) {
                            const adaptiveVideoFilePath = path.join(adaptiveVideosDirectoryPath, format + '/manifest-' + resolution + '.' + format);
                            
                            if(fs.existsSync(adaptiveVideoFilePath)) {
                                sourcesFormatsAndResolutions[format].push(resolution);
                                
                                const src = '/external/videos/' + videoId + '/adaptive/' + manifestType + '/' + format + '/manifests/manifest-' + resolution + '.' + format;
                                
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
                                
                                const src = '/external/videos/' + videoId + '/progressive/' + format + '/' + resolution;
                                
                                const source = {src: src, type: type};
                                
                                progressiveSources.push(source);
                            }
                        });
                    });
                    
                    resolve({isError: false, video: {
                        videoId: videoId,
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
                    }});
                }
                else {
                    resolve({isError: true, message: 'that video does not exist'});
                }
            })
            .catch(error => {
                reject(error);
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

module.exports = {
    import_POST,
    imported_POST,
    videoIdImportingStop_POST,
    publishing_POST,
    published_POST,
    videoIdPublishingStop_POST,
    videoIdUpload_POST,
    videoIdStream_POST,
    error_POST,
    videoIdSourceFileExtension_POST,
    videoIdSourceFileExtension_GET,
    videoIdPublishes_GET,
    videoIdUnpublish_POST,
    videoIdData_POST,
    videoIdIndexAdd_POST,
    videoIdIndexRemove_POST,
    videoIdAlias_GET,
    search_GET,
    videoIdThumbnail_POST,
    videoIdPreview_POST,
    videoIdPoster_POST,
    videoIdLengths_POST,
    videoIdData_GET,
    delete_POST,
    finalize_POST,
    videoIdComments_GET,
    videoIdCommentsCommentId_GET,
    videoIdCommentsComment_POST,
    videoIdCommentsCommentIdDelete_DELETE,
    videoIdLike_POST,
    videoIdDislike_POST,
    recommended_GET,
    tags_GET,
    tagsAll_GET,
    videoIdViewsIncrement_GET,
    videoIdReport_POST,
    videoIdWatch_GET
};
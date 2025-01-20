const fs = require('fs');
const path = require('path');
const sanitizeHtml = require('sanitize-html');

const { logDebugMessageToConsole } = require('../utils/logger');
const { getVideosDirectoryPath } = require('../utils/paths');
const { 
    getNodeSettings, websocketNodeBroadcast, getIsDeveloperMode, generateVideoId, performNodeIdentification, getNodeIdentification, 
    sanitizeTagsSpaces, deleteDirectoryRecursive, deleteFile, getNodeIconPngBase64, getNodeAvatarPngBase64, getNodeBannerPngBase64, 
    getVideoPreviewJpgBase64, getExternalVideosBaseUrl
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
    cloudflare_purgeVideo, cloudflare_purgeEmbedVideoPages, cloudflare_purgeNodePage, cloudflare_purgeVideoThumbnailImages, cloudflare_validateTurnstileToken
} = require('../utils/cloudflare-communications');

async function import_POST(title, description, tags) {
    if(!isTitleValid(title)) {
        throw new Error('title is not valid');
    }
    else if(!isDescriptionValid(description)) {
        throw new Error('description is not valid');
    }
    else if(!isTagsValid(tags)) {
        throw new Error('tags are not valid');
    }
    else {
        const videoId = await generateVideoId();
        const creationTimestamp = Date.now();
        
        const outputs = JSON.stringify({'m3u8': [], 'mp4': [], 'webm': [], 'ogv': []});

        const meta = JSON.stringify({});

        logDebugMessageToConsole('importing video with id <' + videoId + '>', null, null);
        
        const tagsSanitized = sanitizeTagsSpaces(tags);
        
        fs.mkdirSync(path.join(getVideosDirectoryPath(), videoId + '/images'), { recursive: true });
        fs.mkdirSync(path.join(getVideosDirectoryPath(), videoId + '/adaptive'), { recursive: true });
        fs.mkdirSync(path.join(getVideosDirectoryPath(), videoId + '/progressive'), { recursive: true });
        
        const query = 'INSERT INTO videos(video_id, source_file_extension, title, description, tags, length_seconds, length_timestamp, views, comments, likes, dislikes, bandwidth, is_importing, is_imported, is_publishing, is_published, is_streaming, is_streamed, is_stream_recorded_remotely, is_stream_recorded_locally, is_live, is_indexing, is_indexed, is_index_outdated, is_error, is_finalized, is_hidden, is_passworded, password, is_comments_enabled, is_likes_enabled, is_dislikes_enabled, is_reports_enabled, is_live_chat_enabled, outputs, meta, creation_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const parameters = [videoId, '', title, description, tags, 0, '', 0, 0, 0, 0, 0, true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, '', true, true, true, true, true, outputs, meta, creationTimestamp];
        
        await submitDatabaseWriteJob(query, parameters);
        
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
        
        return {isError: false, videoId: videoId};
    }
}

async function imported_POST(videoId) {
    if(isVideoIdValid(videoId, false)) {
        await submitDatabaseWriteJob('UPDATE videos SET is_importing = ?, is_imported = ? WHERE video_id = ?', [false, true, videoId]);
            
        return {isError: false};
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdImportingStop_POST(videoId) {
    if(isVideoIdValid(videoId, false)) {
        await submitDatabaseWriteJob('UPDATE videos SET is_importing = ? WHERE video_id = ?', [false, videoId]);

        return {isError: false};
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function publishing_POST(videoId) {
    if(isVideoIdValid(videoId, false)) {
        await submitDatabaseWriteJob('UPDATE videos SET is_publishing = ? WHERE video_id = ?', [true, videoId]);

        return {isError: false};
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function published_POST(videoId) {
    if(isVideoIdValid(videoId, false)) {
        await submitDatabaseWriteJob('UPDATE videos SET is_publishing = ?, is_published = ? WHERE video_id = ?', [false, true, videoId]);

        return {isError: false};
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function formatResolutionPublished_POST(videoId, format, resolution) {
    if(isVideoIdValid(videoId, false) && isFormatValid(format) && isResolutionValid(resolution)) {
        const video = await performDatabaseReadJob_GET('SELECT outputs FROM videos WHERE video_id = ?', [videoId]);

        if(video != null) {
            const outputs = JSON.parse(video.outputs);

            if (!outputs[format].includes(resolution)) {
                outputs[format].push(resolution);

                outputs[format].sort((a, b) => {
                    return parseInt(b.split('p')[0]) - parseInt(a.split('p')[0]);
                });
            }
            
            await submitDatabaseWriteJob('UPDATE videos SET outputs = ? WHERE video_id = ?', [JSON.stringify(outputs), videoId]);
            
            return {isError: false};
        }
        else {
            throw new Error('that video does not exist');
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdPublishingStop_POST(videoId) {
    if(isVideoIdValid(videoId, false)) {
        await submitDatabaseWriteJob('UPDATE videos SET is_publishing = ? WHERE video_id = ?', [false, videoId]);
        
        return {isError: false};
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdUpload_POST(videoId, format, resolution) {
    if(isVideoIdValid(videoId, false) && isFormatValid(format) && isResolutionValid(resolution)) {
        try {
            const videos = await performDatabaseReadJob_ALL('SELECT video_id, tags FROM videos', []);

            cloudflare_purgeNodePage(Array.from(new Set(videos.map(video => video.tags.split(',')).flat())));
            cloudflare_purgeWatchPages(videos.map(video => video.video_id));
            cloudflare_purgeVideo(videoId, format, resolution);
        }
        catch(error) {
            logDebugMessageToConsole(null, error, null);
        }

        return {isError: false};
    }
    else {
        await submitDatabaseWriteJob('UPDATE videos SET is_publishing = ?, is_error = ? WHERE video_id = ?', [false, true, videoId]);
            
        throw new Error('invalid parameters');
    }
}

async function videoIdStream_POST(videoId, format, resolution) {
    if(isVideoIdValid(videoId, false) && isFormatValid(format) && isResolutionValid(resolution)) {
        return {isError: false};
    }
    else {
        await submitDatabaseWriteJob('UPDATE videos SET is_error = ? WHERE video_id = ?', [true, videoId]);

        throw new Error('invalid parameters');
    }
}

async function error_POST(videoId) {
    if(isVideoIdValid(videoId, false)) {
        await submitDatabaseWriteJob('UPDATE videos SET is_error = ? WHERE video_id = ?', [true, videoId]);
        
        return {isError: false};
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdSourceFileExtension_POST(videoId, sourceFileExtension) {
    if(isVideoIdValid(videoId, false) && isSourceFileExtensionValid(sourceFileExtension)) {
        await submitDatabaseWriteJob('UPDATE videos SET source_file_extension = ? WHERE video_id = ?', [sourceFileExtension, videoId]);
        
        return {isError: false};
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdSourceFileExtension_GET(videoId) {
    if(isVideoIdValid(videoId, false)) {
        const video = await performDatabaseReadJob_GET('SELECT source_file_extension FROM videos WHERE video_id = ?', [videoId]);

        if(video != null) {
            const sourceFileExtension = video.source_file_extension;
            
            return {isError: false, sourceFileExtension: sourceFileExtension};
        }
        else {
            throw new Error('that video does not exist');
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdPublishes_GET(videoId) {
    if(isVideoIdValid(videoId, false)) {
        const video = await performDatabaseReadJob_GET('SELECT is_published, outputs FROM videos WHERE video_id = ?', [videoId]);

        if(video != null) {
            const outputs = JSON.parse(video.outputs);

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
                { format: 'ogv', resolution: '240p', isPublished: false }
            ];

            if(video.is_published) {
                for(const publish of publishes) {
                    const resolutions = outputs[publish.format];

                    for(const resolution of resolutions) {
                        if(publish.resolution === resolution) {
                            publish.isPublished = true;
                            break;
                        }
                    }
                }
            }

            return {isError: false, publishes: publishes};
        }
        else {
            throw new Error('that video does not exist');
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdUnpublish_POST(videoId, format, resolution) {
    if(isVideoIdValid(videoId, false) && isFormatValid(format) && isResolutionValid(resolution)) {
        logDebugMessageToConsole('unpublishing video with id <' + videoId + '> format <' + format + '> resolution <' + resolution + '>', null, null);

        try {
            const videos = await performDatabaseReadJob_ALL('SELECT video_id FROM videos', []);

            const videoIds = videos.map(video => video.video_id);

            await cloudflare_purgeEmbedVideoPages(videoIds);
            await cloudflare_purgeWatchPages(videoIds);
            await cloudflare_purgeVideo(videoId, format, resolution);
        }
        catch(error) {
            logDebugMessageToConsole(null, error, null);
        }

        const video = await performDatabaseReadJob_GET('SELECT outputs FROM videos WHERE video_id = ?', [videoId]);

        if(video != null) {
            const outputs = JSON.parse(video.outputs);

            outputs[format] = outputs[format].filter(item => item !== resolution);

            await submitDatabaseWriteJob('UPDATE videos SET outputs = ? WHERE video_id = ?', [JSON.stringify(outputs), videoId]);
            
            const nodeSettings = getNodeSettings();

            if(nodeSettings.storageConfig.storageMode === 'filesystem') {
                let manifestFilePath;
                let segmentsDirectoryPath;
                let videoFilePath;
                
                if(format === 'm3u8') {
                    manifestFilePath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/' + format + '/manifest-' + resolution + '.m3u8');
                    segmentsDirectoryPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/' + format + '/' + resolution);
                }
                else {
                    videoFilePath = path.join(getVideosDirectoryPath(), videoId + '/progressive/' + format + '/' + resolution + '.' + format);
                }
                
                if(manifestFilePath != null) {
                    await deleteFile(manifestFilePath);
                }

                if(segmentsDirectoryPath != null) {
                    await deleteDirectoryRecursive(segmentsDirectoryPath);
                }

                if(videoFilePath != null) {
                    await deleteFile(videoFilePath);
                }
            }

            return {isError: false};
        }
        else {
            throw new Error('that video does not exist');
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdData_POST(videoId, title, description, tags) {
    if(!isVideoIdValid(videoId, false)) {
        throw new Error('video id is not valid');
    }
    else if(!isTitleValid(title)) {
        throw new Error('title is not valid');
    }
    else if(!isDescriptionValid(description)) {
        throw new Error('description is not valid');
    }
    else if(!isTagsValid(tags)) {
        throw new Error('tags are not valid');
    }
    else {
        const tagsSanitized = sanitizeTagsSpaces(tags);
        
        await submitDatabaseWriteJob('UPDATE videos SET title = ?, description = ?, tags = ?, is_index_outdated = CASE WHEN is_indexed = ? THEN ? ELSE is_index_outdated END WHERE video_id = ?', [title, description, tagsSanitized, true, true, videoId]);

        try {
            const videos = await performDatabaseReadJob_ALL('SELECT video_id, tags FROM videos', []);

            cloudflare_purgeEmbedVideoPages([videoId]);
            cloudflare_purgeWatchPages([videoId]);
            cloudflare_purgeNodePage(Array.from(new Set(videos.map(video => video.tags.split(',')).flat())));
        }
        catch(error) {
            logDebugMessageToConsole(null, error, null);
        }

        return {isError: false, videoData: {title: title, tags: tags}};
    }
}

async function videoIdIndexAdd_POST(videoId, containsAdultContent, termsOfServiceAgreed, cloudflareTurnstileToken) {
    if(isVideoIdValid(videoId, false) && isBooleanValid(containsAdultContent) && isBooleanValid(termsOfServiceAgreed) && isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, false)) {
        if(termsOfServiceAgreed) {
            const nodeSettings = getNodeSettings();

            const nodeId = nodeSettings.nodeId;
            const nodeName = nodeSettings.nodeName;
            const nodeAbout = nodeSettings.nodeAbout;
            const publicNodeProtocol = nodeSettings.publicNodeProtocol;
            const publicNodeAddress = nodeSettings.publicNodeAddress;
            const publicNodePort = nodeSettings.publicNodePort;

            const video = await performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId]);

            if(video != null) {
                if(video.is_published || video.is_live) {
                    await performNodeIdentification();

                    const nodeIdentification = getNodeIdentification();
                    
                    const moarTubeTokenProof = nodeIdentification.moarTubeTokenProof;
                    
                    const title = video.title;
                    const tags = video.tags;
                    const views = video.views;
                    const isLive = video.is_live;
                    const isStreaming = video.is_streaming;
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
                    
                    await submitDatabaseWriteJob('UPDATE videos SET is_indexing = ? WHERE video_id = ?', [true, videoId]);

                    try {
                        const indexerResponseData = await indexer_addVideoToIndex(data);

                        if(indexerResponseData.isError) {
                            await submitDatabaseWriteJob('UPDATE videos SET is_indexing = ? WHERE video_id = ?', [false, videoId]);

                            throw new Error(indexerResponseData.message);
                        }
                        else {
                            await submitDatabaseWriteJob('UPDATE videos SET is_indexing = ?, is_indexed = ? WHERE video_id = ?', [false, true, videoId]);
                            
                            return {isError: false};
                        }
                    }
                    catch(error) {
                        await submitDatabaseWriteJob('UPDATE videos SET is_indexing = ? WHERE video_id = ?', [false, videoId]);

                        if(error.isAxiosError && error.response != null && error.response.status === 413) {
                            const kilobytes = Math.ceil(error.request._contentLength / 1024);

                            throw new Error(`your request size (<b>${kilobytes}kb</b>) exceeds the maximum allowed size (<b>1mb</b>)<br>try using smaller node and video images`);
                        }
                        else {
                            throw new Error('an error occurred while adding to the MoarTube Indexer');
                        }
                    }
                }
                else {
                    throw new Error('videos have to be published before they can be indexed');
                }
            }
            else {
                throw new Error('that video does not exist');
            }
        }
        else {
            throw new Error('you must agree to the terms of service');
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdIndexRemove_POST(videoId, cloudflareTurnstileToken) {
    if(isVideoIdValid(videoId, false) && isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, false)) {
        const video = await performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId]);

        if(video != null) {
            await performNodeIdentification();

            const nodeIdentification = getNodeIdentification();
            
            const moarTubeTokenProof = nodeIdentification.moarTubeTokenProof;
            
            const data = {
                videoId: videoId,
                moarTubeTokenProof: moarTubeTokenProof,
                cloudflareTurnstileToken: cloudflareTurnstileToken
            };
            
            const indexerResponseData = await indexer_removeVideoFromIndex(data);

            if(indexerResponseData.isError) {
                throw new Error(indexerResponseData.message);
            }
            else {
                await submitDatabaseWriteJob('UPDATE videos SET is_indexed = ? WHERE video_id = ?', [false, videoId]);

                return {isError: false};
            }
        }
        else {
            throw new Error('video does not exist');
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdAlias_GET(videoId) {
    if(isVideoIdValid(videoId, false)) {
        const nodeSettings = getNodeSettings();

        const video = await performDatabaseReadJob_GET('SELECT is_indexed FROM videos WHERE video_id = ?', [videoId]);
        
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

                return {isError: false, videoAliasUrl: videoAliasUrl};
            }
            else {
                throw new Error('that video is not indexed');
            }
        }
        else {
            throw new Error('video does not exist');
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function search_GET(searchTerm, sortTerm, tagTerm, tagLimit, timestamp) {
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

        const videos = await performDatabaseReadJob_ALL(query, params);

        if(sortTerm === 'latest') {
            videos.sort(function compareByTimestampDescending(a, b) {
                return b.creation_timestamp - a.creation_timestamp;
            });
        }
        else if(sortTerm === 'popular') {
            videos.sort(function compareByTimestampDescending(a, b) {
                return b.views - a.views;
            });
        }
        else if(sortTerm === 'oldest') {
            videos.sort(function compareByTimestampDescending(a, b) {
                return a.creation_timestamp - b.creation_timestamp;
            });
        }

        let searchResults = [];
        
        if(tagTerm.length === 0) {
            if(tagLimit === 0) {
                searchResults = videos;
            }
            else {
                searchResults = videos.slice(0, tagLimit);
            }
        }
        else {
            for(const video of videos) {
                const tagsArray = video.tags.split(',');

                if (tagsArray.includes(tagTerm) && !searchResults.includes(video)) {
                    searchResults.push(video);
                }

                if(tagLimit !== 0 && searchResults.length === tagLimit) {
                    break;
                }
            }
        }
        
        return {isError: false, searchResults: searchResults};
    }
    else {
        throw new Error('invalid parameters');
    }
}

function videoIdThumbnail_POST(videoId) {
    if(isVideoIdValid(videoId, false)) {
        try {
            cloudflare_purgeVideoThumbnailImages([videoId]);
        }
        catch(error) {
            logDebugMessageToConsole(null, error, null);
        }
        
        return {isError: false};
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdPreview_POST(videoId) {
    if(isVideoIdValid(videoId, false)) {
        try {
            cloudflare_purgeVideoPreviewImages([videoId]);
        }
        catch(error) {
            logDebugMessageToConsole(null, error, null);
        }

        await submitDatabaseWriteJob('UPDATE videos SET is_index_outdated = CASE WHEN is_indexed = ? THEN ? ELSE is_index_outdated END WHERE video_id = ?', [true, true, videoId]);
        
        return {isError: false};
    }
    else {
        throw new Error('invalid parameters');
    }
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

async function videoIdLengths_POST(videoId, lengthSeconds, lengthTimestamp) {
    if(isVideoIdValid(videoId, false)) {
        await submitDatabaseWriteJob('UPDATE videos SET length_seconds = ?, length_timestamp = ?, is_index_outdated = CASE WHEN is_indexed = ? THEN ? ELSE is_index_outdated END WHERE video_id = ?', [lengthSeconds, lengthTimestamp, true, true, videoId]);
        
        return {isError: false};
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdData_GET(videoId) {
    if(isVideoIdValid(videoId, false)) {
        const video = await performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId]);

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
            const isStreamRecordedRemotely = video.is_stream_recorded_remotely;
            const timestamp = video.creation_timestamp;
            const outputs = JSON.parse(video.outputs);
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
                isStreamRecordedRemotely: isStreamRecordedRemotely,
                timestamp: timestamp,
                videoAliasUrl: videoAliasUrl,
                outputs: outputs,
                meta: meta
            };
        
            return {isError: false, videoData: videoData};
        }
        else {
            throw new Error('that video does not exist');
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function delete_POST(videoIds) {
    if(isVideoIdsValid(videoIds)) {
        await submitDatabaseWriteJob('DELETE FROM videos WHERE (is_importing = false AND is_publishing = false AND is_streaming = false) AND video_id IN (' + videoIds.map(() => '?').join(',') + ')', videoIds);

        const nonDeletedVideos = await performDatabaseReadJob_ALL('SELECT * FROM videos WHERE (is_importing = true OR is_publishing = true OR is_streaming = true) AND video_id IN (' + videoIds.map(() => '?').join(',') + ')', videoIds);
        
        const nonDeletedVideoIds = nonDeletedVideos.map(video => video.video_id);
        const deletedVideoIds = videoIds.filter(videoId => !nonDeletedVideoIds.includes(videoId));

        await submitDatabaseWriteJob('DELETE FROM comments WHERE video_id IN (' + deletedVideoIds.map(() => '?').join(',') + ')', deletedVideoIds);

        const nodeSettings = getNodeSettings();

        if(nodeSettings.storageConfig.storageMode === 'filesystem') {
            for(const deletedVideoId of deletedVideoIds) {
                const videoDirectoryPath = path.join(getVideosDirectoryPath(), deletedVideoId);

                await deleteDirectoryRecursive(videoDirectoryPath);
            }
        }

        try {
            const allVideos = await performDatabaseReadJob_ALL('SELECT * FROM videos', []);
            
            const allVideoIds = allVideos.map(video => video.video_id);
            const allTags = Array.from(new Set(allVideos.map(video => video.tags.split(',')).flat()));

            cloudflare_purgeNodePage(allTags);
            cloudflare_purgeEmbedVideoPages(deletedVideoIds);
            cloudflare_purgeAdaptiveVideos(deletedVideoIds);
            cloudflare_purgeProgressiveVideos(deletedVideoIds);
            cloudflare_purgeWatchPages(allVideoIds);
        }
        catch(error) {
            logDebugMessageToConsole(null, error, null);
        }

        return {isError: false, deletedVideoIds: deletedVideoIds, nonDeletedVideoIds: nonDeletedVideoIds};
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function finalize_POST(videoIds) {
    if(isVideoIdsValid(videoIds)) {
        await submitDatabaseWriteJob('UPDATE videos SET is_finalized = 1 WHERE (is_importing = false AND is_publishing = false AND is_streaming = false) AND video_id IN (' + videoIds.map(() => '?').join(',') + ')', videoIds);

        const videos = await performDatabaseReadJob_ALL('SELECT * FROM videos WHERE (is_importing = true OR is_publishing = true OR is_streaming = true) AND video_id IN (' + videoIds.map(() => '?').join(',') + ')', videoIds)

        const finalizedVideoIds = [];
        const nonFinalizedVideoIds = [];

        for(const video of videos) {
            const videoId = video.video_id;
            
            nonFinalizedVideoIds.push(videoId);
        }

        for(const videoId of videoIds) {
            if(!nonFinalizedVideoIds.includes(videoId)) {
                finalizedVideoIds.push(videoId);
            }
        }
        
        return {isError: false, finalizedVideoIds: finalizedVideoIds, nonFinalizedVideoIds: nonFinalizedVideoIds};
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdComments_GET(videoId, type, sort, timestamp) {
    if(isVideoIdValid(videoId, false) && isCommentsTypeValid(type) && isSortValid(sort) && isTimestampValid(timestamp)) {
        let sortTerm;

        if(sort === 'ascending') {
            sortTerm = 'ASC';
        }
        else if(sort === 'descending') {
            sortTerm = 'DESC';
        }

        if(type === 'after') {
            const comments = await performDatabaseReadJob_ALL('SELECT * FROM comments WHERE video_id = ? AND timestamp > ? ORDER BY timestamp ' + sortTerm, [videoId, timestamp]);
            
            return {isError: false, comments: comments};
        }
        else if(type === 'before') {
            const comments = await performDatabaseReadJob_ALL('SELECT * FROM comments WHERE video_id = ? AND timestamp < ? ORDER BY timestamp ' + sortTerm, [videoId, timestamp]);
            
            return {isError: false, comments: comments};
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdCommentsCommentId_GET(videoId, commentId) {
    if(isVideoIdValid(videoId, false) && isCommentIdValid(commentId)) {
        const comment = await performDatabaseReadJob_GET('SELECT * FROM comments WHERE video_id = ? AND id = ?', [videoId, commentId]);

        if(comment != null) {
            return {isError: false, comment: comment};
        }
        else {
            throw new Error('that comment does not exist');
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdCommentsComment_POST(videoId, commentPlainText, timestamp, cloudflareTurnstileToken, cloudflareConnectingIp) {
    if(isVideoIdValid(videoId, false) && isVideoCommentValid(commentPlainText) && isTimestampValid(timestamp) && isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, true)) {
        let errorMessage;

        try {
            const nodeSettings = getNodeSettings();

            if(!nodeSettings.isCommentsEnabled) {
                errorMessage = 'commenting is currently disabled for this node';
            }
            else if(nodeSettings.isCloudflareTurnstileEnabled) {
                if(cloudflareTurnstileToken.length === 0) {
                    errorMessage = 'human verification was enabled on this MoarTube Node, please refresh your browser';
                }
                else {
                    await cloudflare_validateTurnstileToken(cloudflareTurnstileToken, cloudflareConnectingIp);
                }
            }
        }
        catch(error) {
            throw error;
        }

        if(errorMessage == null) {
            const commentPlainTextSanitized = sanitizeHtml(commentPlainText, {allowedTags: [], allowedAttributes: {}});
            const commentTimestamp = Date.now();
            
            await submitDatabaseWriteJob('INSERT INTO comments(video_id, comment_plain_text_sanitized, timestamp) VALUES (?, ?, ?)', [videoId, commentPlainTextSanitized, commentTimestamp]);

            await submitDatabaseWriteJob('UPDATE videos SET comments = comments + 1 WHERE video_id = ?', [videoId]);

            try {
                cloudflare_purgeWatchPages([videoId]);
            }
            catch(error) {
                logDebugMessageToConsole(null, error, null);
            }

            const comments = await performDatabaseReadJob_ALL('SELECT * FROM comments WHERE video_id = ? AND timestamp > ? ORDER BY timestamp ASC', [videoId, timestamp]);

            let commentId = 0;
                
            for (let i = comments.length - 1; i >= 0; i--) {
                if(commentTimestamp === comments[i].timestamp) {
                    commentId = comments[i].id;
                    break;
                }
            }
            
            return {isError: false, commentId: commentId, comments: comments};
        }
        else {
            throw new Error(errorMessage);
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdCommentsCommentIdDelete_DELETE(videoId, commentId, timestamp) {
    if(isVideoIdValid(videoId, false) && isCommentIdValid(commentId) && isTimestampValid(timestamp)) {
        const comment = await performDatabaseReadJob_GET('SELECT * FROM comments WHERE id = ? AND video_id = ? AND timestamp = ?', [commentId, videoId, timestamp])

        if(comment != null) {
            await submitDatabaseWriteJob('DELETE FROM comments WHERE id = ? AND video_id = ? AND timestamp = ?', [commentId, videoId, timestamp]);

            await submitDatabaseWriteJob('UPDATE videos SET comments = comments - 1 WHERE video_id = ? AND comments > 0', [videoId]);

            try {
                cloudflare_purgeWatchPages([videoId]);
            }
            catch(error) {
                logDebugMessageToConsole(null, error, null);
            }

            return {isError: false};
        }
        else {
            throw new Error('that comment does not exist');
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdLike_POST(videoId, cloudflareTurnstileToken, cloudflareConnectingIp) {
    if(isVideoIdValid(videoId, false) && isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, true)) {
        let errorMessage;

        try {
            const nodeSettings = getNodeSettings();

            if(!nodeSettings.isLikesEnabled) {
                errorMessage = 'liking is currently disabled for this node';
            }
            else if(nodeSettings.isCloudflareTurnstileEnabled) {
                if(cloudflareTurnstileToken.length === 0) {
                    errorMessage = 'human verification was enabled on this MoarTube Node, please refresh your browser';
                }
                else {
                    await cloudflare_validateTurnstileToken(cloudflareTurnstileToken, cloudflareConnectingIp);
                }
            }
        }
        catch(error) {
            throw error;
        }

        if(errorMessage == null) {
            await submitDatabaseWriteJob('UPDATE videos SET likes = likes + 1 WHERE video_id = ?', [videoId]);

            try {
                cloudflare_purgeWatchPages([videoId]);
            }
            catch(error) {
                logDebugMessageToConsole(null, error, null);
            }

            return {isError: false};
        }
        else {
            throw new Error(errorMessage);
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdDislike_POST(videoId, cloudflareTurnstileToken, cloudflareConnectingIp) {
    if(isVideoIdValid(videoId, false) && isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, true)) {
        let errorMessage;

        try {
            const nodeSettings = getNodeSettings();
            
            if(!nodeSettings.isDislikesEnabled) {
                errorMessage = 'disliking is currently disabled for this node';
            }
            else if(nodeSettings.isCloudflareTurnstileEnabled) {
                if(cloudflareTurnstileToken.length === 0) {
                    errorMessage = 'human verification was enabled on this MoarTube Node, please refresh your browser';
                }
                else {
                    await cloudflare_validateTurnstileToken(cloudflareTurnstileToken, cloudflareConnectingIp);
                }
            }
        }
        catch(error) {
            throw error;
        }

        if(errorMessage == null) {
            await submitDatabaseWriteJob('UPDATE videos SET dislikes = dislikes + 1 WHERE video_id = ?', [videoId]);
            
            try {
                cloudflare_purgeWatchPages([videoId]);
            }
            catch(error) {
                logDebugMessageToConsole(null, error, null);
            }

            return {isError: false};
        }
        else {
            throw new Error(errorMessage);
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function recommended_GET() {
    const recommendedVideos = await performDatabaseReadJob_ALL('SELECT * FROM videos WHERE (is_published = ? OR is_live = ?) ORDER BY creation_timestamp DESC', [true, true]);
    
    return {isError: false, recommendedVideos: recommendedVideos};
}

async function tags_GET() {
    const videos = await performDatabaseReadJob_ALL('SELECT * FROM videos WHERE (is_published = ? OR is_live = ?) ORDER BY creation_timestamp DESC', [true, true]);

    const tagsArray = [];

    for(const video of videos) {
        const tags = video.tags.split(',');
        
        for(const tag of tags) {
            if (!tagsArray.includes(tag)) {
                tagsArray.push(tag);
            }
        }
    }

    return {isError: false, tags: tagsArray};
}

async function tagsAll_GET() {
    const videos = await performDatabaseReadJob_ALL('SELECT * FROM videos ORDER BY creation_timestamp DESC', []);

    const tagsArray = [];

    for(const video of videos) {
        const tags = video.tags.split(',');

        for(const tag of tags) {
            if (!tagsArray.includes(tag)) {
                tagsArray.push(tag);
            }
        }
    }
        
    return {isError: false, tags: tagsArray};
}

async function videoIdReport_POST(videoId, email, reportType, message, cloudflareTurnstileToken, cloudflareConnectingIp) {
    if(isVideoIdValid(videoId, false) && isReportEmailValid(email) && isReportTypeValid(reportType) && isReportMessageValid(message) && isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, true)) {
        let errorMessage;

        try {
            const nodeSettings = getNodeSettings();

            if(!nodeSettings.isReportsEnabled) {
                errorMessage = 'reporting is currently disabled for this node';
            }
            else if(nodeSettings.isCloudflareTurnstileEnabled) {
                if(cloudflareTurnstileToken.length === 0) {
                    errorMessage = 'human verification was enabled on this MoarTube Node, please refresh your browser';
                }
                else {
                    await cloudflare_validateTurnstileToken(cloudflareTurnstileToken, cloudflareConnectingIp);
                }
            }
        }
        catch(error) {
            throw error;
        }

        if(errorMessage == null) {
            email = sanitizeHtml(email, {allowedTags: [], allowedAttributes: {}});
            message = sanitizeHtml(message, {allowedTags: [], allowedAttributes: {}});

            const video = await performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId])

            if(video != null) {
                const creationTimestamp = video.creation_timestamp;
                
                await submitDatabaseWriteJob('INSERT INTO videoreports(timestamp, video_timestamp, video_id, email, type, message) VALUES (?, ?, ?, ?, ?, ?)', [Date.now(), creationTimestamp, videoId, email, reportType, message]);
                
                return {isError: false};
            }
            else {
                throw new Error('that video does not exist');
            }
        }
        else {
            throw new Error(errorMessage);
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

let viewCounter = 0;
let viewCounterIncrementTimer;
async function videoIdViewsIncrement_GET(videoId) {
    if(isVideoIdValid(videoId, false)) {
        viewCounter++;
        
        clearTimeout(viewCounterIncrementTimer);
        
        viewCounterIncrementTimer = setTimeout(async function() {
            const viewCounterTemp = viewCounter;
            
            viewCounter = 0;
            
            await submitDatabaseWriteJob('UPDATE videos SET views = views + ?, is_index_outdated = CASE WHEN is_indexed = ? THEN ? ELSE is_index_outdated END WHERE video_id = ?', [viewCounterTemp, true, true, videoId]);
        }, 500);

        const video = await performDatabaseReadJob_GET('SELECT views FROM videos WHERE video_id = ?', [videoId]);

        if(video != null) {
            const views = video.views + viewCounter

            return {isError: false, views: views};
        }
        else{
            throw new Error('that video does not exist');
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdWatch_GET(videoId) {
    if(isVideoIdValid(videoId, false)) {
        const video = await performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId]);
        
        if(video != null) {
            const outputs = JSON.parse(video.outputs);

            let manifestType;

            if(video.is_streaming) {
                manifestType = 'dynamic';
            }
            else {
                manifestType = 'static';
            }

            const externalVideosBaseUrl = getExternalVideosBaseUrl();

            const adaptiveSources = [];
            const progressiveSources = [];
            const sourcesFormatsAndResolutions = {m3u8: [], mp4: [], webm: [], ogv: []};

            const isHlsAvailable = outputs.m3u8.length > 0;
            const isMp4Available = outputs.mp4.length > 0;
            const isWebmAvailable = outputs.webm.length > 0;
            const isOgvAvailable = outputs.ogv.length > 0;

            for (const format in outputs) {
                if (outputs.hasOwnProperty(format)) {
                    const resolutions = outputs[format];

                    for (const resolution of resolutions) {
                        if(format === 'm3u8') {
                            const src = externalVideosBaseUrl + '/external/videos/' + videoId + '/adaptive/m3u8/' + manifestType + '/manifests/manifest-' + resolution + '.m3u8';
                            
                            const source = {src: src, type: 'application/vnd.apple.mpegurl'};
                            
                            adaptiveSources.push(source);
                        }
                        else {
                            const src = externalVideosBaseUrl + '/external/videos/' + videoId + '/progressive/' + format + '/' + resolution + '.' + format;
                            
                            let source;

                            if(format === 'mp4') {
                                source = {src: src, type: 'video/mp4'};
                            }
                            else if(format === 'webm') {
                                source = {src: src, type: 'video/webm'};
                            }
                            else if(format === 'ogv') {
                                source = {src: src, type: 'video/ogg'};
                            }

                            if(source != null) {
                                progressiveSources.push(source);
                            }
                        }

                        sourcesFormatsAndResolutions[format].push(resolution);
                    }
                }
            }

            if(adaptiveSources.length > 0) {
                const src = getExternalVideosBaseUrl() + '/external/videos/' + videoId + '/adaptive/m3u8/' + manifestType + '/manifests/manifest-master.m3u8';
                
                const source = {src: src, type: 'application/vnd.apple.mpegurl'};
                
                adaptiveSources.unshift(source);
            }

            return {isError: false, video: {
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
                sourcesFormatsAndResolutions: sourcesFormatsAndResolutions,
                externalVideosBaseUrl: externalVideosBaseUrl
            }};
        }
        else {
            throw new Error('that video does not exist');
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function dataAll() {
    const videos = await performDatabaseReadJob_ALL('SELECT video_id, outputs FROM videos', []);

    return videos;
}

module.exports = {
    import_POST,
    imported_POST,
    videoIdImportingStop_POST,
    publishing_POST,
    published_POST,
    formatResolutionPublished_POST,
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
    videoIdWatch_GET,
    dataAll
};
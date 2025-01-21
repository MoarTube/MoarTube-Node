const fs = require('fs');
const path = require('path');

const { logDebugMessageToConsole } = require('../utils/logger');
const { getVideosDirectoryPath, getPublicDirectoryPath } = require('../utils/paths');
const { generateVideoId, sanitizeTagsSpaces, websocketNodeBroadcast, deleteDirectoryRecursive, getNodeSettings, deleteFile } = require('../utils/helpers');
const { 
    isTitleValid, isDescriptionValid, isTagsValid, isPortValid, isVideoIdValid, isAdaptiveFormatValid, isResolutionValid, isSegmentNameValid, isBooleanValid, 
    isNetworkAddressValid, isChatHistoryLimitValid 
} = require('../utils/validators');
const { performDatabaseReadJob_ALL, performDatabaseReadJob_GET, submitDatabaseWriteJob } = require('../utils/database');

const { endStreamedHlsManifestFiles } = require('../utils/filesystem');
const { 
    cloudflare_purgeAllWatchPages, cloudflare_purgeNodePage
} = require('../utils/cloudflare-communications');

async function start_POST(title, description, tags, rtmpPort, uuid, isRecordingStreamRemotely, isRecordingStreamLocally, networkAddress, resolution, videoId) {
    if(!isTitleValid(title)) {
        throw new Error('title is not valid');
    }
    else if(!isDescriptionValid(description)) {
        throw new Error('description is not valid');
    }
    else if(!isTagsValid(tags)) {
        throw new Error('tags are not valid');
    }
    else if(!isPortValid(rtmpPort)) {
        throw new Error('rtmp port not valid');
    }
    else if(uuid !== 'moartube') {
        throw new Error('uuid not valid');
    }
    else if(!isBooleanValid(isRecordingStreamRemotely)) {
        throw new Error('isRecordingStreamRemotely not valid');
    }
    else if(!isBooleanValid(isRecordingStreamLocally)) {
        throw new Error('isRecordingStreamLocally not valid');
    }
    else if(!isNetworkAddressValid(networkAddress)) {
        throw new Error('networkAddress not valid');
    }
    else if(!isResolutionValid(resolution)) {
        throw new Error('resolution not valid');
    }
    else if(!isVideoIdValid(videoId, true)) {
        throw new Error('videoId not valid');
    }
    else {
        let isResumingStream = true;

        if(videoId === '') {
            isResumingStream = false;

            videoId = await generateVideoId();
        }

        const tagsSanitized = sanitizeTagsSpaces(tags);

        const nodeSettings = getNodeSettings();

        if(nodeSettings.storageConfig.storageMode === 'filesystem') {
            if(isResumingStream) {
                await deleteDirectoryRecursive(path.join(getVideosDirectoryPath(), videoId));
            }
            
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
            fs.mkdirSync(path.join(getVideosDirectoryPath(), videoId + '/adaptive/m3u8/' + resolution), { recursive: true });

            fs.copyFileSync(publicThumbnailImageFilePath, videoThumbnailImageFilePath);
            fs.copyFileSync(publicPreviewImageFilePath, videoPreviewImageFilePath);
            fs.copyFileSync(publicPosterImageFilePath, videoPosterImageFilePath);
        }

        let query;
        let parameters;

        if (isResumingStream) {
            const video = await performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId]);
            
            if(video != null) {
                const outputs = JSON.stringify({'m3u8': [resolution], 'mp4': [], 'webm': [], 'ogv': []});

                let meta = JSON.parse(video.meta);

                meta.rtmpPort = rtmpPort;
                meta.networkAddress = networkAddress;
                meta.resolution = resolution;
                meta.isRecordingStreamRemotely = isRecordingStreamRemotely;
                meta.isRecordingStreamLocally = isRecordingStreamLocally;

                meta = JSON.stringify(meta);

                query = 'UPDATE videos SET title = ?, description = ?, tags = ?, length_seconds = ?, length_timestamp = ?, views = ?, comments = ?, likes = ?, dislikes = ?, bandwidth = ?, is_publishing = ?, is_published = ?, is_streaming = ?, is_streamed = ?, is_stream_recorded_remotely = ?, is_stream_recorded_locally = ?, is_error = ?, outputs = ?, meta = ?, creation_timestamp = ? WHERE video_id = ?';
                parameters = [title, description, tags, 0, '', 0, 0, 0, 0, 0, false, false, true, false, isRecordingStreamRemotely, isRecordingStreamLocally, false, outputs, meta, Date.now(), videoId];
            }
            else {
                throw new Error('video with id does not exist: ' + videoId);
            }
        }
        else {
            const outputs = JSON.stringify({'m3u8': [resolution], 'mp4': [], 'webm': [], 'ogv': []});

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

            query = 'INSERT INTO videos(video_id, source_file_extension, title, description, tags, length_seconds, length_timestamp, views, comments, likes, dislikes, bandwidth, is_importing, is_imported, is_publishing, is_published, is_streaming, is_streamed, is_stream_recorded_remotely, is_stream_recorded_locally, is_live, is_indexing, is_indexed, is_index_outdated, is_error, is_finalized, is_hidden, is_passworded, password, is_comments_enabled, is_likes_enabled, is_dislikes_enabled, is_reports_enabled, is_live_chat_enabled, outputs, meta, creation_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
            parameters = [videoId, '', title, description, tags, 0, '', 0, 0, 0, 0, 0, false, false, false, false, true, false, isRecordingStreamRemotely, isRecordingStreamLocally, true, false, false, false, false, false, false, false, '', true, true, true, true, true, outputs, meta, Date.now()];
        }

        await submitDatabaseWriteJob(query, parameters);
        
        if (isResumingStream) {
            await submitDatabaseWriteJob('DELETE FROM comments WHERE video_id = ?', [videoId]);
        }

        cloudflare_purgeAllWatchPages();
        cloudflare_purgeNodePage();

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

        return {isError: false, videoId: videoId};
    }
}

async function videoIdStop_POST(videoId) {
    if(isVideoIdValid(videoId, false)) {
        await submitDatabaseWriteJob('UPDATE videos SET is_streaming = ?, is_streamed = ?, is_index_outdated = CASE WHEN is_indexed = ? THEN ? ELSE is_index_outdated END WHERE video_id = ?', [false, true, true, true, videoId]);
        
        const nodeSettings = getNodeSettings();

        const storageMode = nodeSettings.storageConfig.storageMode;

        if(storageMode === 'filesystem') {
            await endStreamedHlsManifestFiles();
        }

        const video = await performDatabaseReadJob_GET('SELECT is_stream_recorded_remotely FROM videos WHERE video_id = ?', [videoId]);

        if(video != null) {
            if(video.is_stream_recorded_remotely) {
                await submitDatabaseWriteJob('UPDATE videos SET is_published = ? WHERE video_id = ?', [true, videoId]);
            }
            else {
                if(storageMode === 'filesystem') {
                    const m3u8DirectoryPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/m3u8');
                    
                    await deleteDirectoryRecursive(m3u8DirectoryPath);
                }
            }
        }

        await submitDatabaseWriteJob('DELETE FROM livechatmessages WHERE video_id = ?', [videoId]);

        cloudflare_purgeAllWatchPages();
        cloudflare_purgeNodePage();
        
        return {isError: false};
    }
    else {
        throw new Error('video id is not valid')
    }
}

async function videoIdAdaptiveFormatResolutionSegmentsRemove_POST(videoId, format, resolution, segmentName) {
    if(isVideoIdValid(videoId, false) && isAdaptiveFormatValid(format) && isResolutionValid(resolution) && isSegmentNameValid(segmentName)) {
        const segmentPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/' + format + '/' + resolution + '/' + segmentName);

        try {
            await deleteFile(segmentPath);
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

async function videoIdBandwidth_GET(videoId) {
    if(isVideoIdValid(videoId, false)) {
        const video = await performDatabaseReadJob_GET('SELECT bandwidth FROM videos WHERE video_id = ?', [videoId]);

        if(video != null) {
            const bandwidth = video.bandwidth;
            
            return {isError: false, bandwidth: bandwidth};
        }
        else {
            throw new Error('that video does not exist');
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function videoIdChatSettings_POST(videoId, isChatHistoryEnabled, chatHistoryLimit) {
    if(isVideoIdValid(videoId, false) && isBooleanValid(isChatHistoryEnabled) && isChatHistoryLimitValid(chatHistoryLimit)) {
        const video = await performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId]);

        if(video != null) {
            const meta = JSON.parse(video.meta);
            
            meta.chatSettings.isChatHistoryEnabled = isChatHistoryEnabled;
            meta.chatSettings.chatHistoryLimit = chatHistoryLimit;
            
            await submitDatabaseWriteJob('UPDATE videos SET meta = ? WHERE video_id = ?', [JSON.stringify(meta), videoId]);

            if(!isChatHistoryEnabled) {
                await submitDatabaseWriteJob('DELETE FROM livechatmessages WHERE video_id = ?', [videoId]);
            }
            else if(chatHistoryLimit !== 0) {
                await submitDatabaseWriteJob('DELETE FROM livechatmessages WHERE chat_message_id NOT IN (SELECT chat_message_id FROM livechatmessages where video_id = ? ORDER BY chat_message_id DESC LIMIT ?)', [videoId, chatHistoryLimit]);
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

async function videoIdChatHistory_GET(videoId) {
    if(isVideoIdValid(videoId, false)) {
        const chatHistory = await performDatabaseReadJob_ALL('SELECT * FROM livechatmessages WHERE video_id = ?', [videoId]);

        return {isError: false, chatHistory: chatHistory};
    }
    else {
        throw new Error('invalid parameters');
    }
}

module.exports = {
    start_POST,
    videoIdStop_POST,
    videoIdAdaptiveFormatResolutionSegmentsRemove_POST,
    videoIdBandwidth_GET,
    videoIdChatSettings_POST,
    videoIdChatHistory_GET
}
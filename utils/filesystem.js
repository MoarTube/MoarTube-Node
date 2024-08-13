const fs = require('fs');
const path = require('path');

const { deleteDirectoryRecursive } = require('./helpers');
const { logDebugMessageToConsole } = require('./logger');
const { getVideosDirectoryPath } = require('./paths');
const { performDatabaseReadJob_ALL, performDatabaseReadJob_GET } = require('./database');

function removeOrphanedVideoDirectories() {
    return new Promise(async function(resolve, reject) {
        performDatabaseReadJob_ALL('SELECT video_id FROM videos', [])
        .then(videos => {
            const videoIds = [];
            
            for(const video of videos) {
                const videoId = video.video_id;
                
                videoIds.push(videoId);
            }
            
            const videosDirectoryPath = getVideosDirectoryPath();

            fs.readdir(videosDirectoryPath, (error, videoDirectories) => {
                if(error) {
                    logDebugMessageToConsole(null, error, new Error().stack, true);
                }
                else {
                    for(const videoDirectory of videoDirectories) {
                        if(!videoIds.includes(videoDirectory)) {
                            const videoDirectoryPath = path.join(videosDirectoryPath, videoDirectory);

                            deleteDirectoryRecursive(videoDirectoryPath);
                        }
                    }
                }

                resolve();
            });
        })
        .catch(error => {
            logDebugMessageToConsole(null, error, new Error().stack, true);
            
            resolve();
        });
    });
}

function endStreamedHlsManifestFiles() {
    return new Promise(async function(resolve, reject) {
        performDatabaseReadJob_ALL('SELECT video_id, is_stream_recorded_remotely FROM videos WHERE is_streamed = 1', [])
        .then(rows => {
            for(let i = 0; i < rows.length; i++) {
                const row = rows[i];
                
                if(row.is_stream_recorded_remotely) {
                    const videoId = row.video_id;
                    
                    const m3u8Directory = path.join(getVideosDirectoryPath(), videoId + '/adaptive/m3u8');
                    
                    const manifest2160pFilePath = path.join(m3u8Directory, '/manifest-2160p.m3u8');
                    const manifest1440pFilePath = path.join(m3u8Directory, '/manifest-1440p.m3u8');
                    const manifest1080pFilePath = path.join(m3u8Directory, '/manifest-1080p.m3u8');
                    const manifest720pFilePath = path.join(m3u8Directory, '/manifest-720p.m3u8');
                    const manifest480pFilePath = path.join(m3u8Directory, '/manifest-480p.m3u8');
                    const manifest360pFilePath = path.join(m3u8Directory, '/manifest-360p.m3u8');
                    const manifest240pFilePath = path.join(m3u8Directory, '/manifest-240p.m3u8');
                    
                    const manifestFilePaths = [
                        manifest2160pFilePath,
                        manifest1440pFilePath,
                        manifest1080pFilePath,
                        manifest720pFilePath,
                        manifest480pFilePath,
                        manifest360pFilePath,
                        manifest240pFilePath
                    ];
                    
                    const HLS_END_LIST_TAG = '#EXT-X-ENDLIST';
                    
                    for(let j = 0; j < manifestFilePaths.length; j++) {
                        const manifestFilePath = manifestFilePaths[j];
                        if (fs.existsSync(manifestFilePath)) {
                            const manifestFileText = fs.readFileSync(manifestFilePath, 'utf8')
                            if(!manifestFileText.includes(HLS_END_LIST_TAG)) {
                                const manifestFileTextModified = manifestFileText.trim() + '\n' + HLS_END_LIST_TAG + '\n';
                                fs.writeFileSync(manifestFilePath, manifestFileTextModified);
                            }
                        }
                    }
                }
            }
            
            resolve();
        })
        .catch(error => {
            logDebugMessageToConsole(null, error, new Error().stack, true);

            resolve();
        });
    });
}

function updateHlsVideoMasterManifestFile(videoId) {
    return new Promise(async function(resolve, reject) {
        const hlsVideoDirectoryPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/m3u8');
        const masterManifestFilePath = path.join(hlsVideoDirectoryPath, '/manifest-master.m3u8');
        
        let manifestFileString = '#EXTM3U\n#EXT-X-VERSION:3\n';

        performDatabaseReadJob_GET('SELECT is_streaming FROM videos WHERE video_id = ?', [videoId])
        .then(videoData => {
            if(videoData != null) {
                const is_streaming = videoData.is_streaming;

                let manifestType;

                if(is_streaming) {
                    manifestType = 'dynamic';
                }
                else {
                    manifestType = 'static';
                }

                fs.readdirSync(hlsVideoDirectoryPath).forEach(fileName => {
                    const filePath = path.join(hlsVideoDirectoryPath, fileName);
                    if (!fs.lstatSync(filePath).isDirectory()) {
                        if(fileName === 'manifest-240p.m3u8') {
                            manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=250000,RESOLUTION=426x240\n';
                            manifestFileString += '/external/videos/' + videoId + '/adaptive/' + manifestType + '/m3u8/manifests/manifest-240p.m3u8\n';
                        }
                        else if(fileName === 'manifest-360p.m3u8') {
                            manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360\n';
                            manifestFileString += '/external/videos/' + videoId + '/adaptive/' + manifestType + '/m3u8/manifests/manifest-360p.m3u8\n';
                        }
                        else if(fileName === 'manifest-480p.m3u8') {
                            manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480\n';
                            manifestFileString += '/external/videos/' + videoId + '/adaptive/' + manifestType + '/m3u8/manifests/manifest-480p.m3u8\n';
                        }
                        else if(fileName === 'manifest-720p.m3u8') {
                            manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720\n';
                            manifestFileString += '/external/videos/' + videoId + '/adaptive/' + manifestType + '/m3u8/manifests/manifest-720p.m3u8\n';
                        }
                        else if(fileName === 'manifest-1080p.m3u8') {
                            manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080\n';
                            manifestFileString += '/external/videos/' + videoId + '/adaptive/' + manifestType + '/m3u8/manifests/manifest-1080p.m3u8\n';
                        }
                        else if(fileName === 'manifest-1440p.m3u8') {
                            manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=2560x1440\n';
                            manifestFileString += '/external/videos/' + videoId + '/adaptive/' + manifestType + '/m3u8/manifests/manifest-1440p.m3u8\n';
                        }
                        else if(fileName === 'manifest-2160p.m3u8') {
                            manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=16000000,RESOLUTION=3840x2160\n'
                            manifestFileString += '/external/videos/' + videoId + '/adaptive/' + manifestType + '/m3u8/manifests/manifest-2160p.m3u8\n';
                        }
                    }
                });
                
                fs.writeFileSync(masterManifestFilePath, manifestFileString);

                resolve();
            }
            else {
                reject('updateHlsVideoMasterManifestFile failed: videoData is null for videoId: ' + videoId + '.');
            }
        })
        .catch(error => {
            logDebugMessageToConsole(null, error, new Error().stack, true);

            reject('updateHlsVideoMasterManifestFile failed: videoData is null for videoId: ' + videoId + '.');
        });
    });
}

module.exports = {
    removeOrphanedVideoDirectories,
    endStreamedHlsManifestFiles,
    updateHlsVideoMasterManifestFile
};
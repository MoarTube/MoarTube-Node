const fs = require('fs');
const path = require('path');

const { logDebugMessageToConsole } = require('./logger');
const { getVideosDirectoryPath } = require('./paths');
const { performDatabaseReadJob_ALL } = require('./database');

setInterval(function() {
    maintainFileSystem();
}, 5000);

function maintainFileSystem() {
    return new Promise(async function(resolve, reject) {
        await updateManifestFiles();
        await removeUnusedMasterManifests();
        
        resolve();
    });
}

function updateManifestFiles() {
    return new Promise(async function(resolve, reject) {
        performDatabaseReadJob_ALL('SELECT video_id, is_stream_recorded_remotely FROM videos WHERE is_streamed = 1', [])
        .then(rows => {
            for(var i = 0; i < rows.length; i++) {
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
                    
                    for(var j = 0; j < manifestFilePaths.length; j++) {
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

            reject();
        });
    });
}

function removeUnusedMasterManifests() {
    return new Promise(async function(resolve, reject) {
        performDatabaseReadJob_ALL('SELECT video_id FROM videos', [])
        .then(videos => {
            for(var i = 0; i < videos.length; i++) {
                const row = videos[i];
                
                const videoId = row.video_id;
                
                const m3u8Directory = path.join(getVideosDirectoryPath(), videoId + '/adaptive/m3u8');
                
                if (fs.existsSync(m3u8Directory)) {
                    fs.readdir(m3u8Directory, (error, files) => {
                        if(error) {
                            logDebugMessageToConsole(null, error, new Error().stack, true);
                        }
                        else {
                            if(files.length === 1 && files[0] === 'manifest-master.m3u8') {
                                const filePath = path.join(m3u8Directory, files[0]);
                                
                                fs.unlinkSync(filePath);
                            }
                        }
                    });
                }
            }
            
            resolve();
        })
        .catch(error => {
            logDebugMessageToConsole(null, error, new Error().stack, true);
            
            reject();
        });
    });
}

function updateHlsVideoMasterManifestFile(videoId) {
    const hlsVideoDirectoryPath = path.join(getVideosDirectoryPath(), videoId + '/adaptive/m3u8');
    const masterManifestFilePath = path.join(hlsVideoDirectoryPath, '/manifest-master.m3u8');
    
    var manifestFileString = '#EXTM3U\n#EXT-X-VERSION:3\n';

    fs.readdirSync(hlsVideoDirectoryPath).forEach(fileName => {
        const filePath = path.join(hlsVideoDirectoryPath, fileName);
        if (!fs.lstatSync(filePath).isDirectory()) {
            if(fileName === 'manifest-240p.m3u8') {
                manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=250000,RESOLUTION=426x240\n';
                manifestFileString += '/assets/videos/' + videoId + '/adaptive/m3u8/manifests/manifest-240p.m3u8\n';
            }
            else if(fileName === 'manifest-360p.m3u8') {
                manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360\n';
                manifestFileString += '/assets/videos/' + videoId + '/adaptive/m3u8/manifests/manifest-360p.m3u8\n';
            }
            else if(fileName === 'manifest-480p.m3u8') {
                manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480\n';
                manifestFileString += '/assets/videos/' + videoId + '/adaptive/m3u8/manifests/manifest-480p.m3u8\n';
            }
            else if(fileName === 'manifest-720p.m3u8') {
                manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720\n';
                manifestFileString += '/assets/videos/' + videoId + '/adaptive/m3u8/manifests/manifest-720p.m3u8\n';
            }
            else if(fileName === 'manifest-1080p.m3u8') {
                manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080\n';
                manifestFileString += '/assets/videos/' + videoId + '/adaptive/m3u8/manifests/manifest-1080p.m3u8\n';
            }
            else if(fileName === 'manifest-1440p.m3u8') {
                manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=2560x1440\n';
                manifestFileString += '/assets/videos/' + videoId + '/adaptive/m3u8/manifests/manifest-1440p.m3u8\n';
            }
            else if(fileName === 'manifest-2160p.m3u8') {
                manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=16000000,RESOLUTION=3840x2160\n'
                manifestFileString += '/assets/videos/' + videoId + '/adaptive/m3u8/manifests/manifest-2160p.m3u8\n';
            }
        }
    });
    
    fs.writeFileSync(masterManifestFilePath, manifestFileString);
}

module.exports = {
    updateHlsVideoMasterManifestFile
};
const fs = require('fs');
const path = require('path');

const { logDebugMessageToConsole } = require('./logger');
const { getVideosDirectoryPath } = require('./paths');
const { performDatabaseReadJob_ALL } = require('./database');

function endStreamedHlsManifestFiles() {
    return new Promise(async function(resolve, reject) {
        performDatabaseReadJob_ALL('SELECT video_id, is_stream_recorded_remotely, outputs FROM videos WHERE is_streamed = ?', [true])
        .then(videos => {
            for(const video of videos) {                
                if(video.is_stream_recorded_remotely) {
                    const videoId = video.video_id;
                    const outputs = JSON.parse(video.outputs);

                    const resolutions = outputs.m3u8;

                    const m3u8Directory = path.join(getVideosDirectoryPath(), videoId + '/adaptive/m3u8');

                    const HLS_END_LIST_TAG = '#EXT-X-ENDLIST';

                    for(const resolution of resolutions) {
                        const manifestFilePath = path.join(m3u8Directory, '/manifest-' + resolution + '.m3u8');

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
            logDebugMessageToConsole(null, error, new Error().stack);

            resolve();
        });
    });
}

module.exports = {
    endStreamedHlsManifestFiles
};
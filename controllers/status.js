const { logDebugMessageToConsole } = require('../utils/logger');
const { getNodeSettings } = require('../utils/helpers');
const { performDatabaseReadJob_GET, performDatabaseReadJob_ALL } = require('../utils/database');

function information_GET() {
    return new Promise(function(resolve, reject) {
        performDatabaseReadJob_GET('SELECT COUNT(*) AS videoCount FROM videos WHERE (is_published = 1 OR is_live = 1)', [])
        .then(row => {
            if(row != null) {
                const nodeVideoCount = row.videoCount;

                const nodeSettings = getNodeSettings();
                
                const nodeId = nodeSettings.nodeId;
                const nodeName = nodeSettings.nodeName;
                const nodeAbout = nodeSettings.nodeAbout;
                const publicNodeProtocol = nodeSettings.publicNodeProtocol;
                const publicNodeAddress = nodeSettings.publicNodeAddress;
                const publicNodePort = nodeSettings.publicNodePort;
                const cloudflareTurnstileSiteKey = nodeSettings.cloudflareTurnstileSiteKey;

                const information = {
                    nodeVideoCount: nodeVideoCount,
                    nodeId: nodeId, 
                    nodeName: nodeName, 
                    nodeAbout: nodeAbout, 
                    publicNodeProtocol: publicNodeProtocol, 
                    publicNodeAddress: publicNodeAddress, 
                    publicNodePort: publicNodePort,
                    cloudflareTurnstileSiteKey: cloudflareTurnstileSiteKey
                };
                
                resolve({isError: false, information: information});
            }
            else {
                resolve({isError: true, message: 'error communicating with the MoarTube node'});
            }
        })
        .catch(error => {
            resolve({isError: true, message: 'error communicating with the MoarTube node'});
        });
    });
}

function heartbeat_GET() {
    return new Promise(function(resolve, reject) {
        resolve({isError: false, timestamp: Date.now()});
    });
}

function videos_POST(videoIds) {
    return new Promise(function(resolve, reject) {
        if(videoIds != null && Array.isArray(videoIds) && videoIds.length <= 30) {
            const videoIdsString = videoIds.map(() => '?').join(',');

            performDatabaseReadJob_ALL('SELECT * FROM videos WHERE is_indexing = 0 AND video_id IN (' + videoIdsString + ')', videoIds)
            .then(videos => {
                const results = [];

                for(const video of videos) {
                    const videoId = video.video_id;
                    const isIndexed = video.is_indexed;

                    results.push({ videoId: videoId, isIndexed: isIndexed });
                }

                resolve({isError: false, results: results});
            })
            .catch(error => {
                logDebugMessageToConsole(null, error, new Error().stack, true);

                // no error message to report to the MoarTube Indexer because not trusted
                resolve({isError: true});
            });
        }
        else {
            // no error message to report to the MoarTube Indexer because not trusted
            resolve({isError: true});
        }
    });
}

module.exports = {
    information_GET,
    heartbeat_GET,
    videos_POST
};
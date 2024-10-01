const { cloudflare_purgeWatchPages, cloudflare_purgeNodePage } = require('../utils/cloudflare-communications');
const { logDebugMessageToConsole, getAuthenticationStatus } = require('../utils/helpers');
const { performDatabaseReadJob_ALL, performDatabaseReadJob_GET, submitDatabaseWriteJob } = require('../utils/database');

function linksAll_GET() {
    return new Promise(function(resolve, reject) {
        const query = 'SELECT * FROM links';
        const params = [];

        performDatabaseReadJob_ALL(query, params)
        .then(links => {
            resolve({isError: false, links: links});
        })
        .catch(error => {
            logDebugMessageToConsole(null, error, new Error().stack, true);

            resolve({isError: true, message: 'error communicating with the MoarTube node'});
        });
    });
}

function linksAdd_POST(url, svgGraphic) {
    return new Promise(function(resolve, reject) {
        const timestamp = Date.now();

        const query = 'INSERT INTO links(url, svg_graphic, timestamp) VALUES (?, ?, ?)';
        const params = [url, svgGraphic, timestamp];

        submitDatabaseWriteJob(query, params, function(isError) {
            if(isError) {
                resolve({isError: true, message: 'error communicating with the MoarTube node'});
            }
            else {
                performDatabaseReadJob_ALL('SELECT video_id FROM videos', [])
                .then(async videos => {
                    const videoIds = videos.map(video => video.video_id);
                    const tags = Array.from(new Set(videos.map(video => video.tags.split(',')).flat()));

                    cloudflare_purgeWatchPages(videoIds);
                    cloudflare_purgeNodePage(tags);
                })
                .catch(error => {
                    // do nothing
                });

                performDatabaseReadJob_GET('SELECT * FROM links WHERE timestamp = ?', [timestamp])
                .then(link => {
                    resolve({isError: false, link: link});
                })
                .catch(error => {
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                });
            }
        });
    });
}

function linksDelete_POST(linkId) {
    return new Promise(function(resolve, reject) {
        const query = 'DELETE FROM links WHERE link_id = ?';
        const params = [linkId];

        submitDatabaseWriteJob(query, params, function(isError) {
            if(isError) {
                resolve({isError: true, message: 'error communicating with the MoarTube node'});
            }
            else {
                performDatabaseReadJob_ALL('SELECT video_id FROM videos', [])
                .then(async videos => {
                    const videoIds = videos.map(video => video.video_id);
                    const tags = Array.from(new Set(videos.map(video => video.tags.split(',')).flat()));

                    cloudflare_purgeWatchPages(videoIds);
                    cloudflare_purgeNodePage(tags);
                })
                .catch(error => {
                    // do nothing
                });

                resolve({isError: false});
            }
        });
    });
}

module.exports = {
    linksAll_GET,
    linksAdd_POST,
    linksDelete_POST
}
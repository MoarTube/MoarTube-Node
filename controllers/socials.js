const { cloudflare_purgeWatchPages, cloudflare_purgeNodePage } = require('../utils/cloudflare-communications');
const { logDebugMessageToConsole, getAuthenticationStatus } = require('../utils/helpers');
const { performDatabaseReadJob_ALL, performDatabaseReadJob_GET, submitDatabaseWriteJob } = require('../utils/database');

function socialmediaAll_GET(req, res) {
    const query = 'SELECT * FROM socialMedias';
    const params = [];

    performDatabaseReadJob_ALL(query, params)
    .then(socialMedias => {
        res.send({isError: false, socialMedias: socialMedias});
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
}

function socialMediaAdd_POST(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const link = req.body.link;
            const svgGraphic = req.body.svgGraphic;

            const timestamp = Date.now();

            const query = 'INSERT INTO socialMedias(link, svg_graphic, timestamp) VALUES (?, ?, ?)';
            const params = [link, svgGraphic, timestamp];

            submitDatabaseWriteJob(query, params, function(isError) {
                if(isError) {
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
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

                    performDatabaseReadJob_GET('SELECT * FROM socialMedias WHERE timestamp = ?', [timestamp])
                    .then(socialMedia => {
                        res.send({isError: false, socialMedia: socialMedia});
                    })
                    .catch(error => {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    });
                }
            });
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

function socialMediaDelete_POST(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const socialMediaId = req.body.socialMediaId;

            const query = 'DELETE FROM socialMedias WHERE social_media_id = ?';
            const params = [socialMediaId];

            submitDatabaseWriteJob(query, params, function(isError) {
                if(isError) {
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
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

                    res.send({isError: false});
                }
            });
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

module.exports = {
    socialmediaAll_GET,
    socialMediaAdd_POST,
    socialMediaDelete_POST
}
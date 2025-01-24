const express = require('express');

const { 
    root_GET 
} = require('../controllers/watch');
const { 
    logDebugMessageToConsole 
} = require('../utils/logger');
const { 
    performAuthenticationCheck 
} = require('../middleware/authentication');

const router = express.Router();

router.get('/', performAuthenticationCheck(false), async (req, res) => {
    try {
        const videoId = req.query.v;

        const data = await root_GET(videoId);

        const adaptiveSources = data.videoData.video.adaptiveSources;
        const progressiveSources = data.videoData.video.progressiveSources;
        const isPublished = data.videoData.video.isPublished;
        const isStreaming = data.videoData.video.isStreaming;
        const isStreamed = data.videoData.video.isStreamed;
        const externalVideosBaseUrl = data.externalVideosBaseUrl;
        const externalResourcesBaseUrl = data.externalResourcesBaseUrl;

        if ((adaptiveSources.length === 0 && progressiveSources.length === 0) || (!isPublished && !isStreaming)) {
            if (isStreamed) {
                res.set('Cache-Control', 'public, s-maxage=86400');
            }
            else {
                res.set('Cache-Control', 'no-store');
            }
        }
        else {
            res.set('Cache-Control', 'public, s-maxage=86400');
        }

        res.render('watch', {
            informationData: data.informationData,
            linksData: data.linksData,
            cryptoWalletAddressesData: data.cryptoWalletAddressesData,
            videoData: data.videoData,
            recommendedVideosData: data.recommendedVideosData,
            commentsData: data.commentsData,
            externalVideosBaseUrl: externalVideosBaseUrl,
            externalResourcesBaseUrl: externalResourcesBaseUrl
        });
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.status(500).send('that video could not be loaded');
    }
});

module.exports = router;
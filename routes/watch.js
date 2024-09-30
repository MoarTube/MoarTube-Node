const express = require('express');

const { root_GET } = require('../controllers/watch');

const router = express.Router();

router.get('/', async (req, res) => {
    const videoId = req.query.v;

    const data = await root_GET(videoId);

    const adaptiveSources = data.videoData.video.adaptiveSources;
    const progressiveSources = data.videoData.video.progressiveSources;
    const isPublished = data.videoData.video.isPublished;
    const isStreaming = data.videoData.video.isStreaming;
    const isStreamed = data.videoData.video.isStreamed;

    if((adaptiveSources.length === 0 && progressiveSources.length === 0) || (!isPublished && !isStreaming)) {
        if(isStreamed) {
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
        socialMediasData: data.socialMediasData,
        cryptoWalletAddressesData: data.cryptoWalletAddressesData, 
        videoData: data.videoData, 
        recommendedVideosData: data.recommendedVideosData, 
        commentsData: data.commentsData
    });
});

module.exports = router;
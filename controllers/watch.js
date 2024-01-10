const { isVideoIdValid } = require('../utils/validators');
const { node_getInformation, node_getVideo, node_getComments, node_getRecommendedVideos } = require('../utils/node-communications');

async function root_GET(req, res) {
    const videoId = req.query.v;
    
    if(isVideoIdValid(videoId)) {
        const informationData = await node_getInformation();
        const videoData = await node_getVideo(videoId);
        const recommendedVideosData = await node_getRecommendedVideos();
        const commentsData = await node_getComments(videoId, Date.now(), 'after');

        res.render('watch', {informationData: informationData, videoData: videoData, recommendedVideosData: recommendedVideosData, commentsData: commentsData});
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
}

module.exports = {
    root_GET
};
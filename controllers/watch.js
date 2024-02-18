const { isVideoIdValid } = require('../utils/validators');
const { node_getInformation, node_getVideo, node_getComments, node_getRecommendedVideos } = require('../utils/node-communications');

async function root_GET(req, res) {
    const videoId = req.query.v;
    
    if(isVideoIdValid(videoId, false)) {
        const informationData = await node_getInformation();
        const videoData = await node_getVideo(videoId);
        const recommendedVideosData = await node_getRecommendedVideos();
        const commentsData = await node_getComments(videoId, Date.now(), 'before', 'ascending');

        const adaptiveSources = videoData.video.adaptiveSources;
        const progressiveSources = videoData.video.progressiveSources;
        const isPublished = videoData.video.isPublished;
        const isStreaming = videoData.video.isStreaming;
        const isStreamed = videoData.video.isStreamed;

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

        res.render('watch', {informationData: informationData, videoData: videoData, recommendedVideosData: recommendedVideosData, commentsData: commentsData});
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
}

module.exports = {
    root_GET
};
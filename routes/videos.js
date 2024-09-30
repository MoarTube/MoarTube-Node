const express = require('express');

const { 
    import_POST, imported_POST, videoIdImportingStop_POST, publishing_POST, published_POST, videoIdPublishingStop_POST, videoIdUpload_POST, videoIdStream_POST, error_POST, videoIdSourceFileExtension_POST,
    videoIdSourceFileExtension_GET, videoIdPublishes_GET, videoIdUnpublish_POST, videoIdData_POST, videoIdIndexAdd_POST, videoIdIndexRemove_POST,
    videoIdAlias_GET, search_GET, videoIdThumbnail_POST, videoIdPreview_POST, videoIdPoster_POST, videoIdLengths_POST, videoIdData_GET, delete_POST, finalize_POST, videoIdComments_GET, videoIdCommentsCommentId_GET, 
    videoIdCommentsComment_POST, videoIdCommentsCommentIdDelete_DELETE, videoIdLike_POST, videoIdDislike_POST, recommended_GET, tags_GET, tagsAll_GET, videoIdWatch_GET, videoIdReport_POST, commentsAll_GET,
    videoIdViewsIncrement_GET
} = require('../controllers/videos');

const router = express.Router();

router.post('/import', (req, res) => {
    import_POST(req, res);
});

router.post('/imported', (req, res) => {
    imported_POST(req, res);
});

router.post('/:videoId/importing/stop', (req, res) => {
    videoIdImportingStop_POST(req, res);
});

router.post('/publishing', (req, res) => {
    publishing_POST(req, res);
});

router.post('/published', (req, res) => {
    published_POST(req, res);
});

router.post('/:videoId/publishing/stop', (req, res) => {
    videoIdPublishingStop_POST(req, res);
});

router.post('/:videoId/upload', (req, res) => {
    videoIdUpload_POST(req, res);
});

router.post('/:videoId/stream', (req, res) => {
    videoIdStream_POST(req, res);
});

router.post('/error', (req, res) => {
    error_POST(req, res);
});

router.post('/:videoId/sourceFileExtension', (req, res) => {
    videoIdSourceFileExtension_POST(req, res);
});

router.post('/:videoId/unpublish', (req, res) => {
    videoIdUnpublish_POST(req, res);
});

router.post('/:videoId/data', (req, res) => {
    videoIdData_POST(req, res);
});

router.post('/:videoId/index/add', (req, res) => {
    videoIdIndexAdd_POST(req, res)
});

router.post('/:videoId/index/remove', (req, res) => {
    videoIdIndexRemove_POST(req, res);
});

router.post('/:videoId/lengths', (req, res) => {
    videoIdLengths_POST(req, res);
});

router.post('/delete', (req, res) => {
    delete_POST(req, res);
});

router.post('/finalize', (req, res) => {
    finalize_POST(req, res);
});

router.post('/:videoId/comments/comment', (req, res) => {
    videoIdCommentsComment_POST(req, res);
});

router.delete('/:videoId/comments/:commentId/delete', (req, res) => {
    videoIdCommentsCommentIdDelete_DELETE(req, res);
});

router.post('/:videoId/like', (req, res) => {
    videoIdLike_POST(req, res);
});

router.post('/:videoId/dislike', (req, res) => {
    videoIdDislike_POST(req, res);
});

router.post('/:videoId/report', (req, res) => {
    videoIdReport_POST(req, res);
});

router.post('/:videoId/thumbnail', (req, res) => {
    videoIdThumbnail_POST(req, res);
});

router.post('/:videoId/preview', (req, res) => {
    videoIdPreview_POST(req, res);
});

router.post('/:videoId/poster', (req, res) => {
    videoIdPoster_POST(req, res);
});




router.get('/:videoId/publishes', (req, res) => {
    videoIdPublishes_GET(req, res);
});

router.get('/:videoId/comments', async (req, res) => {
    const videoId = req.params.videoId;
    const type = req.query.type;
    const sort = req.query.sort;
    const timestamp = req.query.timestamp;

    const data = await videoIdComments_GET(videoId, type, sort, timestamp);

    res.send(data);
});

router.get('/:videoId/comments/:commentId', (req, res) => {
    videoIdCommentsCommentId_GET(req, res);
});

router.get('/:videoId/alias', (req, res) => {
    videoIdAlias_GET(req, res);
});

router.get('/:videoId/sourceFileExtension', (req, res) => {
    videoIdSourceFileExtension_GET(req, res);
});

router.get('/search', (req, res) => {
    search_GET(req, res);
});

router.get('/:videoId/data', (req, res) => {
    videoIdData_GET(req, res);
});

router.get('/comments/all', (req, res) => {
    commentsAll_GET(req, res);
});

router.get('/tags', async (req, res) => {
    const data = await tags_GET(req, res);

    res.send(data);
});

router.get('/tags/all', (req, res) => {
    tagsAll_GET(req, res);
});

router.get('/recommended', async (req, res) => {
    const data = await recommended_GET(req, res);

    res.send(data);
});

router.get('/:videoId/views/increment', (req, res) => {
    videoIdViewsIncrement_GET(req, res);
});

router.get('/:videoId/watch', async (req, res) => {
    const videoId = req.params.videoId;

    const data = await videoIdWatch_GET(videoId);

    res.send(data);
});

module.exports = router;
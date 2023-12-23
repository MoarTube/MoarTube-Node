const sanitizeHtml = require('sanitize-html');

const { isCommentIdValid, isReportEmailValid, isReportTypeValid, isReportMessageValid, isCaptchaResponseValid } = require('../utils/validators');
const { performDatabaseReadJob_GET, submitDatabaseWriteJob } = require('../utils/database');

function commentIdReport_POST(req, res) {
    const commentId = req.params.commentId;
    var email = req.body.email;
    const reportType = req.body.reportType;
    var message = req.body.message;
    const captchaResponse = req.body.captchaResponse;
    
    if(isCommentIdValid(commentId) && isReportEmailValid(email) && isReportTypeValid(reportType) && isReportMessageValid(message)) {
        email = sanitizeHtml(email, {allowedTags: [], allowedAttributes: {}});
        message = sanitizeHtml(message, {allowedTags: [], allowedAttributes: {}});
        
        const captchaAnswer = req.session.commentReportCaptcha;
        
        if(isCaptchaResponseValid(captchaResponse, captchaAnswer)) {
            performDatabaseReadJob_GET('SELECT * FROM comments WHERE id = ?', [commentId])
            .then(row => {
                if(row != null) {
                    const videoId = row.video_id;
                    const commentTimestamp = row.timestamp;
                    
                    submitDatabaseWriteJob('INSERT INTO commentReports(timestamp, comment_timestamp, video_id, comment_id, email, type, message) VALUES (?, ?, ?, ?, ?, ?, ?)', [Date.now(), commentTimestamp, videoId, commentId, email, reportType, message], function(isError) {
                        if(isError) {
                            res.send({isError: true, message: 'error communicating with the MoarTube node'});
                        }
                        else {
                            res.send({isError: false});
                        }
                    });
                }
                else {
                    res.send({isError: true, message: 'that comment does not exist'});
                }
            })
            .catch(error => {
                res.send({isError: true, message: 'error communicating with the MoarTube node'});
            });
        }
        else {
            delete req.session.commentReportCaptcha;
            
            res.send({isError: true, message: 'the captcha was not correct'});
        }
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
}

module.exports = {
    commentIdReport_POST
}
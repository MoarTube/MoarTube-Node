const sanitizeHtml = require('sanitize-html');

const { logDebugMessageToConsole } = require('../utils/helpers');
const { isCommentIdValid, isReportEmailValid, isReportTypeValid, isReportMessageValid } = require('../utils/validators');
const { performDatabaseReadJob_GET, submitDatabaseWriteJob } = require('../utils/database');
const { 
    cloudflare_validateTurnstileToken
} = require('../utils/cloudflare-communications');

function commentIdReport_POST(req, res) {
    const commentId = req.params.commentId;
    var email = req.body.email;
    const reportType = req.body.reportType;
    var message = req.body.message;
    const cloudflareTurnstileToken = req.body.cloudflareTurnstileToken;
    
    if(isCommentIdValid(commentId) && isReportEmailValid(email) && isReportTypeValid(reportType) && isReportMessageValid(message)) {
        email = sanitizeHtml(email, {allowedTags: [], allowedAttributes: {}});
        message = sanitizeHtml(message, {allowedTags: [], allowedAttributes: {}});

        const ip = req.header('CF-Connecting-IP');

        cloudflare_validateTurnstileToken(cloudflareTurnstileToken, ip)
        .then(response => {
            if(response.isError) {
                logDebugMessageToConsole(null, response.message, new Error().stack, true);

                res.send({isError: true, message: 'you\'re doing that too much, please try again later'});
            }
            else {
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
                    logDebugMessageToConsole(null, error, new Error().stack, true);

                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                });
            }
        })
        .catch(error => {
            logDebugMessageToConsole(null, error, new Error().stack, true);

            res.send({isError: true, message: 'you\'re doing that too much, please try again later'});
        });
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
}

module.exports = {
    commentIdReport_POST
}
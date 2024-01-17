const sanitizeHtml = require('sanitize-html');

const { logDebugMessageToConsole, getNodeSettings } = require('../utils/helpers');
const { isCommentIdValid, isReportEmailValid, isReportTypeValid, isReportMessageValid, isCloudflareTurnstileTokenValid } = require('../utils/validators');
const { performDatabaseReadJob_GET, submitDatabaseWriteJob } = require('../utils/database');
const { cloudflare_validateTurnstileToken } = require('../utils/cloudflare-communications');

async function commentIdReport_POST(req, res) {
    const commentId = req.params.commentId;
    var email = req.body.email;
    const reportType = req.body.reportType;
    var message = req.body.message;
    const cloudflareTurnstileToken = req.body.cloudflareTurnstileToken;
    
    if(isCommentIdValid(commentId) && isReportEmailValid(email) && isReportTypeValid(reportType) && isReportMessageValid(message) && isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, true)) {
        var canProceed = true;
        var message;

        try {
            const nodeSettings = getNodeSettings();
            
            if(nodeSettings.isCloudflareTurnstileEnabled) {
                if(cloudflareTurnstileToken.length === 0) {
                    message = 'human verification was enabled on this MoarTube Node, please refresh your browser';

                    canProceed = false;
                }
                else {
                    const ip = req.header('CF-Connecting-IP');

                    const response = await cloudflare_validateTurnstileToken(cloudflareTurnstileToken, ip);

                    if(response.isError) {
                        logDebugMessageToConsole(null, response.message, new Error().stack, true);

                        message = response.message;

                        canProceed = false;
                    }
                }
            }
        }
        catch(error) {
            logDebugMessageToConsole(null, error, new Error().stack, true);

            message = 'error communicating with the MoarTube node';

            canProceed = false;
        }

        if(canProceed) {
            email = sanitizeHtml(email, {allowedTags: [], allowedAttributes: {}});
            message = sanitizeHtml(message, {allowedTags: [], allowedAttributes: {}});

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
        else {
            res.send({isError: true, message: message});
        }
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
}

module.exports = {
    commentIdReport_POST
}
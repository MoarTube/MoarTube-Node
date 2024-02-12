const sanitizeHtml = require('sanitize-html');

const { logDebugMessageToConsole, getNodeSettings, getAuthenticationStatus } = require('../utils/helpers');
const { isCommentIdValid, isReportEmailValid, isReportTypeValid, isReportMessageValid, isCloudflareTurnstileTokenValid, isTimestampValid,
    isLimitValid, isSearchTermValid, isVideoIdValid } = require('../utils/validators');
const { performDatabaseReadJob_GET, performDatabaseReadJob_ALL, submitDatabaseWriteJob } = require('../utils/database');
const { cloudflare_validateTurnstileToken } = require('../utils/cloudflare-communications');

async function commentIdReport_POST(req, res) {
    const commentId = req.params.commentId;
    let email = req.body.email;
    const reportType = req.body.reportType;
    let message = req.body.message;
    const cloudflareTurnstileToken = req.body.cloudflareTurnstileToken;
    
    if(isCommentIdValid(commentId) && isReportEmailValid(email) && isReportTypeValid(reportType) && isReportMessageValid(message) && isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, true)) {
        let canProceed = true;
        let errorMessage;

        try {
            const nodeSettings = getNodeSettings();
            
            if(nodeSettings.isCloudflareTurnstileEnabled) {
                if(cloudflareTurnstileToken.length === 0) {
                    errorMessage = 'human verification was enabled on this MoarTube Node, please refresh your browser';

                    canProceed = false;
                }
                else {
                    const ip = req.header('CF-Connecting-IP');

                    const response = await cloudflare_validateTurnstileToken(cloudflareTurnstileToken, ip);

                    if(response.isError) {
                        logDebugMessageToConsole(null, response.message, new Error().stack, true);

                        errorMessage = response.message;

                        canProceed = false;
                    }
                }
            }
        }
        catch(error) {
            logDebugMessageToConsole(null, error, new Error().stack, true);

            errorMessage = 'error communicating with the MoarTube node';

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
            res.send({isError: true, message: errorMessage});
        }
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
}

function search_GET(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const videoId = req.query.videoId;
            const searchTerm = req.query.searchTerm;
            const timestamp = req.query.timestamp;
            const limit = req.query.limit;

            if(isVideoIdValid(videoId, true) && isSearchTermValid(searchTerm) && isTimestampValid(timestamp) && isLimitValid(limit)) {
                let query = 'SELECT * FROM comments';
                let params = [];

                if(videoId.length > 0 || searchTerm.length > 0 || timestamp.length > 0) {
                    query += ' WHERE';
                }

                if(videoId.length > 0) {
                    query += ' video_id = ?';
                    params.push(videoId);

                    if(searchTerm.length > 0 || timestamp.length > 0) {
                        query += ' AND';
                    }
                }

                if(searchTerm.length > 0) {
                    query += ' comment_plain_text_sanitized LIKE ?';
                    params.push('%' + searchTerm + '%');

                    if(timestamp.length > 0) {
                        query += ' AND';
                    }
                }

                if(timestamp.length > 0) {
                    query += ' timestamp < ?';
                    params.push(timestamp);
                }

                query += ' ORDER BY timestamp DESC';

                if(limit.length > 0) {
                    query += ' LIMIT ?';
                    params.push(limit);
                }
                
                performDatabaseReadJob_ALL(query, params)
                .then(comments => {
                    res.send({isError: false, comments: comments});
                })
                .catch(error => {
                    logDebugMessageToConsole(null, error, new Error().stack, true);

                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                });
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
            }
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
    commentIdReport_POST,
    search_GET
}
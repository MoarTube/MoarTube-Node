const sanitizeHtml = require('sanitize-html');

const { logDebugMessageToConsole, getNodeSettings } = require('../utils/helpers');
const { isCommentIdValid, isReportEmailValid, isReportTypeValid, isReportMessageValid, isCloudflareTurnstileTokenValid, isTimestampValid,
    isLimitValid, isSearchTermValid, isVideoIdValid } = require('../utils/validators');
const { performDatabaseReadJob_GET, performDatabaseReadJob_ALL, submitDatabaseWriteJob } = require('../utils/database');
const { cloudflare_validateTurnstileToken } = require('../utils/cloudflare-communications');

function search_GET(videoId, searchTerm, timestamp, limit) {
    return new Promise(function(resolve, reject) {
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
                resolve({isError: false, comments: comments});
            })
            .catch(error => {
                reject(error);
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

async function commentIdReport_POST(commentId, email, reportType, message, cloudflareTurnstileToken, cloudflareConnectingIp) {
    return new Promise(async function(resolve, reject) {
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
                        const response = await cloudflare_validateTurnstileToken(cloudflareTurnstileToken, cloudflareConnectingIp);

                        if(response.isError) {
                            logDebugMessageToConsole(response.message, null, new Error().stack);

                            errorMessage = response.message;

                            canProceed = false;
                        }
                    }
                }
            }
            catch(error) {
                logDebugMessageToConsole(null, error, new Error().stack);

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
                                resolve({isError: true, message: 'error communicating with the MoarTube node'});
                            }
                            else {
                                resolve({isError: false});
                            }
                        });
                    }
                    else {
                        resolve({isError: true, message: 'that comment does not exist'});
                    }
                })
                .catch(error => {
                    reject(error);
                });
            }
            else {
                resolve({isError: true, message: errorMessage});
            }
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

module.exports = {
    search_GET,
    commentIdReport_POST
}
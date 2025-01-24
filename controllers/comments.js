const sanitizeHtml = require('sanitize-html');

const { 
    getNodeSettings 
} = require('../utils/helpers');
const { 
    isCommentIdValid, isReportEmailValid, isReportTypeValid, isReportMessageValid, isCloudflareTurnstileTokenValid, isTimestampValid,
    isLimitValid, isSearchTermValid, isVideoIdValid 
} = require('../utils/validators');
const { 
    performDatabaseReadJob_GET, performDatabaseReadJob_ALL, submitDatabaseWriteJob 
} = require('../utils/database');
const { 
    cloudflare_validateTurnstileToken 
} = require('../utils/cloudflare-communications');

async function search_GET(videoId, searchTerm, timestamp, limit) {
    if (isVideoIdValid(videoId, true) && isSearchTermValid(searchTerm) && isTimestampValid(timestamp) && isLimitValid(limit)) {
        let query = 'SELECT * FROM comments';
        let params = [];

        if (videoId.length > 0 || searchTerm.length > 0 || timestamp.length > 0) {
            query += ' WHERE';
        }

        if (videoId.length > 0) {
            query += ' video_id = ?';
            params.push(videoId);

            if (searchTerm.length > 0 || timestamp.length > 0) {
                query += ' AND';
            }
        }

        if (searchTerm.length > 0) {
            query += ' comment_plain_text_sanitized LIKE ?';
            params.push('%' + searchTerm + '%');

            if (timestamp.length > 0) {
                query += ' AND';
            }
        }

        if (timestamp.length > 0) {
            query += ' timestamp < ?';
            params.push(timestamp);
        }

        query += ' ORDER BY timestamp DESC';

        if (limit.length > 0) {
            query += ' LIMIT ?';
            params.push(limit);
        }

        const comments = await performDatabaseReadJob_ALL(query, params);

        return { isError: false, comments: comments };
    }
    else {
        return { isError: true, message: 'invalid parameters' };
    }
}

async function commentIdReport_POST(commentId, email, reportType, message, cloudflareTurnstileToken, cloudflareConnectingIp) {
    if (isCommentIdValid(commentId) && isReportEmailValid(email) && isReportTypeValid(reportType) && isReportMessageValid(message) && isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, true)) {
        let errorMessage;

        try {
            const nodeSettings = getNodeSettings();

            if (nodeSettings.isCloudflareTurnstileEnabled) {
                if (cloudflareTurnstileToken.length === 0) {
                    errorMessage = 'human verification was enabled on this MoarTube Node, please refresh your browser';
                }
                else {
                    await cloudflare_validateTurnstileToken(cloudflareTurnstileToken, cloudflareConnectingIp);
                }
            }
        }
        catch (error) {
            throw error;
        }

        if (errorMessage == null) {
            email = sanitizeHtml(email, { allowedTags: [], allowedAttributes: {} });
            message = sanitizeHtml(message, { allowedTags: [], allowedAttributes: {} });

            const video = await performDatabaseReadJob_GET('SELECT * FROM comments WHERE id = ?', [commentId])

            if (video != null) {
                const videoId = video.video_id;
                const commentTimestamp = video.timestamp;

                await submitDatabaseWriteJob('INSERT INTO commentreports(timestamp, comment_timestamp, video_id, comment_id, email, type, message) VALUES (?, ?, ?, ?, ?, ?, ?)', [Date.now(), commentTimestamp, videoId, commentId, email, reportType, message]);

                return { isError: false };
            }
            else {
                throw new Error('that comment does not exist');
            }
        }
        else {
            throw new Error(errorMessage);
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

module.exports = {
    search_GET,
    commentIdReport_POST
}
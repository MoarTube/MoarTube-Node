function isNodeNameValid(nodeName) {
    return (nodeName != null && nodeName.length >= 0 && nodeName.length <= 100);
}

function isNodeAboutValid(nodeAbout) {
    return (nodeAbout != null && nodeAbout.length >= 0 && nodeAbout.length <= 100);
}

function isNodeIdValid(nodeId) {
    return (nodeId != null && nodeId.length > 0 && nodeId.length <= 100);
}

function isPublicNodeProtocolValid(publicNodeProtocol) {
    return (publicNodeProtocol != null && (publicNodeProtocol === 'http' || publicNodeProtocol === 'https'));
}

function isManifestTypeValid(type) {
    return (type != null && (type === 'static' || type === 'dynamic'));
}

function isManifestNameValid(manifestName) {
    const regex = /^manifest-(?:2160p|1440p|1080p|720p|480p|360p|240p|master).m3u8$/;

    return manifestName != null && manifestName.length > 0 && manifestName.length <= 100 && regex.test(manifestName);
}

function isSegmentNameValid(segmentName) {
    const regex = /^segment-(?:2160p|1440p|1080p|720p|480p|360p|240p)-\d+\.ts$/;

    return segmentName != null && segmentName.length > 0 && segmentName.length <= 100 && regex.test(segmentName);
}

function isStreamMimeTypeValid(mimeType) {
    return (mimeType === 'application/vnd.apple.mpegurl' || mimeType === 'video/mp2t');
}

function isSearchTermValid(searchTerm) {
    return (searchTerm != null && searchTerm.length >= 0 && searchTerm.length <= 100);
}

function isSourceFileExtensionValid(sourceFileExtension) {
    return (sourceFileExtension != null && (sourceFileExtension === '.mp4' || sourceFileExtension === '.webm' || sourceFileExtension === '.ts'));
}

function isJobTypeValid(jobType) {
    return (jobType != null && (jobType === 'importing' || jobType === 'publishing' || jobType === 'streaming'));
}

function isBooleanValid(value) {
    return (value != null && (typeof value === 'boolean'));
}

function isVideoPermissionTypeValid(permissionType) {
    return (permissionType != null && (permissionType === 'comments' || permissionType === 'likes' || permissionType === 'dislikes' || permissionType === 'reports' || permissionType === 'livechat'));
}

function isDatabaseConfigValid(databaseConfig) {
    let isValid = true;

    if (!databaseConfig || typeof databaseConfig !== 'object') {
        isValid = false;
    }
    else {
        const validDialects = ['sqlite', 'postgres'];

        if (!databaseConfig.databaseDialect || !validDialects.includes(databaseConfig.databaseDialect)) {
            isValid = false;
        }
        else {
            if (databaseConfig.databaseDialect === 'postgres') {
                const postgresConfig = databaseConfig.postgresConfig;

                if (typeof postgresConfig !== 'object') {
                    isValid = false;
                }
                else {
                    const requiredFields = ['databaseName', 'username', 'password', 'host', 'port'];

                    for (const field of requiredFields) {
                        if (typeof postgresConfig[field] !== (field === 'port' ? 'number' : 'string')) {
                            isValid = false;

                            break;
                        }
                    }

                    if (postgresConfig.port <= 0 || postgresConfig.port > 65535) {
                        isValid = false;
                    }
                }
            }
        }
    }

    return isValid;
}

function isStorageConfigValid(storageConfig) {
    let isValid = true;

    if (typeof storageConfig !== 'object') {
        isValid = false;
    }
    else {
        const validStorageModes = ['filesystem', 's3provider'];

        if (!storageConfig.storageMode || !validStorageModes.includes(storageConfig.storageMode)) {
            isValid = false;
        }
        else {
            if (storageConfig.storageMode === 's3provider') {
                if (typeof storageConfig.s3Config !== "object") {
                    isValid = false;
                }
                else if (typeof storageConfig.s3Config.bucketName !== "string") {
                    isValid = false;
                }
                else if (typeof storageConfig.s3Config.s3ProviderClientConfig !== "object") {
                    isValid = false;
                }
                else if (typeof storageConfig.s3Config.s3ProviderClientConfig.forcePathStyle !== "boolean") {
                    isValid = false;
                }
            }
        }
    }

    return isValid;
}

function isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, canBeEmpty) {
    /*
    https://developers.cloudflare.com/turnstile/frequently-asked-questions/#what-is-the-length-of-a-turnstile-token

    Cloudflare Turnstyle token length is subject to change and thus cannot be anticipated reliably.
    */

    if (canBeEmpty) {
        return (cloudflareTurnstileToken != null && cloudflareTurnstileToken.length >= 0);
    }
    else {
        return (cloudflareTurnstileToken != null && cloudflareTurnstileToken.length > 0);
    }
}

function isBooleanStringValid(value) {
    return (value != null && (value === 'true' || value === 'false'));
}

function isVideoCommentValid(comment) {
    return (comment != null && comment.length <= 500);
}

function isLimitValid(limit) {
    const limitParsed = parseInt(limit, 10);

    return (Number.isInteger(limitParsed));
}

function isTimestampValid(timestamp) {
    const timestampParsed = parseInt(timestamp, 10);

    return (Number.isInteger(timestampParsed) && timestampParsed >= 0 && timestampParsed <= 100000000000000);
}

function isCommentsTypeValid(type) {
    return (type != null && (type === 'before' || type === 'after'));
}

function isSortValid(sort) {
    return (sort != null && (sort === 'ascending' || sort === 'descending'));
}

function isCommentIdValid(commentId) {
    const regex = /^\d+$/;

    return (commentId != null && commentId.length <= 100 && regex.test(commentId));
}

function isReportIdValid(reportId) {
    const regex = /^\d+$/;

    return (reportId != null && reportId.length <= 100 && regex.test(reportId));
}

function isArchiveIdValid(reportId) {
    const regex = /^\d+$/;

    return (reportId != null && reportId.length <= 100 && regex.test(reportId));
}

function isSortTermValid(sortTerm) {
    return (sortTerm != null && (sortTerm === 'latest' || sortTerm === 'popular' || sortTerm === 'oldest'));
}

function isTagLimitValid(tagLimit) {
    return (tagLimit != null && tagLimit >= 0);
}

function isReportEmailValid(reportEmail) {
    return (reportEmail != null && (reportEmail.length <= 100));
}

function isReportTypeValid(reportType) {
    return (reportType != null && (reportType === 'complaint' || reportType === 'copyright' || reportType === 'other'));
}

function isReportMessageValid(reportMessage) {
    return (reportMessage != null && (reportMessage.length <= 1000));
}

function isChatMessageContentValid(chatMessageContent) {
    return (chatMessageContent != null && chatMessageContent.length > 0 && chatMessageContent.length <= 500);
}

function isChatHistoryLimitValid(chatHistoryLimit) {
    return (chatHistoryLimit != null && chatHistoryLimit >= 0 && chatHistoryLimit <= 50);
}

function isVideoMimeTypeValid(mimeType) {
    return (mimeType === 'video/mp4' || mimeType === 'video/webm');
}

function isVideoIdValid(videoId, canBeEmpty) {
    const regex = /^(?=.*[a-zA-Z]|\d)?[a-zA-Z0-9_-]{0,11}$/;

    if (canBeEmpty) {
        return videoId != null && (videoId.length === 0 || (videoId.length === 11 && regex.test(videoId)));
    }
    else {
        return videoId != null && videoId.length > 0 && videoId.length === 11 && regex.test(videoId);
    }
}

function isVideoIdsValid(videoIds) {
    let result = true;

    if (videoIds != null) {
        videoIds.forEach(function (videoId) {
            if (!isVideoIdValid(videoId, false)) {
                result = false;
                return;
            }
        });
    }
    else {
        result = false
    }

    return result;
}

function isUsernameValid(username) {
    const regex = /^[\w!@#$%^&*()-_=+]+$/;

    return username != null && username.length > 0 && username.length <= 100 && regex.test(username)
}

function isPasswordValid(password) {
    const regex = /^[\w!@#$%^&*()-_=+]+$/;

    return password != null && password.length > 0 && password.length <= 100 && regex.test(password)
}

function isIpv4Address(value) {
    const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}$/;

    return ipv4Regex.test(value);
}

function isNetworkAddressValid(networkAddress) {
    return networkAddress != null && networkAddress.length > 0 && networkAddress.length <= 100;
}

function isPublicNodeAddressValid(publicNodeAddress) {
    return publicNodeAddress != null && publicNodeAddress.length > 0 && publicNodeAddress.length <= 100;
}

function isPortValid(port) {
    port = Number(port);

    return port != null && !Number.isNaN(port) && (port > 0 && port <= 65535);
}

function isFormatValid(format) {
    return format != null && (isAdaptiveFormatValid(format) || isProgressiveFormatValid(format));
}

function isAdaptiveFormatValid(format) {
    return format != null && (format === 'm3u8');
}

function isProgressiveFormatValid(format) {
    return format != null && (format === 'mp4' || format === 'webm' || format === 'ogv');
}

function isResolutionValid(resolution) {
    return resolution != null && (resolution === '2160p' || resolution === '1440p' || resolution === '1080p' || resolution === '720p' || resolution === '480p' || resolution === '360p' || resolution === '240p');
}

function isProgressiveFilenameValid(progressiveFilename) {
    const regex = /^(240p|360p|480p|720p|1080p|1440p|2160p)\.(mp4|webm|ogv)$/;

    return regex.test(progressiveFilename);
}

function isTitleValid(title) {
    return (title != null && title.length > 0 && title.length <= 100);
}

function isDescriptionValid(description) {
    return (description != null && description.length > 0 && description.length <= 5000);
}

function isTagTermValid(tagTerm, canBeEmpty) {
    /*
    can be alphanumeric
    can be mixed case
    can contain spaces
    */

    let regex = /^[a-zA-Z0-9\s]*$/;

    if (canBeEmpty) {
        return (tagTerm != null && tagTerm.length <= 30 && regex.test(tagTerm));
    }
    else {
        return (tagTerm != null && tagTerm.length > 0 && tagTerm.length <= 30 && regex.test(tagTerm));
    }
}

function isTagsValid(tags) {
    let result = true;

    if (tags != null && tags.length > 0 && tags.length <= 150) {
        const tagsArray = tags.split(',');

        if (tagsArray.length > 0 && tagsArray.length <= 5) {
            for (const tag of tagsArray) {
                if (!(isTagTermValid(tag, false))) {
                    result = false;
                    break;
                }
            }
        }
        else {
            result = false;
        }
    }
    else {
        result = false;
    }

    return result;
}

async function isCloudflareCredentialsValid(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey) {
    const { cloudflare_validate } = require('../utils/cloudflare-communications');

    const result = await cloudflare_validate(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey);

    return result;
}

module.exports = {
    isNodeNameValid,
    isNodeAboutValid,
    isNodeIdValid,
    isPublicNodeProtocolValid,
    isManifestTypeValid,
    isManifestNameValid,
    isSegmentNameValid,
    isStreamMimeTypeValid,
    isSearchTermValid,
    isSourceFileExtensionValid,
    isJobTypeValid,
    isBooleanValid,
    isBooleanStringValid,
    isVideoCommentValid,
    isTimestampValid,
    isCommentsTypeValid,
    isCommentIdValid,
    isReportIdValid,
    isArchiveIdValid,
    isSortTermValid,
    isTagLimitValid,
    isReportEmailValid,
    isReportTypeValid,
    isReportMessageValid,
    isChatMessageContentValid,
    isChatHistoryLimitValid,
    isVideoMimeTypeValid,
    isVideoIdValid,
    isVideoIdsValid,
    isUsernameValid,
    isPasswordValid,
    isNetworkAddressValid,
    isPublicNodeAddressValid,
    isPortValid,
    isFormatValid,
    isAdaptiveFormatValid,
    isProgressiveFormatValid,
    isResolutionValid,
    isTitleValid,
    isDescriptionValid,
    isTagTermValid,
    isTagsValid,
    isCloudflareCredentialsValid,
    isCloudflareTurnstileTokenValid,
    isSortValid,
    isLimitValid,
    isDatabaseConfigValid,
    isStorageConfigValid,
    isIpv4Address,
    isProgressiveFilenameValid,
    isVideoPermissionTypeValid
}
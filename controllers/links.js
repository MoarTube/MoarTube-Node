const { cloudflare_purgeWatchPages, cloudflare_purgeNodePage } = require('../utils/cloudflare-communications');
const { performDatabaseReadJob_ALL, performDatabaseReadJob_GET, submitDatabaseWriteJob } = require('../utils/database');
const { logDebugMessageToConsole } = require('../utils/logger');

async function linksAll_GET() {
    const links = await performDatabaseReadJob_ALL('SELECT * FROM links', []);

    return {isError: false, links: links};
}

async function linksAdd_POST(url, svgGraphic) {
    const timestamp = Date.now();

    await submitDatabaseWriteJob('INSERT INTO links(url, svg_graphic, timestamp) VALUES (?, ?, ?)', [url, svgGraphic, timestamp]);

    try {
        const videos = await performDatabaseReadJob_ALL('SELECT video_id, tags FROM videos', []);

        const videoIds = videos.map(video => video.video_id);
        const tags = Array.from(new Set(videos.map(video => video.tags.split(',')).flat()));

        cloudflare_purgeWatchPages(videoIds);
        cloudflare_purgeNodePage(tags);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, null);
    }

    const link = await performDatabaseReadJob_GET('SELECT * FROM links WHERE timestamp = ?', [timestamp]);

    return {isError: false, link: link};
}

async function linksDelete_POST(linkId) {
    await submitDatabaseWriteJob('DELETE FROM links WHERE link_id = ?', [linkId]);

    try {
        const videos = await performDatabaseReadJob_ALL('SELECT video_id, tags FROM videos', []);

        const videoIds = videos.map(video => video.video_id);
        const tags = Array.from(new Set(videos.map(video => video.tags.split(',')).flat()));

        cloudflare_purgeWatchPages(videoIds);
        cloudflare_purgeNodePage(tags);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, null);
    }

    return {isError: false};
}

module.exports = {
    linksAll_GET,
    linksAdd_POST,
    linksDelete_POST
}
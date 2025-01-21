const { cloudflare_purgeAllWatchPages, cloudflare_purgeNodePage } = require('../utils/cloudflare-communications');
const { performDatabaseReadJob_ALL, performDatabaseReadJob_GET, submitDatabaseWriteJob } = require('../utils/database');

async function linksAll_GET() {
    const links = await performDatabaseReadJob_ALL('SELECT * FROM links', []);

    return {isError: false, links: links};
}

async function linksAdd_POST(url, svgGraphic) {
    const timestamp = Date.now();

    await submitDatabaseWriteJob('INSERT INTO links(url, svg_graphic, timestamp) VALUES (?, ?, ?)', [url, svgGraphic, timestamp]);

    cloudflare_purgeAllWatchPages();
    cloudflare_purgeNodePage();

    const link = await performDatabaseReadJob_GET('SELECT * FROM links WHERE timestamp = ?', [timestamp]);

    return {isError: false, link: link};
}

async function linksDelete_POST(linkId) {
    await submitDatabaseWriteJob('DELETE FROM links WHERE link_id = ?', [linkId]);

    cloudflare_purgeAllWatchPages();
    cloudflare_purgeNodePage();

    return {isError: false};
}

module.exports = {
    linksAll_GET,
    linksAdd_POST,
    linksDelete_POST
}
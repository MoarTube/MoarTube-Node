function root_GET(originalUrl, path) {
    const url = '/node' + originalUrl.substring(path.length);
    
    return url;
}

module.exports = {
    root_GET
};
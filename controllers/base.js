function root_GET(req, res) {
    const url = '/node/' + req.originalUrl.substring(req.path.length);
    
    res.redirect(url);
}

module.exports = {
    root_GET
};
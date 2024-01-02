var dataDirectoryPath;
var nodeSettingsPath;
var imagesDirectoryPath;
var publicDirectoryPath;
var pagesDirectoryPath;
var viewsDirectoryPath;
var videosDirectoryPath;
var databaseDirectoryPath;
var databaseFilePath;
var certificatesDirectoryPath;


/* getters */

function getPublicDirectoryPath() {
    return publicDirectoryPath;
}

function getPagesDirectoryPath() {
    return pagesDirectoryPath;
}

function getViewsDirectoryPath() {
    return viewsDirectoryPath;
}

function getDataDirectoryPath() {
    return dataDirectoryPath;
}

function getNodeSettingsPath() {
    return nodeSettingsPath;
}

function getImagesDirectoryPath() {
    return imagesDirectoryPath;
}

function getVideosDirectoryPath() {
    return videosDirectoryPath;
}

function getDatabaseDirectoryPath() {
    return databaseDirectoryPath;
}

function getDatabaseFilePath() {
    return databaseFilePath;
}

function getCertificatesDirectoryPath() {
    return certificatesDirectoryPath;
}


/* setters */

function setPublicDirectoryPath(path) {
    publicDirectoryPath = path;
}

function setPagesDirectoryPath(path) {
    pagesDirectoryPath = path;
}

function setViewsDirectoryPath(path) {
    viewsDirectoryPath = path;
}

function setDataDirectoryPath(path) {
    dataDirectoryPath = path;
}

function setNodeSettingsPath(path) {
    nodeSettingsPath = path;
}

function setImagesDirectoryPath(path) {
    imagesDirectoryPath = path;
}

function setVideosDirectoryPath(path) {
    videosDirectoryPath = path;
}

function setDatabaseDirectoryPath(path) {
    databaseDirectoryPath = path;
}

function setDatabaseFilePath(path) {
    databaseFilePath = path;
}

function setCertificatesDirectoryPath(path) {
    certificatesDirectoryPath = path;
}

module.exports = {
    getPagesDirectoryPath,
    getViewsDirectoryPath,
    getPublicDirectoryPath,
    getDataDirectoryPath,
    getNodeSettingsPath,
    getImagesDirectoryPath,
    getVideosDirectoryPath,
    getDatabaseDirectoryPath,
    getDatabaseFilePath,
    getCertificatesDirectoryPath,
    setPublicDirectoryPath,
    setPagesDirectoryPath,
    setViewsDirectoryPath,
    setDataDirectoryPath,
    setNodeSettingsPath,
    setImagesDirectoryPath,
    setVideosDirectoryPath,
    setDatabaseDirectoryPath,
    setDatabaseFilePath,
    setCertificatesDirectoryPath
};
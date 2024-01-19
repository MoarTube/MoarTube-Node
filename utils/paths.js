var dataDirectoryPath;
var nodeSettingsPath;
var lastCheckedContentTrackerPath;
var imagesDirectoryPath;
var publicDirectoryPath;
var viewsDirectoryPath;
var videosDirectoryPath;
var databaseDirectoryPath;
var databaseFilePath;
var certificatesDirectoryPath;


/* getters */

function getPublicDirectoryPath() {
    return publicDirectoryPath;
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

function getLastCheckedContentTrackerPath() {
    return lastCheckedContentTrackerPath;
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

function setViewsDirectoryPath(path) {
    viewsDirectoryPath = path;
}

function setDataDirectoryPath(path) {
    dataDirectoryPath = path;
}

function setNodeSettingsPath(path) {
    nodeSettingsPath = path;
}

function setLastCheckedContentTrackerPath(path) {
    lastCheckedContentTrackerPath = path;
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
    getViewsDirectoryPath,
    getPublicDirectoryPath,
    getDataDirectoryPath,
    getNodeSettingsPath,
    getLastCheckedContentTrackerPath,
    getImagesDirectoryPath,
    getVideosDirectoryPath,
    getDatabaseDirectoryPath,
    getDatabaseFilePath,
    getCertificatesDirectoryPath,
    setPublicDirectoryPath,
    setViewsDirectoryPath,
    setDataDirectoryPath,
    setNodeSettingsPath,
    setLastCheckedContentTrackerPath,
    setImagesDirectoryPath,
    setVideosDirectoryPath,
    setDatabaseDirectoryPath,
    setDatabaseFilePath,
    setCertificatesDirectoryPath
};
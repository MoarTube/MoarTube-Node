var moartubeIndexerIp;
var moartubeIndexerPort;
var moartubeIndexerHttpProtocol;
var moartubeAliaserIp;
var moartubeAliaserPort;
var moartubeAliaserHttpProtocol;

function getMoarTubeIndexerUrl() {
    return (getMoarTubeIndexerHttpProtocol() + '://' + getMoarTubeIndexerIp() + ':' + getMoarTubeIndexerPort());
}

function getMoarTubeAliaserUrl() {
    return (getMoarTubeAliaserHttpProtocol() + '://' + getMoarTubeAliaserIp() + ':' + getMoarTubeAliaserPort());
}

function getMoarTubeIndexerHttpProtocol() {
    return moartubeIndexerHttpProtocol;
}

function getMoarTubeIndexerIp() {
    return moartubeIndexerIp;
}

function getMoarTubeIndexerPort() {
    return moartubeIndexerPort;
}

function getMoarTubeAliaserHttpProtocol() {
    return moartubeAliaserHttpProtocol;
}

function getMoarTubeAliaserIp() {
    return moartubeAliaserIp;
}

function getMoarTubeAliaserPort() {
    return moartubeAliaserPort;
}

function setMoarTubeIndexerHttpProtocol(value) {
    moartubeIndexerHttpProtocol = value;
}

function setMoarTubeIndexerIp(value) {
    moartubeIndexerIp = value;
}

function setMoarTubeIndexerPort(value) {
    moartubeIndexerPort = value;
}

function setMoarTubeAliaserHttpProtocol(value) {
    moartubeAliaserHttpProtocol = value;
}

function setMoarTubeAliaserIp(value) {
    moartubeAliaserIp = value;
}

function setMoarTubeAliaserPort(value) {
    moartubeAliaserPort = value;
}








function getCloudflareZoneUrl() {


    return 'https://api.cloudflare.com/client/v4/zones/';
}

module.exports = {
    getMoarTubeAliaserUrl,
    getMoarTubeIndexerUrl,
    getMoarTubeIndexerHttpProtocol,
    getMoarTubeIndexerIp,
    getMoarTubeIndexerPort,
    getMoarTubeAliaserHttpProtocol,
    getMoarTubeAliaserIp,
    getMoarTubeAliaserPort,
    setMoarTubeIndexerHttpProtocol,
    setMoarTubeIndexerIp,
    setMoarTubeIndexerPort,
    setMoarTubeAliaserHttpProtocol,
    setMoarTubeAliaserIp,
    setMoarTubeAliaserPort,
    getCloudflareZoneUrl
};
var moartubeIndexerIp;
var moartubeIndexerPort;
var moartubeIndexerHttpProtocol;
var moartubeAliaserIp;
var moartubeAliaserPort;
var moartubeAliaserHttpProtocol;

function setMoarTubeIndexerHttpProtocol(value) {
    moartubeIndexerHttpProtocol = value;
}

function setMoarTubeIndexerIp(value) {
    moartubeIndexerIp = value;
}

function setMoarTubeIndexerPort(value) {
    moartubeIndexerPort = value;
}

function getMoarTubeIndexerUrl() {
    return (getMoarTubeIndexerHttpProtocol() + '://' + getMoarTubeIndexerIp() + ':' + getMoarTubeIndexerPort());
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

function getMoarTubeAliaserUrl() {
    return (getMoarTubeAliaserHttpProtocol() + '://' + getMoarTubeAliaserIp() + ':' + getMoarTubeAliaserPort());
}

module.exports = {
    getMoarTubeAliaserUrl,
    getMoarTubeIndexerUrl,
    setMoarTubeIndexerHttpProtocol,
    setMoarTubeIndexerIp,
    setMoarTubeIndexerPort,
    setMoarTubeAliaserHttpProtocol,
    setMoarTubeAliaserIp,
    setMoarTubeAliaserPort
};
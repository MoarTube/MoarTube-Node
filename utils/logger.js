const path = require('path');
const fs = require('fs');

function logDebugMessageToConsole(message, error, stackTrace) {
    const date = new Date(Date.now());
    const year = date.getFullYear();
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const day = ('0' + date.getDate()).slice(-2);
    const hours = ('0' + date.getHours()).slice(-2);
    const minutes = ('0' + date.getMinutes()).slice(-2);
    const seconds = ('0' + date.getSeconds()).slice(-2);
    const humanReadableTimestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    
    let errorMessage = '<message: ' + message + ', date: ' + humanReadableTimestamp + '>';

    if(error != null) {
        if(error.stack != null) {
            errorMessage += '\n' + error.stack;
        }
        else if(error.stackTrace != null) {
            errorMessage += '\n' + error.stackTrace;
        }
    }

    if(stackTrace != null) {
        errorMessage += '\n' + stackTrace;
    }
    
    console.log(errorMessage);

    errorMessage += '\n';
    
    /*
    if(isLoggingToFile) {
        const logFilePath = path.join(__dirname, '/_node_log.txt');
        fs.appendFileSync(logFilePath, errorMessage);
    }
    */
}

module.exports = {
    logDebugMessageToConsole
}
const axios = require('axios').default;
const { logDebugMessageToConsole } = require('./logger');

function cloudflare_validate(cloudflareEmailAddress, cloudflareZoneId, cloudflareApiToken) {
    return new Promise(function(resolve, reject) {
        axios.get('https://api.cloudflare.com/client/v4/zones/' + cloudflareZoneId, {
            headers: {
                'X-Auth-Email': cloudflareEmailAddress,
                'X-Auth-Key': cloudflareApiToken
            }
        })
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            logDebugMessageToConsole(null, error, new Error().stack, true);
            
            resolve({isError: true, message: 'error'});
        });
    });
}

module.exports = {
    cloudflare_validate
};
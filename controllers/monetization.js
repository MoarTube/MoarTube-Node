const { cloudflare_purgeWatchPages } = require('../utils/cloudflare-communications');
const { logDebugMessageToConsole, getAuthenticationStatus } = require('../utils/helpers');
const { performDatabaseReadJob_ALL, performDatabaseReadJob_GET, submitDatabaseWriteJob } = require('../utils/database');

function walletAddressAll_GET(req, res) {
    const query = 'SELECT * FROM cryptoWalletAddresses';
    const params = [];

    performDatabaseReadJob_ALL(query, params)
    .then(cryptoWalletAddresses => {
        res.send({isError: false, cryptoWalletAddresses: cryptoWalletAddresses});
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
}

function walletAddressAdd_POST(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const walletAddress = req.body.walletAddress;
            const chain = req.body.chain;
            const currency = req.body.currency;

            let chainId = '';

            if (chain === 'ETH') {
                chainId = '0x1';
            }
            else if (chain === 'BNB') {
                chainId = '0x38';
            }

            const timestamp = Date.now();

            const query = 'INSERT INTO cryptoWalletAddresses(wallet_address, chain, chain_id, currency, timestamp) VALUES (?, ?, ?, ?, ?)';
            const params = [walletAddress, chain, chainId, currency, timestamp];

            submitDatabaseWriteJob(query, params, function(isError) {
                if(isError) {
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    performDatabaseReadJob_ALL('SELECT video_id FROM videos', [])
                    .then(async videos => {
                        const videoIds = videos.map(video => video.video_id);

                        cloudflare_purgeWatchPages(videoIds);
                    })
                    .catch(error => {
                        // do nothing
                    });

                    performDatabaseReadJob_GET('SELECT * FROM cryptoWalletAddresses WHERE timestamp = ?', [timestamp])
                    .then(cryptoWalletAddress => {
                        res.send({isError: false, cryptoWalletAddress: cryptoWalletAddress});
                    })
                    .catch(error => {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    });
                }
            });
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
}

function walletAddressDelete_POST(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const cryptoWalletAddressId = req.body.cryptoWalletAddressId;

            const query = 'DELETE FROM cryptoWalletAddresses WHERE wallet_address_id = ?';
            const params = [cryptoWalletAddressId];

            submitDatabaseWriteJob(query, params, function(isError) {
                if(isError) {
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    performDatabaseReadJob_ALL('SELECT video_id FROM videos', [])
                    .then(async videos => {
                        const videoIds = videos.map(video => video.video_id);

                        cloudflare_purgeWatchPages(videoIds);
                    })
                    .catch(error => {
                        // do nothing
                    });

                    res.send({isError: false});
                }
            });
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
}

module.exports = {
    walletAddressAll_GET,
    walletAddressAdd_POST,
    walletAddressDelete_POST
}
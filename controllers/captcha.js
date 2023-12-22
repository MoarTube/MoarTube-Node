const { logDebugMessageToConsole } = require('../utils/logger');
const { getAuthenticationStatus, generateCaptcha, performNodeIdentification, getNodeIdentification, getNodeSettings } = require('../utils/helpers');
const { isCaptchaTypeValid } = require('../utils/validators');
const { indexer_getCaptcha } = require('../utils/indexer-communications');
const { aliaser_getCaptcha } = require('../utils/aliaser-communications');

async function discussion_GET(req, res) {
    const captchaType = req.query.captchaType;
    
    if(isCaptchaTypeValid(captchaType)) {
        const captcha = await generateCaptcha();
        
        if(captchaType === 'static') {
            req.session.staticDiscussionCaptcha = captcha.text;
        }
        else if(captchaType === 'dynamic') {
            req.session.dynamicDiscussionCaptcha = captcha.text;
        }
        
        res.setHeader('Content-Type', 'image/png');
        
        res.send(captcha.data);
    }
    else {
        res.end();
    }
}

async function likedislike_GET(req, res) {
    const captcha = await generateCaptcha();
    
    req.session.likeDislikeCaptcha = captcha.text;
    
    res.setHeader('Content-Type', 'image/png');
    
    res.send(captcha.data);
}

function index_GET(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const nodeSettings = getNodeSettings();

            if(nodeSettings.isNodePrivate) {
                res.send({isError: true, message: "MoarTube Indexer unavailable; node is private"});
            }
            else if(!nodeSettings.isNodeConfigured) {
                res.send({isError: true, message: "MoarTube Indexer unavailable; this node has not performed initial configuration"});
            }
            else {
                performNodeIdentification(false)
                .then(() => {
                    const nodeIdentification = getNodeIdentification();
                    
                    if(nodeIdentification != null) {
                        const nodeIdentifier = nodeIdentification.nodeIdentifier;
                        const nodeIdentifierProof = nodeIdentification.nodeIdentifierProof;
                        
                        indexer_getCaptcha(nodeIdentifier, nodeIdentifierProof)
                        .then(async indexerResponseData => {
                            res.setHeader('Content-Type', 'image/png');
                            indexerResponseData.pipe(res);
                        })
                        .catch(error => {
                            logDebugMessageToConsole(null, error, new Error().stack, true);

                            res.send({isError: true, message: 'error communicating with the MoarTube node'});
                        });
                    }
                    else {
                        logDebugMessageToConsole('/captcha/index attempted retrieving node identification but was null', null, new Error().stack, true);
                    }
                })
                .catch(error => {
                    logDebugMessageToConsole(null, error, new Error().stack, true);

                    res.send({isError: true, message: 'an error occurred while retrieving the captcha'});
                });
            }
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

function alias_GET(req, res) {
    const nodeSettings = getNodeSettings();

    if(nodeSettings.isNodePrivate) {
        res.send({isError: true, message: "aliasing unavailable; this node currently running privately"});
    }
    else if(!nodeSettings.isNodeConfigured) {
        res.send({isError: true, message: "aliasing unavailable; this node has not performed initial configuration"});
    }
    else {
        performNodeIdentification(false)
        .then(() => {
            const nodeIdentification = getNodeIdentification();
            
            if(nodeIdentification != null) {
                const nodeIdentifier = nodeIdentification.nodeIdentifier;
                const nodeIdentifierProof = nodeIdentification.nodeIdentifierProof;
                
                aliaser_getCaptcha(nodeIdentifier, nodeIdentifierProof)
                .then(aliaserResponseData => {
                    res.setHeader('Content-Type', 'image/png');
                    aliaserResponseData.pipe(res);
                })
                .catch(error => {
                    logDebugMessageToConsole(null, error, new Error().stack, true);

                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                });
            }
            else {
                logDebugMessageToConsole('/captcha/alias attempted retrieving node identification but was null', null, new Error().stack, true);

                res.send({isError: true, message: 'an error occurred while attempting to alias, please try again later'});
            }
        })
        .catch(error => {
            logDebugMessageToConsole(null, error, new Error().stack, true);

            res.send({isError: true, message: 'an error occurred while attempting to alias, please try again later'});
        });
    }
}

module.exports = {
    discussion_GET,
    likedislike_GET,
    index_GET,
    alias_GET
}
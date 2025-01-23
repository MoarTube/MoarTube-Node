const { getAuthenticationStatus } = require('../utils/helpers');

const performAuthenticationCheck = (isRequired) => {
    return async (req, res, next) => {
        try {
            let isAuthenticated = false;

            if (isRequired) {
                isAuthenticated = await getAuthenticationStatus(req.headers.authorization);
            }

            req.isAuthenticated = isAuthenticated;

            if (isRequired && !isAuthenticated) {
                return res.status(401).send({ isError: true, message: 'you are not logged in' });
            }

            next();
        }
        catch (error) {
            res.status(500).send({ isError: true, message: 'error communicating with the MoarTube node' });
        }
    };
};

module.exports = { performAuthenticationCheck };
const rateLimit = require('express-rate-limit');

const uploadRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // limit each IP to 5 upload requests per windowMs
    message: {
        status: 'failed',
        message: 'Too many upload requests from this IP, please try again later.'
    }
});

module.exports = { uploadRateLimiter }; 
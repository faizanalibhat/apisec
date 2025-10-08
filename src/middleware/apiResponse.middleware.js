import { ApiResponse } from '../utils/ApiResponse.js';

export const apiResponseMiddleware = (req, res, next) => {
    res.sendApiResponse = function(apiResponse) {
        if (apiResponse instanceof ApiResponse) {
            return res.status(apiResponse.statusCode).json(apiResponse.body);
        }
        // Default response if not ApiResponse instance
        return res.status(200).json(apiResponse);
    };
    next();
};
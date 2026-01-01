
export function catchError(callback) {
    return async (req, res, next) => {
        await callback(req, res, next).catch(err => next(err));
    }
}
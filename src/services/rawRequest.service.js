import RawRequest from '../models/rawRequest.model.js';
import { ApiError } from '../utils/ApiError.js';

class RawRequestService {
    async create(data) {
        try {
            // Generate raw HTTP format if not provided
            if (!data.rawHttp) {
                data.rawHttp = this.generateRawHttp(data);
            }

            const rawRequest = await RawRequest.create(data);
            return rawRequest;
        } catch (error) {
            this.handleError(error);
        }
    }

    async findAll(filters, pagination) {
        try {
            const { page, limit } = pagination;
            const skip = (page - 1) * limit;

            const [data, totalItems] = await Promise.all([
                RawRequest.find(filters)
                    .populate('integrationId', 'name')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                RawRequest.countDocuments(filters),
            ]);

            return {
                data,
                currentPage: page,
                totalPages: Math.ceil(totalItems / limit),
                totalItems,
                itemsPerPage: limit,
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async searchWithFilters(searchQuery, additionalFilters, pagination) {
        try {
            const { page, limit } = pagination;
            const skip = (page - 1) * limit;

            const searchConditions = {
                ...additionalFilters, // Combine search with other filters
                $text: { $search: searchQuery },
            };

            const [data, totalItems] = await Promise.all([
                RawRequest.find(searchConditions)
                    .populate('integrationId', 'name')
                    .sort({ score: { $meta: 'textScore' } }) // Sort by relevance for search
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                RawRequest.countDocuments(searchConditions),
            ]);

            return {
                data,
                currentPage: page,
                totalPages: Math.ceil(totalItems / limit),
                totalItems,
                itemsPerPage: limit,
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async findOne(id, orgId) {
        try {
            const rawRequest = await RawRequest.findOne({
                _id: id,
                orgId,
            })
                .populate('integrationId', 'name')
                .lean();

            if (!rawRequest) {
                throw ApiError.notFound('Raw request not found');
            }

            return rawRequest;
        } catch (error) {
            this.handleError(error);
        }
    }

    async update(id, updateData, orgId) {
        try {
            // Remove fields that shouldn't be updated
            const { _id, orgId: _, integrationId, createdAt, updatedAt, ...validUpdateData } = updateData;

            // Regenerate rawHttp if request details changed
            if (validUpdateData.method || validUpdateData.url || validUpdateData.headers || validUpdateData.body) {
                validUpdateData.rawHttp = this.generateRawHttp({
                    ...validUpdateData,
                    method: validUpdateData.method || 'GET',
                });
            }

            const rawRequest = await RawRequest.findOneAndUpdate(
                { _id: id, orgId },
                validUpdateData,
                { new: true, runValidators: true }
            )
                .populate('integrationId', 'name')
                .lean();

            if (!rawRequest) {
                throw ApiError.notFound('Raw request not found');
            }

            return rawRequest;
        } catch (error) {
            this.handleError(error);
        }
    }

    async delete(id, orgId) {
        try {
            const result = await RawRequest.findOneAndDelete({
                _id: id,
                orgId,
            });

            if (!result) {
                throw ApiError.notFound('Raw request not found');
            }

            return result;
        } catch (error) {
            this.handleError(error);
        }
    }

    async bulkDelete(requestIds, orgId) {
        try {
            if (!Array.isArray(requestIds) || requestIds.length === 0) {
                throw ApiError.badRequest('Request IDs must be a non-empty array');
            }

            const result = await RawRequest.deleteMany({
                _id: { $in: requestIds },
                orgId,
            });

            return {
                deletedCount: result.deletedCount,
                requestedCount: requestIds.length,
            };
        } catch (error) {
            this.handleError(error);
        }
    }

    async deleteByIntegrationId(integrationId, orgId) {
        try {
            const result = await RawRequest.deleteMany({
                integrationId,
                orgId,
            });

            return result.deletedCount;
        } catch (error) {
            this.handleError(error);
        }
    }

    generateRawHttp(requestData) {
        const { method = 'GET', url = '', headers = {}, body = null } = requestData;

        let rawHttp = `${method} ${url} HTTP/1.1\n`;

        // Add headers
        Object.entries(headers).forEach(([key, value]) => {
            rawHttp += `${key}: ${value}\n`;
        });

        // Add body if present
        if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
            rawHttp += '\n';
            if (typeof body === 'object') {
                rawHttp += JSON.stringify(body, null, 2);
            } else {
                rawHttp += body;
            }
        }

        return rawHttp;
    }

    handleError(error) {
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => ({
                field: err.path,
                message: err.message,
            }));
            throw ApiError.validationError('Validation failed', errors);
        }

        if (error.name === 'CastError') {
            throw ApiError.badRequest('Invalid ID format');
        }

        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            throw ApiError.conflict(`Duplicate value for ${field}`);
        }

        if (error instanceof ApiError) {
            throw error;
        }

        throw ApiError.internal('An error occurred while processing the request');
    }
}

export default RawRequestService;
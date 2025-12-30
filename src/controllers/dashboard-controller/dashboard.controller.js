import { DashboardService } from '../../services/dashboard.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../utils/logger.js';

class DashboardController {
    constructor() {
        this.dashboardService = new DashboardService();
        
        // Bind methods to maintain context
        this.getDashboardStats = this.getDashboardStats.bind(this);
    }

    async getDashboardStats(req, res, next) {
        const { orgId, firstName, lastName, email, _id } = req.authenticatedService;
        const { trace_id } = req.context;
        try {
            const { period = '7d' } = req.query;

            // Validate period format
            const validPeriodPattern = /^\d+[dhm]$/; // e.g., 7d, 30d, 24h, 3m

            if (!validPeriodPattern.test(period)) {
                throw ApiError.badRequest('Invalid period format. Use format like 7d, 30d, 24h, 3m');
            }

            const dashboardData = await this.dashboardService.getDashboardStats(
                orgId,
                period
            );

            logger.info(`WAS Dashboard Controller Success`, {
                actor: {
                    name: firstName + " " + lastName,
                    email,
                    user_id: _id,
                },
                request: {
                    trace_id: trace_id,
                    method: req.method,
                    url: req.url,
                    query: req.query,
                    body: req.body,
                },
                event: {
                    action: "was.dashboard.fetch",
                }
            });

            res.sendApiResponse(
                ApiResponse.success('Dashboard statistics fetched successfully', dashboardData)
            );
        } catch (error) {
            logger.error(`WAS Dashboard Controller Error : ${error.message}`, {
                actor: {
                    name: firstName + " " + lastName,
                    email,
                    user_id: _id,
                },
                request: {
                    trace_id: trace_id,
                    method: req.method,
                    url: req.url,
                    query: req.query,
                    body: req.body,
                },
                event: {
                    action: "was.dashboard.fetch",
                }
            })
            next(error);
        }
    }
}

// Create instance
const dashboardController = new DashboardController();

export const {
    getDashboardStats
} = dashboardController;
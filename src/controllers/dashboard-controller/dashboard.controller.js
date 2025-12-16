import { DashboardService } from '../services/dashboard.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';

class DashboardController {
    constructor() {
        this.dashboardService = new DashboardService();
        
        // Bind methods to maintain context
        this.getDashboardStats = this.getDashboardStats.bind(this);
    }

    async getDashboardStats(req, res, next) {
        try {
            const { orgId } = req.authenticatedService;
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

            res.sendApiResponse(
                ApiResponse.success('Dashboard statistics fetched successfully', dashboardData)
            );
        } catch (error) {
            next(error);
        }
    }
}

// Create instance
const dashboardController = new DashboardController();

export const {
    getDashboardStats
} = dashboardController;
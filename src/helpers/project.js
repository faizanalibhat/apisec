import Vulnerability from "../models/vulnerability.model.js";
import RawRequest from "../models/rawRequest.model.js";
import Scan from "../models/scan.model.js";
import TransformedRequest from "../models/transformedRequest.model.js";
import Rule from "../models/rule.model.js";
import { ApiError } from "../utils/ApiError.js";
import mongoose from "mongoose";
const { ObjectId } = mongoose.Types;
import { RESOLVED_VULNERABILITY_STATES } from "../config/constants.js";

export const getPeriodStartDate = (period) => {
  const now = new Date();
  const value = parseInt(period.slice(0, -1));
  const unit = period.slice(-1);

  switch (unit) {
    case "d": // days
      now.setDate(now.getDate() - value);
      break;
    case "h": // hours
      now.setHours(now.getHours() - value);
      break;
    case "m": // months
      now.setMonth(now.getMonth() - value);
      break;
    default:
      throw ApiError.badRequest(
        "Invalid period unit. Use d for days, h for hours, or m for months",
      );
  }

  return now;
};

export const getStateDistribution = async (projectId, orgId, startDate) => {
  try {
    const results = await Vulnerability.aggregate([
      {
        $match: {
          projectId: ObjectId.createFromHexString(projectId),
          orgId,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Initialize all possible states with 0
    // const distribution = {
    //   active: 0,
    //   resolved: 0,
    // };

    // // Update with actual counts
    // results.forEach((result) => {
    //   if (result._id && distribution.hasOwnProperty(result._id)) {
    //     distribution[result._id] = result.count;
    //   }
    // });

    return results;
  } catch (error) {
    handleError(error);
  }
};

export const getSeverityDistribution = async (projectId, orgId, startDate) => {
  try {
    const results = await Vulnerability.aggregate([
      {
        $match: {
          projectId: ObjectId.createFromHexString(projectId),
          orgId,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$severity",
          count: { $sum: 1 },
        },
      },
    ]);

    // Initialize all severity levels with 0
    const distribution = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    // Update with actual counts
    results.forEach((result) => {
      if (result._id && distribution.hasOwnProperty(result._id)) {
        distribution[result._id] = result.count;
      }
    });

    // Remove 'info' if not needed in UI
    // delete distribution.info;

    return distribution;
  } catch (error) {
    handleError(error);
  }
};

export const getTotalVulnerabilities = async (projectId, orgId, startDate) => {
  try {
    const count = await Vulnerability.countDocuments({
      projectId: ObjectId.createFromHexString(projectId),
      orgId,
      createdAt: { $gte: startDate },
    });
    return count;
  } catch (error) {
    handleError(error);
  }
};

export const getTotalResolvedVulnerabilities = async (
  projectId,
  orgId,
  startDate,
) => {
  try {
    const count = await Vulnerability.countDocuments({
      projectId: ObjectId.createFromHexString(projectId),
      orgId,
      status: { $in: RESOLVED_VULNERABILITY_STATES },
      createdAt: { $gte: startDate },
    });
    return count;
  } catch (error) {
    handleError(error);
  }
};

export const getTotalRawRequests = async (projectId, orgId) => {
  try {
    return await RawRequest.countDocuments({
      projectIds: ObjectId.createFromHexString(projectId),
      orgId,
    });
  } catch (error) {
    handleError(error);
  }
};

export const getTotalTransformedRequests = async (projectId, orgId) => {
  try {
    // Find scans related to the project
    const scans = await Scan.find({ projectIds: projectId, orgId })
      .select("_id")
      .lean();
    const scanIds = scans.map((s) => s._id);

    if (scanIds.length === 0) {
      return 0;
    }

    // Count transformed requests for those scans
    return await TransformedRequest.countDocuments({
      scanId: { $in: scanIds },
      orgId,
    });
  } catch (error) {
    handleError(error);
  }
};

export const getTotalRules = async (orgId) => {
  try {
    return await Rule.countDocuments({ orgId, isActive: true });
  } catch (error) {
    handleError(error);
  }
};

export const getActiveRulesCount = (project, totalRules) => {
  if (project.includedRuleIds && project.includedRuleIds.length > 0) {
    return project.includedRuleIds.length;
  }
  if (project.excludedRuleIds && project.excludedRuleIds.length > 0) {
    return totalRules - project.excludedRuleIds.length;
  }
  return totalRules;
};

const handleError = (error) => {
  console.error("Original error:", error);
  if (error.name === "ValidationError") {
    const errors = Object.values(error.errors).map((err) => ({
      field: err.path,
      message: err.message,
    }));
    throw ApiError.validationError("Validation failed", errors);
  }

  if (error.name === "CastError") {
    throw ApiError.badRequest("Invalid ID format");
  }

  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    throw ApiError.conflict(`Duplicate value for ${field}`);
  }

  if (error instanceof ApiError) {
    throw error;
  }

  throw ApiError.internal(
    "An error occurred while processing the project operation",
  );
};

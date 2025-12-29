import { AuthProfile } from "../../models/auth-profile.model.js"
import { filter_config } from "./config/filter-config.js"
import { QueryBuilder } from "../../utils/query-builder/query-builder.js"


export class AuthProfileController {

    static getAuthProfiles = async (req, res, next) => {
        const { orgId } = req.authenticatedService;
        
        const queryParamsWithOrgId = {
            ...req.query,
            orgId: orgId.toString()
        };

        const stages = QueryBuilder.buildStages(filter_config, queryParamsWithOrgId);

        const filterQuery = stages.preLookupMatch ? stages.preLookupMatch : {};
        
        const paginationStages = stages.pagination;
        
        const sortOptions = stages.sort ? stages.sort : {};
        
        const authProfiles = await AuthProfile.find(filterQuery)
            .skip(paginationStages.skip)
            .limit(paginationStages.limit)
            .sort(sortOptions)
            .lean();
        
        const total = await AuthProfile.countDocuments(filterQuery);

        return res.json({ data: authProfiles, total });
    }

    static getAuthProfile = async (req, res, next) => {
        const { orgId } = req.authenticatedService;
        const { id } = req.params;

        const authProfile = await AuthProfile.findOne({ orgId, _id: id });

        return res.json({ data: authProfile });
    }

    static createAuthProfile = async (req, res, next) => {
        const { orgId } = req.authenticatedService;

        const profile = { ...(req.body || {}) };

        // Normalize overrideHost if provided
        if (profile.overrideHost) {
            try {
                let rawOverrideHost = profile.overrideHost;
                if (!/^https?:\/\//i.test(rawOverrideHost)) rawOverrideHost = 'http://' + rawOverrideHost;
                const parsed = new URL(rawOverrideHost);
                profile.overrideHost = parsed.origin;
            } catch (err) {
                // keep original if invalid
            }
        }

        const authProfile = await AuthProfile.create({ orgId, ...profile });

        return res.json(authProfile);
    }

    static updateAuthProfile = async (req, res, next) => {
        const { orgId } = req.authenticatedService;
        const { id } = req.params;

        const updates = req.body;

        if (updates && updates.overrideHost) {
            try {
                let rawOverrideHost = updates.overrideHost;
                if (!/^https?:\/\//i.test(rawOverrideHost)) rawOverrideHost = 'http://' + rawOverrideHost;
                const parsed = new URL(rawOverrideHost);
                updates.overrideHost = parsed.origin;
            } catch (err) {
                // ignore invalid
            }
        }

        const authProfile = await AuthProfile.findOneAndUpdate({ orgId, _id: id }, { $set: updates }, { new: true });

        return res.json(authProfile);
    }

    static deleteAuthProfile = async (req, res, next) => {
        const { orgId } = req.authenticatedService;
        const { id } = req.params;

        const authProfile = await AuthProfile.findOneAndDelete({ orgId, _id: id });

        return res.json(authProfile);
    }

}
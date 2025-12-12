import _ from "lodash";

// --- STAGE CONSTANTS ---
const STAGE = {
    PRE_LOOKUP: 'preLookupMatch',   // Filters applied before $lookup
    POST_LOOKUP: 'postLookupMatch',  // Filters applied after $lookup on joined fields
    SEARCH: 'search',               // Stage for full-text search or complex $or
    SORT: 'sort',                   // Stage for $sort
    PAGINATION: 'pagination'        // Stage for $skip and $limit
};


export { STAGE }; // Export stages for use in configuration


export class QueryBuilder {

    static handlers = [
        // NEW HANDLERS for non-$match stages MUST run first
        QueryBuilder.handleSort,
        QueryBuilder.handlePagination,
        
        // Existing handlers adapted for staged $match
        QueryBuilder.handleRegex,
        QueryBuilder.handleMultiple,
        QueryBuilder.handleCompare,
        QueryBuilder.handleDefaultMatch, // Renamed handler
    ];

    static buildStages(config = [], queryParams) {
        const configMap = new Map();
        config.forEach(conf => configMap.set(conf.filter, conf));

        // 1. Initialize staged accumulator object
        // Match stages store key/value conditions. Non-match stages store objects/arrays.
        const stagedConditions = {
            [STAGE.PRE_LOOKUP]: {},
            [STAGE.POST_LOOKUP]: {},
            [STAGE.SEARCH]: {},
            [STAGE.SORT]: null,
            [STAGE.PAGINATION]: { skip: 0, limit: 10 } // Use 0 limit/skip as default
        };

        for (const key in queryParams) {
            if (!configMap.has(key)) continue;

            const conf = configMap.get(key);
            const rawValue = queryParams[key];

            // Ensure stage is defined
            if (!conf.stage) {
                console.warn(`Query parameter '${key}' is missing the 'stage' configuration.`);
                continue;
            }

            const value = conf.transformer ? conf.transformer(rawValue) : rawValue;

            // Combine per-config handlers + global static handlers
            const handlers = [
                ...(conf.handlers || []),
                ...QueryBuilder.handlers
            ];

            for (const handler of handlers) {
                // Pass the stagedConditions object and the original queryParams (needed for pagination calculation)
                const handled = handler(stagedConditions, key, value, conf, queryParams);
                if (handled) break; // stop at the first handler that applies
            }
        }

        // 2. Compile raw conditions into final MongoDB stage objects
        return QueryBuilder._compileStages(stagedConditions);
    }

    static _compileStages(conditions) {
        const finalStages = {};

        // Compile Match stages (PRE_LOOKUP, POST_LOOKUP, SEARCH)
        for (const key of [STAGE.PRE_LOOKUP, STAGE.POST_LOOKUP, STAGE.SEARCH]) {
            const stageConditions = conditions[key];
            if (Object.keys(stageConditions).length > 0) {
                // The stage conditions object is already the content of the $match operator
                finalStages[key] = stageConditions;
            }
        }

        // Compile Sort stage
        if (conditions[STAGE.SORT]) {
            finalStages[STAGE.SORT] = conditions[STAGE.SORT];
        }

        // Compile Pagination stages (can be multiple stages)
        const { skip, limit } = conditions[STAGE.PAGINATION];
        if (skip >= 0 && limit > 0) { // Only add if limit is set
            finalStages[STAGE.PAGINATION] = {
                skip: skip,
                limit: limit
            };
        }

        return finalStages;
    }

    // NEW HANDLER: Sort stage
    static handleSort(conditions, key, value, conf) {
        if (conf.stage !== STAGE.SORT) return false;

        const direction = value.startsWith('-') ? -1 : 1;
        const field = value.replace(/^-/, ''); // Remove the leading dash if it exists

        // Target the special 'sort' storage bucket
        conditions[STAGE.SORT] = { [field]: direction };
        return true;
    }

    // NEW HANDLER: Pagination stage
    static handlePagination(conditions, key, value, conf, queryParams) {
        if (conf.stage !== STAGE.PAGINATION) return false;
        
        // This handler processes both 'page' and 'limit' but only needs to run once per request.
        // We only proceed if we're handling the 'limit' key to avoid double-calculating.
        if (key !== 'limit' && key !== 'page') return false;
        
        // Fetch page and limit from the original request query
        const limit = parseInt(queryParams.limit) || 20; // Default limit
        const page = parseInt(queryParams.page) || 1;
        
        // Target the special 'pagination' storage bucket
        conditions[STAGE.PAGINATION].limit = limit;
        conditions[STAGE.PAGINATION].skip = Math.max(0, (page - 1) * limit);
        return true;
    }


    // Regex handler - Adapted to use stage-specific accumulation
    static handleRegex(conditions, key, value, conf) {
        if (!conf.regex) return false;
        if (![STAGE.PRE_LOOKUP, STAGE.POST_LOOKUP, STAGE.SEARCH].includes(conf.stage)) return false;

        const safeValue = _.escapeRegExp(value);

        const regex = new RegExp(
            `${conf.prefix || ""}${safeValue || '.*'}${conf.suffix || ""}`,
            conf.options || "i"
        );

        const targets = conf.target || [conf.field || key];
        const stageConditions = conditions[conf.stage];

        if (targets.length > 1) {
            // For multi-target regex, we typically use $or, which is best handled in the SEARCH stage
            stageConditions.$or = targets.map(t => ({ [t]: { $regex: regex } }));
        } else {
            stageConditions[targets[0]] = { $regex: regex };
        }

        return true;
    }

    // Multiple values handler - Adapted to use stage-specific accumulation
    static handleMultiple(conditions, key, value, conf) {
        if (!conf.multiple) return false;
        if (![STAGE.PRE_LOOKUP, STAGE.POST_LOOKUP, STAGE.SEARCH].includes(conf.stage)) return false;

        const delimiter = conf.delimiter || ",";
        const values = value.split(delimiter).map(v => v.trim());

        conditions[conf.stage][conf.field || key] = { $in: values };
        return true;
    }

    // Comparison handler (gt, gte, lt, lte) - Adapted to use stage-specific accumulation
    static handleCompare(conditions, key, value, conf) {
        if (!conf.compare) return false;
        if (![STAGE.PRE_LOOKUP, STAGE.POST_LOOKUP, STAGE.SEARCH].includes(conf.stage)) return false;

        const field = conf.field || key;
        const opMap = { gt: "$gt", gte: "$gte", lt: "$lt", lte: "$lte" };
        const mongoOp = opMap[conf.compare];
        if (!mongoOp) return false;

        const stageConditions = conditions[conf.stage];
        if (!stageConditions[field]) stageConditions[field] = {};
        stageConditions[field][mongoOp] = value;

        return true;
    }

    // Default equality handler - Renamed and Adapted to use stage-specific accumulation
    static handleDefaultMatch(conditions, key, value, conf) {
        // Ensure this only runs for match stages (PRE/POST/SEARCH)
        if (![STAGE.PRE_LOOKUP, STAGE.POST_LOOKUP, STAGE.SEARCH].includes(conf.stage)) return false; 
        
        const field = conf.field || key;
        conditions[conf.stage][field] = value;
        return true;
    }

    /** ----------------- EXTENSIBILITY ----------------- **/

    static addHandler(handlerFn) {
        // Custom global handlers take priority over built-in handlers
        QueryBuilder.handlers.unshift(handlerFn); 
    }
}
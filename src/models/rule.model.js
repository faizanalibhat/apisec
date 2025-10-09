import mongoose from 'mongoose';

const ruleSchema = new mongoose.Schema({
    orgId: {
        type: String,
        required: true,
    },

    rule_name: {
        type: String,
        required: true,
        trim: true
    },

    target: {
        type: String,
        required: true,
        default: 'all',
        enum: ['all', 'specific'],
        // If specific, endpoints array will be used
    },

    endpoints: [{
        type: String,
        trim: true
        // Only used when target is 'specific'
    }],

    transform: {
        headers: {
            add: {
                type: Map,
                of: String
            },
            remove: [String]
        },

        overrideHost: {
            type: String,
            trim: true
        },

        queryParams: {
            add: {
                type: Map,
                of: String
            },
            remove: [String]
        },

        body: {
            add: {
                type: Map,
                of: mongoose.Schema.Types.Mixed
            },
            remove: [String]
        },

        method: {
            type: String,
            enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']
        }
    },

    match_on: {
        status: {
            type: Number,
            min: 100,
            max: 599
        },

        responseContains: {
            type: String
        },

        responseNotContains: {
            type: String
        },

        headers: {
            type: Map,
            of: String
        }
    },

    report: {
        title: {
            type: String,
            required: true
        },

        description: {
            type: String,
            required: true
        },

        severity: {
            type: String,
            required: true,
            enum: ['low', 'medium', 'high', 'critical']
        },

        cvssScore: {
            type: Number,
            required: true,
            min: 0,
            max: 10
        },

        cweId: {
            type: String
        },

        owaspCategory: {
            type: String
        }
    },

    isActive: {
        type: Boolean,
        default: true
    },

    tags: [{
        type: String,
        trim: true
    }],

    raw_yaml: { type: String, required: true },
}, {
    timestamps: true
});

// Indexes
ruleSchema.index({ organizationId: 1, ruleName: 1 }, { unique: true });
ruleSchema.index({ 'report.title': 'text', ruleName: 'text' });
// ruleSchema.index({ tags: 1 });

const Rule = mongoose.model('Rule', ruleSchema);

export default Rule;
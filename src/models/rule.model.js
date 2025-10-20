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

    Target: {
        method: {
            type: [String],
        },
        Request_contains: {
            type: String,
        },
        body: {
            contains: {
                type: String,
            }
        },
        Header: {
            contains: {
                type: String,
            }
        },
        query: {
            contains: {
                type: String,
            }
        },
        path: {
            contains: {
                type: String,
            }
        }
    },

    endpoints: [{
        type: String,
        trim: true
        // Only used when target is 'specific'
    }],

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
    parsed_yaml: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
    timestamps: true
});

// Indexes
ruleSchema.index({ 'report.title': 'text', ruleName: 'text' });
// ruleSchema.index({ tags: 1 });

const Rule = mongoose.model('Rule', ruleSchema);

export default Rule;
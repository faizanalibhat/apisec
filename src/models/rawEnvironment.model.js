import mongoose from 'mongoose';

const rawEnvironmentSchema = new mongoose.Schema(
    {
        orgId: {
            type: String,
            required: true,
            index: true,
        },
        integrationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Integration',
            // required: true,
            index: true,
        },
        workspaceId: {
            type: String,
            // required: true,
            index: true,
        },
        workspaceName: {
            type: String,
            required: true,
        },
        postmanEnvironmentId: {
            type: String,
            // required: true,
            index: true,
        },
        postmanUid: {
            type: String,
            // required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        owner: {
            type: String,
            // required: true,
        },
        values: [
            {
                key: {
                    type: String,
                    default: '',
                },
                value: {
                    type: mongoose.Schema.Types.Mixed,
                    default: '',
                },
                type: {
                    type: String,
                    enum: ['default', 'secret', 'any'],
                    default: 'default',
                },
                enabled: {
                    type: Boolean,
                    default: true,
                },
            },
        ],
        postmanUrl: {
            type: String,
            default: null,
        },
        isPublic: {
            type: Boolean,
            default: false,
        },
        postmanCreatedAt: {
            type: Date,
            default: null,
        },
        postmanUpdatedAt: {
            type: Date,
            default: null,
        },
        isEdited: {
            type: Boolean,
            default: false,
        },
        originalData: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Indexes for search functionality
rawEnvironmentSchema.index({ name: 'text', 'values.key': 'text', 'values.value': 'text' });
rawEnvironmentSchema.index({ workspaceId: 1, orgId: 1 });
rawEnvironmentSchema.index({ postmanEnvironmentId: 1, orgId: 1 }, { unique: true, sparse: true });

// Mark as edited when updating
rawEnvironmentSchema.pre('findOneAndUpdate', function () {
    const update = this.getUpdate();
    if (!update.$set) update.$set = {};
    update.$set.isEdited = true;

    // Store original data on first edit
    if (!update.$set.originalData && !this.getOptions().skipEdit) {
        update.$setOnInsert = { originalData: this.getQuery() };
    }
});

// Method to generate Postman URL
rawEnvironmentSchema.methods.generatePostmanUrl = function (teamDomain, userId) {
    if (!teamDomain || !userId) {
        return null;
    }

    return `https://${teamDomain}.postman.co/workspace/${encodeURIComponent(this.workspaceName)}~${this.workspaceId}/environment/${userId}-${this.postmanUid}`;
};

// Virtual to get only enabled variables
rawEnvironmentSchema.virtual('enabledValues').get(function () {
    return this.values.filter(v => v.enabled && v.key);
});

// Method to get variable value by key
rawEnvironmentSchema.methods.getVariable = function (key) {
    const variable = this.values.find(v => v.key === key && v.enabled);
    return variable ? variable.value : null;
};

// Method to update variable value
rawEnvironmentSchema.methods.updateVariable = function (key, value) {
    const index = this.values.findIndex(v => v.key === key);
    if (index !== -1) {
        this.values[index].value = value;
    } else {
        this.values.push({ key, value, type: 'any', enabled: true });
    }
    return this.save();
};

const RawEnvironment = mongoose.model('RawEnvironment', rawEnvironmentSchema, 'raw_environments');

export default RawEnvironment;
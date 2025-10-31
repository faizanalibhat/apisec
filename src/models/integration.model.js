import mongoose from 'mongoose';

const integrationSchema = new mongoose.Schema({
    orgId: {
        type: String,
        required: [true, 'orgId is required'],
        // index: true
    },
    type: {
        type: String,
        enum: ['postman', 'swagger'],
        required: [true, 'Integration type is required'],
        default: 'postman'
    },
    environmentId: { type: mongoose.Types.ObjectId, required: false },
    name: {
        type: String,
        required: [true, 'Integration name is required'],
        trim: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    // Postman-specific fields
    apiKey: {
        type: String,
        required: function() { return this.type === 'postman'; }
    },
    postmanUserId: {
        type: String,
        default: null
    },
    postmanTeamDomain: {
        type: String,
        default: null
    },
    workspaces: {
        type: [{
            id: {
                type: String,
                required: true
            },
            name: {
                type: String,
                required: true
            },
            collections: [{
                id: {
                    type: String,
                    required: true
                },
                uid: {
                    type: String,
                    required: true
                },
                name: {
                    type: String,
                    required: true
                },
                postmanUrl: {
                    type: String,
                    default: null
                }
            }]
        }],
        required: function() { return this.type === 'postman'; },
        default: undefined
    },
    // Swagger-specific fields
    sourceUrl: {
        type: String,
        required: function() { return this.type === 'swagger'; }
    },
    swaggerSpec: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    swaggerInfo: {
        title: String,
        version: String,
        description: String,
        host: String,
        basePath: String,
        schemes: [String],
        servers: [{
            url: String,
            description: String
        }]
    },
    // Common metadata
    metadata: {
        lastSyncedAt: {
            type: Date,
            default: null
        },
        totalRequests: {
            type: Number,
            default: 0
        },
        totalCollections: {
            type: Number,
            default: 0
        },
        totalEndpoints: {
            type: Number,
            default: 0
        },
        status: {
            type: String,
            enum: ['pending', 'syncing', 'completed', 'failed'],
            default: 'pending'
        },
        lastError: {
            type: String,
            default: null
        }
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Create text index for searching
integrationSchema.index({ name: 'text', description: 'text' });
integrationSchema.index({ type: 1, orgId: 1 });

// Virtual for checking if sync is needed (e.g., not synced in last 24 hours)
integrationSchema.virtual('needsSync').get(function () {
    if (!this.metadata.lastSyncedAt) return true;
    const hoursSinceSync = (Date.now() - this.metadata.lastSyncedAt.getTime()) / (1000 * 60 * 60);
    return hoursSinceSync > 24;
});

// Method to update sync status
integrationSchema.methods.updateSyncStatus = function (status, error = null) {
    this.metadata.status = status;
    if (status === 'completed') {
        this.metadata.lastSyncedAt = new Date();
        this.metadata.lastError = null;
    } else if (status === 'failed') {
        this.metadata.lastError = error;
    }
    return this.save();
};

// Method to update sync metadata
integrationSchema.methods.updateSyncMetadata = function (totalRequests, totalCollections, totalEndpoints = null) {
    this.metadata.totalRequests = totalRequests;
    this.metadata.totalCollections = totalCollections;
    if (totalEndpoints !== null) {
        this.metadata.totalEndpoints = totalEndpoints;
    }
    return this.save();
};

// Method to generate Postman URL for a collection
integrationSchema.methods.generatePostmanUrl = function (workspaceName, workspaceId, collectionUid) {
    if (this.type !== 'postman' || !this.postmanTeamDomain || !this.postmanUserId) {
        return null;
    }

    return `https://${this.postmanTeamDomain}.postman.co/workspace/${encodeURIComponent(workspaceName)}~${workspaceId}/collection/${this.postmanUserId}-${collectionUid}`;
};

// Method to find collection by name (Postman only)
integrationSchema.methods.findCollectionByName = function (collectionName, workspaceName) {
    if (this.type !== 'postman' || !this.workspaces) {
        return null;
    }
    
    for (const workspace of this.workspaces) {
        if (!workspaceName || workspace.name === workspaceName) {
            const collection = workspace.collections.find(c => c.name === collectionName);
            if (collection) {
                return {
                    collection,
                    workspace,
                    postmanUrl: collection.postmanUrl
                };
            }
        }
    }
    return null;
};

// Pre-save validation to ensure required fields based on type
integrationSchema.pre('save', function(next) {
    if (this.type === 'postman' && !this.apiKey) {
        next(new Error('API key is required for Postman integrations'));
    } else if (this.type === 'swagger' && !this.sourceUrl) {
        next(new Error('Source URL is required for Swagger integrations'));
    } else {
        next();
    }
});

const Integration = mongoose.model('Integration', integrationSchema);

export default Integration;
import mongoose from 'mongoose';

const integrationSchema = new mongoose.Schema({
    orgId: {
        type: String,
        required: [true, 'Organization ID is required'],
        // index: true
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
    apiKey: {
        type: String,
        required: [true, 'API key is required']
    },
    workspaces: [{
        id: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true
        }
    }],
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

// Compound index for unique integration per organization
integrationSchema.index({ organizationId: 1, name: 1 }, { unique: true });

// Create text index for searching
integrationSchema.index({ name: 'text', description: 'text' });

// Virtual for checking if sync is needed (e.g., not synced in last 24 hours)
integrationSchema.virtual('needsSync').get(function() {
    if (!this.metadata.lastSyncedAt) return true;
    const hoursSinceSync = (Date.now() - this.metadata.lastSyncedAt.getTime()) / (1000 * 60 * 60);
    return hoursSinceSync > 24;
});

// Method to update sync status
integrationSchema.methods.updateSyncStatus = function(status, error = null) {
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
integrationSchema.methods.updateSyncMetadata = function(totalRequests, totalCollections) {
    this.metadata.totalRequests = totalRequests;
    this.metadata.totalCollections = totalCollections;
    return this.save();
};

const Integration = mongoose.model('Integration', integrationSchema);

export default Integration;
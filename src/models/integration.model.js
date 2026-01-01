import mongoose from 'mongoose';

export const INTEGRATION_TYPES = ['postman', 'swagger'];
export const INTEGRATION_STATUS = ['installing', 'installed', 'refreshing', 'failed'];


const configSchema = new mongoose.Schema({
    api_key: { type: String, required: true },
    url: { type: String, required: true }
}, { _id: false });


const integrationSchema = new mongoose.Schema({
    orgId: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        enum: INTEGRATION_TYPES,
        required: true,
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },

    config: {
        type: configSchema,
        required: true,
        select: false
    },

    last_refresh: { type: Date },

    status: { type: String, enum: INTEGRATION_STATUS, default: 'installing' },
}, {
    timestamps: true
});



export const Integration = mongoose.model('Integration', integrationSchema);
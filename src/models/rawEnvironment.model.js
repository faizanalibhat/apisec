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

const RawEnvironment = mongoose.model('RawEnvironment', rawEnvironmentSchema, 'raw_environments');

export default RawEnvironment;
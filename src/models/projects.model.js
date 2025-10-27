import mongoose from "mongoose";

const ownerSchema = new mongoose.Schema({
    name: String,
    email: String,
    userId: String,
    role: { type: String, enum: ["member", "admin", "owner"], default: "member" },
}, { _id: false });

const schema = new mongoose.Schema({
    orgId: { type: String, required: true },

    name: { type: String, required: true },
    description: { type: String },

    collaborators: { type: [ownerSchema], default: [] },

    collectionUids: { type: [String], default: [] },

    // Rule management
    includedRuleIds: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'Rule',
        default: []
    },
    excludedRuleIds: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'Rule',
        default: []
    },

    // Scan configuration
    scanSettings: {
        autoIncludeNewRules: { type: Boolean, default: true },
        lastModifiedBy: { type: String },
        lastModifiedAt: { type: Date }
    }

}, { timestamps: true });

// Index for performance
schema.index({ orgId: 1, name: 1 });
schema.index({ orgId: 1, collectionUids: 1 });

const Projects = mongoose.model("projects", schema);

export { Projects };
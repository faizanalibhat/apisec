import mongoose from "mongoose";

const SCOPE_TYPE = ["url", "regex"];
const CRAWLER_SCANS = ["aggressive", "intelligent"];


const ownerSchema = new mongoose.Schema({
    name: String,
    email: String,
    userId: String,
    role: { type: String, enum: ["member", "admin", "owner"], default: "member" },
}, { _id: false });



const scopeSchema = new mongoose.Schema({
    type: { type: String, enum: SCOPE_TYPE, default: "url" },
    value: { type: String, required: true },
}, { _id: false })


const configurationSchema = new mongoose.Schema({
    target_url: { type: String, required: true },
    application_name: { type: String },
    owner: { type: ownerSchema },
    tags: { type: [String], default: [] },
    scope: { type: [scopeSchema] },
    exclude_scope: { type: [scopeSchema] },
    scan_type: { type: String, enum: CRAWLER_SCANS, default: "aggressive" },
    auth_success_string: { type: String },
});

const fileSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    original_name: { type: String, required: true },
    file_type: { type: String, required: true },
    file_size: { type: Number, required: true },
    storage: { type: String },
    path: { type: String, required: true }
});

const schema = new mongoose.Schema({
    orgId: { type: String, required: true },

    name: { type: String, required: true },
    description: { type: String },

    isCollecting: { type: Boolean, default: true },

    collaborators: { type: [ownerSchema], default: [] },

    owner: { type: ownerSchema },

    configuration: { type: configurationSchema },


    authScript: { type: fileSchema },

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
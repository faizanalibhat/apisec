import mongoose, { Schema } from "mongoose";

const rawRequestSchema = new mongoose.Schema(
  {
    orgId: {
      type: String,
      required: true,
      index: true,
    },
    integrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Integration",
      required: false,
      index: true,
    },

    collectionUid: { type: String },

    projectIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },

    name: {
      type: String,
      required: false,
      trim: true,
    },

    method: {
      type: String,
      required: true,
      enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
      uppercase: true,
    },

    url: {
      type: String,
      required: false,
    },
    headers: {
      type: Map,
      of: String,
      default: {},
    },
    params: {
      type: Map,
      of: String,
      default: {},
    },

    body: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    mode: { type: String },

    language: { type: String },

    body_format: { type: String },

    rawHttp: {
      type: String,
      required: true,
    },
    collectionName: {
      type: String,
      required: false,
      default: "Browser Import",
    },
    folderName: {
      type: String,
      default: null,
    },
    source: {
      type: String,
      enum: ["postman", "browser-extension", "swagger", "crawler"],
      default: "postman",
      index: true,
    },
    browserMetadata: {
      type: {
        tabId: Number,
        responseStatus: Number,
        responseHeaders: mongoose.Schema.Types.Mixed,
        responseBody: String,
        extensionTimestamp: Number,
      },
      default: null,
    },
    swaggerMetadata: {
      type: {
        operationId: String,
        tags: [String],
        summary: String,
        description: String,
        consumes: [String],
        produces: [String],
        security: [mongoose.Schema.Types.Mixed],
        deprecated: Boolean,
        pathPattern: String,
        basePath: String,
        host: String,
        schemes: [String],
        servers: [{ url: String, description: String }],
      },
      default: null,
    },
    postmanId: {
      type: String,
      default: null,
    },
    description: {
      type: String,
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
  },
);

// Indexes for search functionality
rawRequestSchema.index({ name: "text", url: "text", description: "text" });
rawRequestSchema.index({ method: 1, orgId: 1 });
rawRequestSchema.index({ collectionName: 1, orgId: 1 });
rawRequestSchema.index({ source: 1, orgId: 1 });

// Add compound unique index for project-based uniqueness
rawRequestSchema.index(
  { orgId: 1, projectIds: 1, method: 1, url: 1 },
  { unique: true, partialFilterExpression: { source: "browser-extension" } },
);

rawRequestSchema.index(
  {
    orgId: 1,
    method: 1,
    url: 1,
    projectIds: 1,
    source: 1,
  },
  {
    unique: true,
    background: true,
  },
);

// Mark as edited when updating
rawRequestSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate();
  if (!update.$set) update.$set = {};
  update.$set.isEdited = true;

  // Store original data on first edit
  if (!update.$set.originalData && !this.getOptions().skipEdit) {
    update.$setOnInsert = { originalData: this.getQuery() };
  }
});

const RawRequest = mongoose.model(
  "RawRequest",
  rawRequestSchema,
  "raw_requests",
);

export default RawRequest;

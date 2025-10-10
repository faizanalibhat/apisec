import mongoose from 'mongoose';

const rawRequestSchema = new mongoose.Schema(
  {
    orgId: {
      type: String,
      required: true,
      index: true,
    },
    integrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Integration',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    method: {
      type: String,
      required: true,
      enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
      uppercase: true,
    },
    url: {
      type: String,
      required: true,
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
    rawHttp: {
      type: String,
      required: true,
    },
    collectionName: {
      type: String,
      required: true,
    },
    folderName: {
      type: String,
      default: null,
    },
    workspaceName: {
      type: String,
      required: true,
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
  }
);

// Indexes for search functionality
rawRequestSchema.index({ name: 'text', url: 'text', description: 'text' });
rawRequestSchema.index({ method: 1, orgId: 1 });
rawRequestSchema.index({ collectionName: 1, orgId: 1 });

// Mark as edited when updating
rawRequestSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate();
  if (!update.$set) update.$set = {};
  update.$set.isEdited = true;
  
  // Store original data on first edit
  if (!update.$set.originalData && !this.getOptions().skipEdit) {
    update.$setOnInsert = { originalData: this.getQuery() };
  }
});

const RawRequest = mongoose.model('RawRequest', rawRequestSchema, 'raw_requests');

export default RawRequest;
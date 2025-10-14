import mongoose from 'mongoose';

const findingSchema = new mongoose.Schema({
  ruleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rule',
    required: true
  },
  ruleName: String,
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RawRequest',
    required: true
  },
  requestName: String,
  requestUrl: String,
  method: String,
  vulnerability: {
    type: {
      type: String,
      required: true
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      required: true
    },
    description: String,
    evidence: {
      request: Object,
      response: Object,
      matchedCriteria: String
    }
  },
  detectedAt: {
    type: Date,
    default: Date.now
  }
});

const scanSchema = new mongoose.Schema({
  orgId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['preparing', 'pending', 'running', 'completed', 'failed', 'cancelled', 'halted'],
    default: 'preparing',
    index: true
  },
  ruleIds: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Rule',
    required: false,
    default: [] 
  },
  requestIds: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'RawRequest',
    default: [] 
  },
  // Environment for variable substitution
  environmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RawEnvironment',
    required: false
  },
  // Statistics
  stats: {
    totalRequests: { type: Number, default: 0 },
    totalRules: { type: Number, default: 0 },
    totalTransformedRequests: { type: Number, default: 0 },
    processedRequests: { type: Number, default: 0 },
    failedRequests: { type: Number, default: 0 },
    vulnerabilitiesFound: { type: Number, default: 0 }
  },
  // Vulnerability summary by severity
  vulnerabilitySummary: {
    critical: { type: Number, default: 0 },
    high: { type: Number, default: 0 },
    medium: { type: Number, default: 0 },
    low: { type: Number, default: 0 }
  },
  // Findings array - stores detected vulnerabilities
  findings: [findingSchema],
  // Execution details
  startedAt: Date,
  completedAt: Date,
  executionTime: Number, // in milliseconds
  error: {
    message: String,
    stack: String,
    occurredAt: Date
  },
  // Metadata
  createdBy: String, // Will be populated from auth token later
  cancelledBy: String,
  cancelledAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for search and performance
scanSchema.index({ name: 'text', description: 'text' });
scanSchema.index({ orgId: 1, status: 1, createdAt: -1 });
scanSchema.index({ orgId: 1, 'vulnerabilitySummary.critical': -1 });
scanSchema.index({ orgId: 1, 'vulnerabilitySummary.high': -1 });

// Virtual for execution status
scanSchema.virtual('isActive').get(function() {
  return ['pending', 'running'].includes(this.status);
});

// Virtual for has vulnerabilities
scanSchema.virtual('hasVulnerabilities').get(function() {
  return this.stats.vulnerabilitiesFound > 0;
});

// Pre-save hook to calculate execution time
scanSchema.pre('save', function(next) {
  if (this.startedAt && this.completedAt) {
    this.executionTime = this.completedAt - this.startedAt;
  }
  next();
});

const Scan = mongoose.model('Scan', scanSchema);

export default Scan;
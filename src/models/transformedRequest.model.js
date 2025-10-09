import mongoose from 'mongoose';

const transformedRequestSchema = new mongoose.Schema({
  scanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Scan',
    required: true,
    index: true
  },
  orgId: {
    type: String,
    required: true,
    index: true
  },
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RawRequest',
    required: true
  },
  ruleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rule',
    required: true
  },

  // Request data
  method: {
    type: String,
    required: true,
    uppercase: true
  },
  url: {
    type: String,
    required: true
  },
  headers: {
    type: Object,
    default: {}
  },
  body: mongoose.Schema.Types.Mixed,
  params: {
    type: Object,
    default: {}
  },

  // Execution state
  state: {
    type: String,
    enum: ["pending", "running", "complete", "failed"],
    default: "pending",
    index: true
  },

  // Applied transformations record
  appliedTransformations: [{
    operation: String,
    field: String,
    value: mongoose.Schema.Types.Mixed,
    description: String
  }],

  // Execution details
  execution: {
    status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'error'],
      default: 'pending'
    },
    startedAt: Date,
    completedAt: Date,
    responseTime: Number, // in milliseconds
    request: {
      method: String,
      url: String,
      headers: Object,
      body: mongoose.Schema.Types.Mixed
    },
    response: {
      status: Number,
      statusText: String,
      headers: Object,
      body: mongoose.Schema.Types.Mixed,
      size: Number,
      error: String
    }
  },

  // Execution result from worker
  executionResult: {
    matched: Boolean,
    executedAt: Date,
    responseStatus: Number,
    responseTime: Number
  },

  // Vulnerability detection
  vulnerabilityDetected: {
    type: Boolean,
    default: false,
    index: true
  },
  matchResults: {
    matched: Boolean,
    matchedCriteria: {
      type: String,
      operator: String,
      expected: mongoose.Schema.Types.Mixed,
      actual: mongoose.Schema.Types.Mixed,
      description: String
    },
    details: Object
  },

  // Error tracking
  error: {
    message: String,
    stack: String,
    occurredAt: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
transformedRequestSchema.index({ scanId: 1, state: 1 });
transformedRequestSchema.index({ scanId: 1, 'execution.status': 1 });
transformedRequestSchema.index({ scanId: 1, vulnerabilityDetected: 1 });
transformedRequestSchema.index({ organizationId: 1, createdAt: -1 });
transformedRequestSchema.index({ ruleId: 1, requestId: 1 });

// Compound index for scan processing
transformedRequestSchema.index({
  scanId: 1,
  state: 1,
  vulnerabilityDetected: 1
});

// Virtual for execution success
transformedRequestSchema.virtual('isExecutionSuccess').get(function () {
  return this.execution?.status === 'success';
});

// Virtual for has vulnerability
transformedRequestSchema.virtual('hasVulnerability').get(function () {
  return this.vulnerabilityDetected === true;
});

// Virtual for is complete
transformedRequestSchema.virtual('isComplete').get(function () {
  return this.state === 'complete';
});

// Virtual for is failed
transformedRequestSchema.virtual('isFailed').get(function () {
  return this.state === 'failed' || this.execution?.status === 'error';
});

// Method to calculate response time
transformedRequestSchema.methods.calculateResponseTime = function () {
  if (this.execution?.startedAt && this.execution?.completedAt) {
    this.execution.responseTime = this.execution.completedAt - this.execution.startedAt;
    return this.execution.responseTime;
  }
  return null;
};

// Method to set execution result
transformedRequestSchema.methods.setExecutionResult = function (result) {
  this.execution = {
    ...this.execution,
    ...result,
    completedAt: new Date()
  };

  if (result.status === 'success') {
    this.state = 'complete';
  } else if (result.status === 'error') {
    this.state = 'failed';
  }

  return this.save();
};

// Method to mark as vulnerable
transformedRequestSchema.methods.markAsVulnerable = function (matchResults) {
  this.vulnerabilityDetected = true;
  this.matchResults = matchResults;
  return this.save();
};

// Pre-save hook to ensure consistency
transformedRequestSchema.pre('save', function (next) {
  // Calculate response time if needed
  if (this.execution?.startedAt && this.execution?.completedAt && !this.execution.responseTime) {
    this.execution.responseTime = this.execution.completedAt - this.execution.startedAt;
  }

  // Ensure state consistency
  if (this.state === 'complete' && this.execution && !this.execution.status) {
    this.execution.status = 'success';
  }

  next();
});

const TransformedRequest = mongoose.model('TransformedRequest', transformedRequestSchema);

export default TransformedRequest;
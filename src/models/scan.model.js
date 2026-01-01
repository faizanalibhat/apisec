import mongoose from 'mongoose';

const metrics_schema = new mongoose.Schema({
  total_requests: { type: Number, default: 0 },
  total_vulns: { type: Number, default: 0 },
  total_critical_vulns: { type: Number, default: 0 },
  total_high_vulns: { type: Number, default: 0 },
  total_medium_vulns: { type: Number, default: 0 },
  total_low_vulns: { type: Number, default: 0 },
});

const scanSchema = new mongoose.Schema({

  orgId: {
    type: String,
    required: true,
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'projects',
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    default: 'pending',
  },
  start_date: {
    type: Date
    default: Date.now
  },
  end_date: {
    type: Date,
  },
  metrics: { type: metrics_schema }
}, { timestamps: true });

const Scan = mongoose.model('Scan', scanSchema);

export default Scan;
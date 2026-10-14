const mongoose = require('mongoose');

const LEAVE_TYPES = ['casual', 'sick', 'earned', 'unpaid'];

const approvalSchema = new mongoose.Schema(
  {
    level: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byName: String,
    comment: String,
    at: Date,
  },
  { _id: false }
);

const leaveSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: LEAVE_TYPES, required: true },
    from: { type: String, required: true }, // YYYY-MM-DD
    to: { type: String, required: true },
    halfDay: { type: Boolean, default: false },
    days: { type: Number, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    currentLevel: { type: Number, default: 1 }, // which approver level must act next
    approvals: [approvalSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Leave', leaveSchema);
module.exports.LEAVE_TYPES = LEAVE_TYPES;

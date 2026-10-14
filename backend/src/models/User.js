const mongoose = require('mongoose');

// role: employee | level1 | level2 | level3 | admin
// level1 = Team Lead / Manager, level2 = HR, level3 = Director / Principal
const ROLES = ['employee', 'level1', 'level2', 'level3', 'admin'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'employee' },
    department: { type: String, trim: true, default: 'General' },
    designation: { type: String, trim: true, default: '' },
    active: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.methods.toSafe = function () {
  const o = this.toObject();
  delete o.password;
  delete o.__v;
  return o;
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;

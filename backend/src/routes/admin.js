const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Leave = require('../models/Leave');
const Notification = require('../models/Notification');
const { ROLES } = require('../models/User');
const { auth, requireRole } = require('../middleware/auth');

router.use(auth, requireRole('admin'));

router.get('/users', async (req, res) => {
  res.json({ users: await User.find().sort({ createdAt: -1 }) });
});

router.post('/users', async (req, res) => {
  const { name, email, password, role, department, designation } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(400).json({ error: 'Email already exists' });
  const user = await User.create({
    name, email, role, department, designation,
    password: await bcrypt.hash(password, 10),
    mustChangePassword: true,
  });
  res.status(201).json({ user: user.toSafe() });
});

router.put('/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id).select('+password');
  if (!user) return res.status(404).json({ error: 'Not found' });
  const { name, role, department, designation, active, password } = req.body || {};
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (String(user._id) === String(req.user._id) && (active === false || (role && role !== 'admin')))
    return res.status(400).json({ error: 'You cannot demote or deactivate yourself' });
  if (name) user.name = name;
  if (role) user.role = role;
  if (department !== undefined) user.department = department;
  if (designation !== undefined) user.designation = designation;
  if (typeof active === 'boolean') user.active = active;
  if (password) {
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    user.password = await bcrypt.hash(password, 10);
    user.mustChangePassword = true;
  }
  await user.save();
  res.json({ user: user.toSafe() });
});

router.delete('/users/:id', async (req, res) => {
  if (String(req.params.id) === String(req.user._id))
    return res.status(400).json({ error: 'You cannot delete your own account' });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  // Remove the user's own requests and notifications; decisions they made on others' leaves keep their saved name
  await Promise.all([
    Leave.deleteMany({ user: user._id }),
    Notification.deleteMany({ user: user._id }),
    user.deleteOne(),
  ]);
  res.json({ ok: true });
});

router.get('/leaves', async (req, res) => {
  const q = req.query.status ? { status: req.query.status } : {};
  const leaves = await Leave.find(q).populate('user', 'name email department').sort({ createdAt: -1 }).limit(300);
  res.json({ leaves });
});

router.get('/stats', async (req, res) => {
  const [byStatus, byType, users] = await Promise.all([
    Leave.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Leave.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: '$type', days: { $sum: '$days' } } }]),
    User.countDocuments({ active: true }),
  ]);
  res.json({ byStatus, byType, users });
});

module.exports = router;

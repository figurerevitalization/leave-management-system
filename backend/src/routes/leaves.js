const router = require('express').Router();
const Leave = require('../models/Leave');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { LEAVE_TYPES } = require('../models/Leave');
const { auth, approverLevel } = require('../middleware/auth');

router.use(auth);

const LEVEL_NAMES = { 1: 'Level 1', 2: 'Level 2', 3: 'Level 3' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toISOString().slice(0, 10);

// Working days (Mon-Fri) between two inclusive YYYY-MM-DD dates
function workingDays(from, to) {
  let n = 0;
  const d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (d <= end) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

const notify = (user, message, leave) => Notification.create({ user, message, leave });

async function notifyLevel(level, message, leave, exceptUser) {
  const approvers = await User.find({ role: `level${level}`, active: true });
  await Promise.all(
    approvers.filter((a) => String(a._id) !== String(exceptUser)).map((a) => notify(a._id, message, leave))
  );
}

// ---- Applicant ----
router.post('/', async (req, res) => {
  const { type, from, to, reason, halfDay } = req.body || {};
  if (!LEAVE_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid leave type' });
  if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) return res.status(400).json({ error: 'Invalid dates' });
  if (to < from) return res.status(400).json({ error: '"To" date is before "From" date' });
  if (from < today()) return res.status(400).json({ error: 'Cannot apply for past dates' });
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'Reason is required' });
  if (halfDay && from !== to) return res.status(400).json({ error: 'Half day must be a single date' });

  const days = halfDay ? 0.5 : workingDays(from, to);
  if (days <= 0) return res.status(400).json({ error: 'Selected range has no working days' });

  const overlap = await Leave.findOne({
    user: req.user._id,
    status: { $in: ['pending', 'approved'] },
    from: { $lte: to },
    to: { $gte: from },
  });
  if (overlap) return res.status(400).json({ error: 'You already have a leave request overlapping these dates' });

  const leave = await Leave.create({
    user: req.user._id,
    type,
    from,
    to,
    halfDay: !!halfDay,
    days,
    reason: reason.trim(),
    approvals: [1, 2, 3].map((level) => ({ level })),
  });
  await notifyLevel(1, `${req.user.name} requested ${days} day(s) of ${type} leave`, leave._id, req.user._id);
  res.status(201).json({ leave });
});

router.get('/mine', async (req, res) => {
  const leaves = await Leave.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ leaves });
});

router.post('/:id/cancel', async (req, res) => {
  const leave = await Leave.findOne({ _id: req.params.id, user: req.user._id });
  if (!leave) return res.status(404).json({ error: 'Not found' });
  const cancellable = leave.status === 'pending' || (leave.status === 'approved' && leave.from > today());
  if (!cancellable) return res.status(400).json({ error: 'This leave can no longer be cancelled' });
  leave.status = 'cancelled';
  await leave.save();
  res.json({ leave });
});

// ---- Approver ----
router.get('/pending', async (req, res) => {
  const level = approverLevel(req.user);
  if (!level) return res.status(403).json({ error: 'Not an approver' });
  const leaves = await Leave.find({ status: 'pending', currentLevel: level, user: { $ne: req.user._id } })
    .populate('user', 'name email department designation')
    .sort({ createdAt: 1 });
  res.json({ leaves });
});

router.get('/history', async (req, res) => {
  const level = approverLevel(req.user);
  if (!level) return res.status(403).json({ error: 'Not an approver' });
  const leaves = await Leave.find({ 'approvals.by': req.user._id })
    .populate('user', 'name email department')
    .sort({ updatedAt: -1 })
    .limit(100);
  res.json({ leaves });
});

router.post('/:id/decision', async (req, res) => {
  const level = approverLevel(req.user);
  if (!level) return res.status(403).json({ error: 'Not an approver' });
  const { action, comment } = req.body || {};
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  if (action === 'reject' && !(comment || '').trim())
    return res.status(400).json({ error: 'Please give a reason for rejection' });

  const leave = await Leave.findById(req.params.id);
  if (!leave) return res.status(404).json({ error: 'Not found' });
  if (String(leave.user) === String(req.user._id))
    return res.status(403).json({ error: 'You cannot decide on your own leave' });
  if (leave.status !== 'pending' || leave.currentLevel !== level)
    return res.status(400).json({ error: 'This request is not awaiting your approval' });

  const step = leave.approvals.find((a) => a.level === level);
  step.status = action === 'approve' ? 'approved' : 'rejected';
  step.by = req.user._id;
  step.byName = req.user.name;
  step.comment = (comment || '').trim();
  step.at = new Date();

  if (action === 'reject') {
    leave.status = 'rejected';
    await notify(leave.user, `Your ${leave.type} leave was rejected by ${req.user.name} (${LEVEL_NAMES[level]})`, leave._id);
  } else if (level < 3) {
    leave.currentLevel = level + 1;
    await notify(leave.user, `Your ${leave.type} leave cleared ${LEVEL_NAMES[level]}, now with ${LEVEL_NAMES[level + 1]}`, leave._id);
    await notifyLevel(level + 1, `A leave request awaits your approval`, leave._id, leave.user);
  } else {
    leave.status = 'approved';
    await notify(leave.user, `Your ${leave.type} leave (${leave.from} → ${leave.to}) is fully approved 🎉`, leave._id);
  }
  await leave.save();
  res.json({ leave });
});

// ---- Everyone: calendar of who is away ----
router.get('/calendar', async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : today().slice(0, 7);
  const start = `${month}-01`;
  const end = `${month}-31`;
  const leaves = await Leave.find({ status: { $in: ['approved', 'pending'] }, from: { $lte: end }, to: { $gte: start } })
    .populate('user', 'name department');
  res.json({
    leaves: leaves.map((l) => ({
      _id: l._id, name: l.user.name, department: l.user.department,
      type: l.type, from: l.from, to: l.to, status: l.status,
    })),
  });
});

module.exports = router;

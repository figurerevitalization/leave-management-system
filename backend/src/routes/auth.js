const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password');
  if (!user || !user.active || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: 'Invalid email or password' });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: user.toSafe() });
});

router.get('/me', auth, (req, res) => res.json({ user: req.user.toSafe() }));

router.post('/change-password', auth, async (req, res) => {
  const { current, next } = req.body || {};
  if (!next || next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  const user = await User.findById(req.user._id).select('+password');
  if (!(await bcrypt.compare(current || '', user.password)))
    return res.status(400).json({ error: 'Current password is incorrect' });
  user.password = await bcrypt.hash(next, 10);
  user.mustChangePassword = false;
  await user.save();
  res.json({ ok: true });
});

module.exports = router;

const router = require('express').Router();
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  const items = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30);
  res.json({ items, unread: items.filter((i) => !i.read).length });
});

router.post('/read-all', async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  res.json({ ok: true });
});

module.exports = router;

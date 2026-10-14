require('dotenv').config();
require('express-async-errors');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

if (!process.env.JWT_SECRET || !process.env.MONGODB_URI) {
  console.error('Missing JWT_SECRET or MONGODB_URI. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
const origins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim());
app.use(cors({ origin: origins.includes('*') ? true : origins }));
app.use(express.json({ limit: '50kb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

process.on('unhandledRejection', (e) => console.error('Unhandled rejection:', e));

async function seed() {
  if (process.env.SEED_DEMO === 'false' || (await User.countDocuments()) > 0) return;
  const hash = (p) => bcrypt.hash(p, 10);
  const demo = [
    ['System Admin', 'admin@company.com', 'Admin@123', 'admin', 'Administration', 'Administrator'],
    ['Priya Sharma', 'lead@company.com', 'Pass@1234', 'level1', 'Operations', 'Team Lead'],
    ['Rahul Verma', 'hr@company.com', 'Pass@1234', 'level2', 'Human Resources', 'HR Manager'],
    ['Dr. Anita Rao', 'director@company.com', 'Pass@1234', 'level3', 'Management', 'Director'],
    ['Amit Kumar', 'employee@company.com', 'Pass@1234', 'employee', 'Operations', 'Executive'],
  ];
  for (const [name, email, pw, role, department, designation] of demo)
    await User.create({ name, email, role, department, designation, password: await hash(pw) });
  console.log('Seeded demo users (admin@company.com / Admin@123, others Pass@1234). Change them!');
}

const port = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGODB_URI)
  .then(seed)
  .then(() => app.listen(port, () => console.log(`API running on :${port}`)))
  .catch((e) => {
    console.error('Startup failed:', e.message);
    process.exit(1);
  });

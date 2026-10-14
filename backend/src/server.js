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
  if (require.main === module) process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
const origins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim());
// Allowed: listed origins, plus any localhost / 127.0.0.1 port for local development
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || origins.includes('*') || origins.includes(origin) || LOCAL.test(origin)),
}));
app.use(express.json({ limit: '50kb' }));

// Connect once and reuse (also works on serverless hosts, where the app is reused between requests)
let ready;
const connect = () => (ready ||= mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).then(seed).catch((e) => { ready = null; throw e; }));
// Health check: reports a safe, human-readable reason when the database is unreachable
app.get('/api/health', async (req, res) => {
  try {
    await connect();
    res.json({ ok: true, db: 'connected' });
  } catch (e) {
    const m = String(e.message || '');
    const reason = !process.env.MONGODB_URI ? 'MONGODB_URI is not set on the server'
      : /bad auth|authentication failed/i.test(m) ? 'Database username or password is wrong'
      : /ENOTFOUND|ECONNREFUSED|querySrv|Invalid (scheme|connection)/i.test(m) ? 'Database address is invalid or unreachable (check MONGODB_URI)'
      : /Server selection timed out|ETIMEDOUT|whitelist|Could not connect to any servers|ReplicaSetNoPrimary/i.test(m) ? 'Atlas is refusing this server: in Atlas open Network Access and allow 0.0.0.0/0 (Allow access from anywhere)'
      : 'Could not connect to the database';
    console.error('DB connect failed:', m);
    res.status(503).json({ ok: false, db: 'down', reason });
  }
});
app.use(async (req, res, next) => { await connect(); next(); });

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

if (require.main === module) {
  const port = process.env.PORT || 5000;
  connect()
    .then(() => app.listen(port, () => console.log(`API running on :${port}`)))
    .catch((e) => {
      console.error('Startup failed:', e.message);
      process.exit(1);
    });
}

module.exports = app;

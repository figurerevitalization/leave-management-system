# LeaveDesk – Leave Management System

Node/Express + MongoDB API with a static frontend (HTML/CSS/JS). Login is mandatory.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/figurerevitalization/leave-management-system)

## How approval works
Employee applies → **Level 1** (Team Lead) → **Level 2** (HR) → **Level 3** (Director).
Only after all three approve does the leave become *Approved*.
A rejection at any level ends the request (reason required). Approvers never see a request
until the previous level has cleared it, and cannot decide on their own leave.

## Features
Leave types (casual/sick/earned/unpaid) · weekday-only day count · half-day · overlap check ·
live 3-step progress tracker with comments · cancel pending/future leave ·
in-app notifications · team calendar · admin user management (roles, deactivate, password reset) ·
admin overview + all-leaves view · JWT auth, bcrypt, rate-limited login.

## Run locally
```bash
cd backend
cp .env.example .env      # set MONGODB_URI and JWT_SECRET
npm install
npm start                 # http://localhost:5000
```
Serve the frontend (any static server), e.g. `npx serve frontend -l 5500` and open http://localhost:5500.
`frontend/config.js` automatically uses `localhost:5000` locally.

Demo accounts (seeded when the DB is empty): `admin@company.com / Admin@123`;
`lead@`, `hr@`, `director@`, `employee@company.com / Pass@1234`.
**Set `SEED_DEMO=false` and change passwords in production.**

## Deploy (GitHub)
GitHub Pages hosts only static files, so:
1. **Database** – create a free MongoDB Atlas cluster; allow network access (0.0.0.0/0 for Render); copy the connection string.
2. **Backend** – deploy `backend/` to Render (use `render.yaml` → New Blueprint, or a Web Service with root dir `backend`).
   Env vars: `MONGODB_URI`, `JWT_SECRET`, `CORS_ORIGIN=https://<user>.github.io`
   (origin only, no path, no trailing slash).
3. **Frontend** – put your Render URL in `frontend/config.js`, push to `main`, then in the repo
   *Settings → Pages → Source: GitHub Actions*. The included workflow publishes `frontend/`.

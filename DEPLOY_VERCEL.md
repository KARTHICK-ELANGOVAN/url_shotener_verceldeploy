Deployment to Vercel (step-by-step)

Prerequisites
- A GitHub repository for this project (push your workspace to GitHub).
- A Vercel account (app.vercel.com).
- Neon `DATABASE_URL` (you already have this).

1) Commit & push
- Commit all changes and push to a GitHub repo. Vercel will deploy from the repo.

2) Add environment variable in Vercel
- In your Vercel project Settings → Environment Variables add:
  - Key: `DATABASE_URL`
  - Value: your Neon connection string (e.g. `postgresql://...`)
  - Target: `Production` (and `Preview` if you want preview deployments to also use it)

3) (Optional) Run migrations before first deploy
- You can run the included migration locally:
  ```powershell
  $env:DATABASE_URL='postgresql://...'
  npm run migrate:to-neon
  ```
- Or use the GitHub Actions workflow included in this repo (it runs on `push` to `main` and requires GitHub secret `DATABASE_URL`). See step 5.

4) Connect repo to Vercel
- In Vercel, Create Project → Import Git Repository → choose your GitHub repo.
- Vercel will detect `api/` serverless functions and `vercel.json` automatically.
- Deploy. The `DATABASE_URL` environment variable ensures the serverless functions connect to Neon.

5) (Optional) Enable GitHub Actions migration on push
- This repo includes `.github/workflows/migrate.yml` which will run `node scripts/migrate_to_neon.js` on `push` to `main` using the `DATABASE_URL` secret.
- Add `DATABASE_URL` as a GitHub Repository Secret (Settings → Secrets → Actions) with your Neon URL.

6) Smoke test the deployed site
- After deployment, visit `https://<your-vercel-domain>/health` to confirm status.
- Use `POST /api/links` to create and then `GET /:code` to verify redirect.

Notes
- For production security, consider hashing delete `secret` values and enabling rate limits.
- Neon pooling endpoint is preferred for serverless use; your Neon URL containing `pooler` is suited for Vercel.

# NBA Stats API Proxy

NBA.com blocks requests from cloud IPs (e.g. Vercel). This proxy runs elsewhere and forwards requests so your Vercel app can use the NBA Stats API.

## Deploy the proxy

1. Deploy this `proxy` folder to a host that isn’t blocked (e.g. [Railway](https://railway.app), [Render](https://render.com), [Fly.io](https://fly.io)).
2. Set the root to the `proxy` directory and run: `node server.js`.
3. In your Vercel project, add an environment variable:
   - **Name:** `NBA_STATS_PROXY_URL`
   - **Value:** Your proxy URL, e.g. `https://your-app.up.railway.app` (no trailing slash)
4. Redeploy the Next.js app on Vercel.

Without `NBA_STATS_PROXY_URL`, the app uses the NBA Stats API directly (works on localhost; often blocked on Vercel).

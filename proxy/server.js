/**
 * Minimal proxy for NBA Stats API.
 * Deploy somewhere that isn't blocked by NBA (e.g. Railway, Render, Fly.io).
 * Then set NBA_STATS_PROXY_URL in Vercel to this server's URL.
 *
 * Run: node server.js
 * Usage: GET ?url=<encodeURIComponent(https://stats.nba.com/stats/...)>
 */

const http = require("http");

const NBA_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nba.com/",
  Origin: "https://www.nba.com",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

const PORT = process.env.PORT || 8080;

const server = http.createServer(async (req, res) => {
  if (req.method !== "GET") {
    res.writeHead(405).end();
    return;
  }
  const u = new URL(req.url || "", `http://localhost:${PORT}`);
  const url = u.searchParams.get("url");
  if (!url || !url.startsWith("https://stats.nba.com/")) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing or invalid url query (must be stats.nba.com)" }));
    return;
  }
  try {
    const response = await fetch(url, { headers: NBA_HEADERS });
    const body = await response.text();
    res.writeHead(response.status, {
      "Content-Type": response.headers.get("Content-Type") || "application/json",
    });
    res.end(body);
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Proxy fetch failed", message: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`NBA Stats proxy listening on port ${PORT}`);
});

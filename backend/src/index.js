// ============================================================
// ClaimBot — Backend API Server
// backend/src/index.js
// ============================================================

require("dotenv").config();

const express   = require("express");
const cors      = require("cors");
const helmet    = require("helmet");
const morgan    = require("morgan");
const rateLimit = require("express-rate-limit");

const templateRoutes = require("./routes/templates");
const policyRoutes   = require("./routes/policies");
const claimRoutes    = require("./routes/claims");
const treasuryRoutes = require("./routes/treasury");
const statsRoutes    = require("./routes/stats");
const { getBradburyConfigStatus } = require("./services/bradburyClient");

const app  = express();
const PORT = process.env.PORT || 4000;

function isLiveMode() {
  return process.env.DEMO_MODE === "false";
}

// ── Middleware ────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: [
    "http://localhost:3000",
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Rate limiting
app.use("/api", rateLimit({
  windowMs:        60 * 1000,  // 1 minute
  max:             100,         // max 100 requests per minute per IP
  standardHeaders: "draft-7",   // use RateLimit headers (RFC standard)
  legacyHeaders:   false,       // disable X-RateLimit-* headers
  message:         { error: "Too many requests. Please try again in a minute." },
}));

// ── Health ────────────────────────────────────────────────
app.get("/health", (req, res) => {
  const liveMode = isLiveMode();
  res.json({
    status: "ok",
    mode: liveMode ? "live" : "demo",
    ...(liveMode && { genlayer: getBradburyConfigStatus() }),
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.json({
    name: "ClaimBot API",
    status: "ok",
    health: "/health",
    endpoints: ["/api/templates", "/api/policies/:wallet", "/api/claims/wallet/:wallet", "/api/treasury", "/api/stats"],
  });
});

// ── API Routes ────────────────────────────────────────────
// GET /api/templates
app.use("/api/templates", templateRoutes);

// GET /api/policies/:wallet
// POST /api/policies/purchase
// POST /api/policies/cancel
app.use("/api/policies", policyRoutes);

// GET  /api/claims/wallet/:wallet
// GET  /api/claims/:claimId
// GET  /api/claims/:claimId/status
// POST /api/claims/submit
// POST /api/claims/appeal
app.use("/api/claims", claimRoutes);

// GET /api/treasury
app.use("/api/treasury", treasuryRoutes);

// GET /api/stats
app.use("/api/stats", statsRoutes);

// ── 404 ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

// ── Error handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🛡  ClaimBot API  →  http://localhost:${PORT}`);
  console.log(`   Mode: ${isLiveMode() ? "LIVE (GenLayer)" : "DEMO (mock data)"}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});

module.exports = app;

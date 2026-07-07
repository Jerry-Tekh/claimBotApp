// backend/src/routes/templates.js
const express = require("express");
const router  = express.Router();
const gl      = require("../services/genlayer");

router.get("/", async (req, res, next) => {
  try {
    const templates = await gl.getTemplates();
    res.json(templates);
  } catch (err) { next(err); }
});

module.exports = router;

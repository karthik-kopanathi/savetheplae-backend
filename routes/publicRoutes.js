const express   = require("express");
const router    = express.Router();
const Orphanage = require("../models/Orphanage");

// GET /api/public/orphanages
// No auth required — publicly visible list of all registered orphanages
router.get("/orphanages", async (req, res) => {
  try {
    const orphanages = await Orphanage.find()
      .select("orphanageName name city address phone email profilePic childrenCount createdAt")
      .sort({ createdAt: -1 });
    res.json({ orphanages });
  } catch (err) {
    console.error("public orphanages error:", err);
    res.status(500).json({ message: "Failed to fetch orphanages" });
  }
});

module.exports = router;
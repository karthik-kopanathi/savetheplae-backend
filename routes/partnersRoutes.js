const express = require("express");
const router = express.Router();
const Ngo = require("../models/Ngo");
const Donor = require("../models/Donor");
const authMiddleware = require("../middleware/authMiddleware");

// GET /api/partners/ngos — PUBLIC: all NGOs (for NgoPartners public page)
router.get("/ngos", async (req, res) => {
  try {
    const ngos = await Ngo.find()
      .select("ngoName name email phone city address profilePic createdAt")
      .sort({ createdAt: -1 });
    res.json(ngos);
  } catch (err) {
    console.error("Partners/ngos fetch error:", err);
    res.status(500).json({ message: "Failed to fetch NGOs" });
  }
});

// GET /api/partners — PRIVATE: NGOs in the donor's city (for DonorNgoPartners page)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const donor = await Donor.findById(req.user.id).select("city");
    if (!donor) return res.status(404).json({ message: "Donor not found" });

    const ngos = await Ngo.find({ city: donor.city })
      .select("ngoName name email phone city address profilePic createdAt")
      .sort({ createdAt: -1 });

    res.json({ city: donor.city, ngos });
  } catch (err) {
    console.error("Partners fetch error:", err);
    res.status(500).json({ message: "Failed to fetch NGO partners" });
  }
});

module.exports = router;
const express = require("express");
const router = express.Router();

const Donation = require("../models/Donation");
const Donor = require("../models/Donor");

/* ========================= */
/* GET PLATFORM STATS */
/* ========================= */
router.get("/", async (req, res) => {
  try {
    /* 1️⃣ Total Meals Delivered */
   const result = await Donation.aggregate([
  { $unwind: "$items" },
  {
    $group: {
      _id: null,
      totalMeals: { $sum: "$items.serves" }
    }
  }
]);

    const totalMeals = result[0]?.totalMeals || 0;

    /* 2️⃣ Total Registered Donors */
    const totalDonors = await Donor.countDocuments();

    /* 3️⃣ Total Registered Orphanages */
    // If you have orphanage.js model use this:
    let totalOrphanages = 0;
    try {
      const Orphanage = require("../models/Orphanage");
      totalOrphanages = await Orphanage.countDocuments();
    } catch (err) {
      totalOrphanages = 0; // If model doesn't exist yet
    }

    res.json({
      totalMeals,
      totalDonors,
      totalOrphanages,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
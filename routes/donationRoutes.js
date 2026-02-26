const express = require("express");
const router = express.Router();
const Donation = require("../models/Donation");
const Ngo = require("../models/Ngo");
const Notification = require("../models/Notification");
const authMiddleware = require("../middleware/authMiddleware");
const { checkSpoilForDonation } = require("../jobs/SpoilWarningJob");

/* CREATE DONATION */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { items, bestBefore, location, city, instructions } = req.body;

    if (!items || items.length === 0)
      return res.status(400).json({ message: "Items required" });

    if (!bestBefore || !location || !city)
      return res.status(400).json({ message: "Best before, city, and location required" });

    const donation = await Donation.create({
      donor: req.user.id,
      items,
      bestBefore,
      location,
      city,
      instructions,
      status: "pending",
    });

    res.status(201).json(donation);
  } catch (err) {
    console.error("Donation create error:", err);
    res.status(500).json({ message: "Failed to create donation" });
  }
});

/* GET MY DONATIONS (DONOR) */
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const donations = await Donation.find({ donor: req.user.id })
      .populate("acceptedBy", "ngoName")
      // ✅ Populate orphanageName from donatedItems so frontend can show "Received By"
      .populate("donatedItems.orphanageId", "orphanageName name")
      .sort({ donationDate: -1 });
    res.json(donations);
  } catch (err) {
    console.error("Fetch my donations error:", err);
    res.status(500).json({ message: "Failed to fetch donations" });
  }
});

/* GET ALL PENDING DONATIONS (NGO) */
router.get("/pending", authMiddleware, async (req, res) => {
  try {
    const donations = await Donation.find({ status: "pending" })
      .populate("donor", "name email profilePic city")
      .sort({ donationDate: -1 });
    res.json(donations);
  } catch (err) {
    console.error("Fetch pending donations error:", err);
    res.status(500).json({ message: "Failed to fetch pending donations" });
  }
});

/* ACCEPT DONATION */
router.put("/:id/accept", authMiddleware, async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id);

    if (!donation) return res.status(404).json({ message: "Donation not found" });
    if (donation.status !== "pending") return res.status(400).json({ message: "Already accepted" });

    const ngo = await Ngo.findById(req.user.id);
    const ngoName = ngo?.ngoName || "An NGO";
    const itemNames = donation.items.map(i => i.name).join(", ");

    donation.status = "accepted";
    donation.acceptedBy = req.user.id;
    await donation.save();

    // Notify donor that donation was accepted
    await Notification.create({
      userId: donation.donor,
      message: `Your donation of ${itemNames} has been accepted by ${ngoName}. They will pickup the food by reaching you.`,
      type: "accepted",
    });

    res.json(donation);
  } catch (err) {
    console.error("Accept donation error:", err);
    res.status(500).json({ message: "Failed to accept donation" });
  }
});

/* ✅ NGO REQUESTS PICKUP COMPLETION */
router.put("/:id/request-completion", authMiddleware, async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id);

    if (!donation) return res.status(404).json({ message: "Donation not found" });
    if (donation.status !== "accepted") return res.status(400).json({ message: "Donation not in accepted state" });
    if (donation.confirmationPending) return res.status(400).json({ message: "Confirmation already requested" });

    const ngo = await Ngo.findById(req.user.id);
    const ngoName = ngo?.ngoName || "An NGO";
    const itemNames = donation.items.map(i => i.name).join(", ");

    donation.confirmationPending = true;
    await donation.save();

    // ✅ Notify donor with confirm button
    await Notification.create({
      userId: donation.donor,
      message: `${ngoName} NGO wants to confirm the pickup of your donation (${itemNames}). Please confirm if they have collected the food.`,
      type: "confirm_pickup",
      donationId: donation._id,
    });

    res.json({ message: "Confirmation requested" });
  } catch (err) {
    console.error("Request completion error:", err);
    res.status(500).json({ message: "Failed to request completion" });
  }
});

/* ✅ DONOR CONFIRMS PICKUP COMPLETION */
router.put("/:id/confirm-completion", authMiddleware, async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id);

    if (!donation) return res.status(404).json({ message: "Donation not found" });
    if (donation.status === "completed") return res.status(400).json({ message: "Already completed" });

    donation.status              = "completed";
    donation.confirmationPending = false;
    donation.completedAt         = new Date();
    await donation.save();

    // ✅ Immediately warn NGO if food will spoil within 8 hours
    checkSpoilForDonation(donation._id).catch(console.error);

    res.json({ message: "Pickup confirmed as completed", donation });
  } catch (err) {
    console.error("Confirm completion error:", err);
    res.status(500).json({ message: "Failed to confirm completion" });
  }
});

module.exports = router;
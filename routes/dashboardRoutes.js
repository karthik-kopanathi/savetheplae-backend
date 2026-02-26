const express = require("express");
const router  = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const Donor    = require("../models/Donor");
const Ngo      = require("../models/Ngo");
const Orphanage = require("../models/Orphanage");
const Donation  = require("../models/Donation");

/* ======================================= */
/* GET CURRENT USER PROFILE (/me)          */
/* ======================================= */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const { id, role } = req.user;
    let user;
    if (role === "donor")     user = await Donor.findById(id).select("-password");
    if (role === "ngo")       user = await Ngo.findById(id).select("-password");
    if (role === "orphanage") user = await Orphanage.findById(id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("GET /me error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ======================================= */
/* NGO DASHBOARD                           */
/* GET /api/dashboard/ngo-dashboard        */
/* ======================================= */
router.get("/ngo-dashboard", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "ngo") {
      return res.status(403).json({ message: "Only NGOs allowed" });
    }

    const ngo = await Ngo.findById(req.user.id);

    const myDonations = await Donation.find({ acceptedBy: req.user.id })
      .populate("donor", "name email phone profilePic city")
      .sort({ donationDate: -1 });

    const availableDonations = await Donation.find({
      status: "pending",
      city:   ngo.city,
    })
      .populate("donor", "name email phone profilePic city")
      .sort({ donationDate: -1 });

    const totalMeals = myDonations.reduce(
      (total, d) => total + d.items.reduce((sum, i) => sum + Number(i.serves || 0), 0), 0
    );

    res.json({
      myDonations,
      availableDonations,
      stats: {
        pickups:    myDonations.length,
        deliveries: myDonations.filter(d => d.status === "completed").length,
        meals:      totalMeals,
      },
    });
  } catch (err) {
    console.error("GET /ngo-dashboard error:", err);
    res.status(500).json({ message: "Failed to fetch NGO dashboard" });
  }
});

/* ======================================= */
/* ORPHANAGE DASHBOARD                     */
/* GET /api/dashboard/orphanage-dashboard  */
/* ======================================= */
router.get("/orphanage-dashboard", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "orphanage") {
      return res.status(403).json({ message: "Only orphanages allowed" });
    }

    const orphanageId = req.user.id;

    // ── Pattern A ─────────────────────────────────────────────────────
    // Orphanage directly accepted a donor's pending donation.
    // Sets:  donation.acceptedBy = orphanageId
    //        donation.status     = "accepted" → "completed" (after NGO pickup confirm)
    // ─────────────────────────────────────────────────────────────────
    const directAccepted = await Donation.find({ acceptedBy: orphanageId })
      .populate("donor", "name phone")
      .sort({ donationDate: -1 });

    // ── Pattern B ─────────────────────────────────────────────────────
    // Orphanage requested food from NGO stock OR NGO proactively donated.
    // Sets:  donation.deliveryTo     = orphanageId
    //        donation.deliveryStatus = "pending" → "awaiting_confirmation" → "delivered"
    //
    // The parent donation.status is "completed" (it's already an NGO pickup)
    // so we must look at deliveryStatus, NOT status, for "did orphanage receive it".
    // ─────────────────────────────────────────────────────────────────
    const incomingFromNgo = await Donation.find({ deliveryTo: orphanageId })
      .populate("donor",      "name phone")
      .populate("acceptedBy", "ngoName city")
      .sort({ updatedAt: -1 });

    // ── Per-item donations (donatedItems sub-docs) ─────────────────────
    // A single NGO donation can have multiple donatedItems going to
    // different orphanages.  We pull all donations that have at least one
    // donatedItem addressed to this orphanage so we can surface them.
    const perItemDonations = await Donation.find({
      "donatedItems.orphanageId": orphanageId,
    })
      .populate("donor",      "name phone")
      .populate("acceptedBy", "ngoName city")
      .sort({ updatedAt: -1 });

    // ── Merge and deduplicate by _id ──────────────────────────────────
    const seen = new Set();
    const allRaw = [...directAccepted, ...incomingFromNgo, ...perItemDonations].filter(d => {
      const key = String(d._id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // ── Build a normalised view for the frontend ──────────────────────
    // Each item in myDonations gets a synthetic `orphanageStatus` field
    // that the frontend can use uniformly for "upcoming" vs "received".
    //
    //  orphanageStatus = "upcoming"  → food is on its way to this orphanage
    //  orphanageStatus = "received"  → orphanage confirmed receipt
    //  orphanageStatus = "accepted"  → direct accept, not yet picked up
    const myDonations = allRaw.map(d => {
      const doc = d.toObject ? d.toObject() : { ...d };

      // Pattern A: direct accept
      if (String(doc.acceptedBy?._id || doc.acceptedBy) === String(orphanageId)) {
        doc.orphanageStatus = doc.status === "completed" ? "received" : "upcoming";
        return doc;
      }

      // Pattern B (whole-donation delivery)
      if (String(doc.deliveryTo) === String(orphanageId)) {
        doc.orphanageStatus =
          doc.deliveryStatus === "delivered"              ? "received"  :
          doc.deliveryStatus === "awaiting_confirmation"  ? "upcoming"  :
          doc.deliveryStatus === "pending"                ? "upcoming"  :
          "upcoming";
        return doc;
      }

      // Pattern C: per-item donatedItems
      const myItems = (doc.donatedItems || []).filter(
        di => String(di.orphanageId) === String(orphanageId)
      );
      if (myItems.length) {
        const allDelivered = myItems.every(di => di.status === "delivered");
        const anyPending   = myItems.some(di =>
          di.status === "pending" || di.status === "awaiting_confirmation"
        );
        doc.orphanageStatus = allDelivered ? "received" : anyPending ? "upcoming" : "upcoming";
        // Expose only the relevant donatedItems subset
        doc.myDonatedItems = myItems;
        return doc;
      }

      doc.orphanageStatus = "upcoming";
      return doc;
    });

    // ── Stats ─────────────────────────────────────────────────────────
    const donationsReceived = myDonations.filter(
      d => d.orphanageStatus === "received" || d.orphanageStatus === "accepted"
    ).length;

    const upcoming = myDonations.filter(d => d.orphanageStatus === "upcoming").length;

    // Serves: sum items for received donations
    // For per-item donations only count items belonging to this orphanage
    const servesReceived = myDonations
      .filter(d => d.orphanageStatus === "received")
      .reduce((sum, d) => {
        if (d.myDonatedItems?.length) {
          // Only count the specific items delivered to this orphanage
          return sum + d.myDonatedItems.reduce((s, di) => {
            const item = d.items[di.itemIndex];
            return s + (Number(item?.serves) || 0);
          }, 0);
        }
        // Whole donation — count all items
        return sum + d.items.reduce((s, i) => s + (Number(i.serves) || 0), 0);
      }, 0);

    res.json({
      myDonations,
      stats: { donationsReceived, upcoming, servesReceived },
    });
  } catch (err) {
    console.error("GET /orphanage-dashboard error:", err);
    res.status(500).json({ message: "Failed to fetch orphanage dashboard" });
  }
});

module.exports = router;
const express = require("express");
const router = express.Router();
const Donation = require("../models/Donation");
const Ngo = require("../models/Ngo");
const Orphanage = require("../models/Orphanage");
const Notification = require("../models/Notification");
const authMiddleware = require("../middleware/authMiddleware");

// ─────────────────────────────────────────────────────────
// GET /api/orphanage/dashboard
// ─────────────────────────────────────────────────────────
router.get("/dashboard", authMiddleware, async (req, res) => {
  try {
    const orphanageId = req.user.id;

    const allDonations = await Donation.find({
      "donatedItems.orphanageId": orphanageId,
    })
      .populate("acceptedBy", "ngoName name profilePic city phone email")
      .sort({ updatedAt: -1 });

    const upcomingDeliveries = [];
    const recentDonations    = [];

    allDonations.forEach(d => {
      d.donatedItems.forEach(di => {
        if (String(di.orphanageId) !== String(orphanageId)) return;

        const entry = {
          donationId:   d._id,
          itemIndex:    di.itemIndex,
          itemName:     di.itemName,
          serves:       d.items[di.itemIndex]?.serves ?? 0,
          bestBefore:   d.bestBefore,
          donationDate: d.donationDate,
          status:       di.status,
          donatedAt:    di.donatedAt,
          deliveredAt:  di.deliveredAt,
          ngo:          d.acceptedBy,
        };

        if (di.status === "delivered") {
          recentDonations.push(entry);
        } else {
          upcomingDeliveries.push(entry);
        }
      });
    });

    const totalServes = recentDonations.reduce((s, d) => s + Number(d.serves || 0), 0);

    res.json({
      upcomingDeliveries,
      recentDonations: recentDonations.slice(0, 20),
      stats: {
        received: recentDonations.length,
        upcoming: upcomingDeliveries.length,
        serves:   totalServes,
      },
    });
  } catch (err) {
    console.error("orphanage dashboard error:", err);
    res.status(500).json({ message: "Failed to fetch orphanage dashboard" });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/orphanage/ngo-food-stock
// NGO fetches their own food stock
// ─────────────────────────────────────────────────────────
router.get("/ngo-food-stock", authMiddleware, async (req, res) => {
  try {
    const donations = await Donation.find({
      acceptedBy: req.user.id,
      status: "completed",
    }).select("items bestBefore completedAt donationDate donatedItems _id");

    const stock = donations.flatMap(d => {
      const donatedIndexes = new Set((d.donatedItems || []).map(di => di.itemIndex));
      return d.items
        .map((item, idx) => ({ item, idx }))
        .filter(({ idx }) => !donatedIndexes.has(idx))
        .map(({ item, idx }) => ({
          donationId:  d._id,
          itemIndex:   idx,
          name:        item.name,
          serves:      item.serves,
          bestBefore:  d.bestBefore  || null,
          completedAt: d.completedAt || d.donationDate || null,
        }));
    });

    res.json({ stock });
  } catch (err) {
    console.error("ngo-food-stock error:", err);
    res.status(500).json({ message: "Failed to fetch food stock" });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/orphanage/ngo-city-stock
// Orphanage sees NGO stock from their OWN city
// ─────────────────────────────────────────────────────────
router.get("/ngo-city-stock", authMiddleware, async (req, res) => {
  try {
    const orphanage = await Orphanage.findById(req.user.id)
      .select("city orphanageName name address phone email profilePic");
    if (!orphanage) return res.status(404).json({ message: "Orphanage not found" });

    const ngos = await Ngo.find({ city: orphanage.city })
      .select("ngoName name city profilePic address phone email createdAt");

    const ngosWithStock = await Promise.all(
      ngos.map(async (ngo) => {
        const completedDonations = await Donation.find({
          acceptedBy: ngo._id,
          status: "completed",
        }).select("items bestBefore completedAt donationDate _id donatedItems");

        const stock = completedDonations.flatMap(d => {
          const donatedIndexes = new Set((d.donatedItems || []).map(di => di.itemIndex));
          return d.items
            .map((item, idx) => ({ item, idx }))
            .filter(({ idx }) => !donatedIndexes.has(idx))
            .map(({ item, idx }) => ({
              donationId:  d._id,
              itemIndex:   idx,
              name:        item.name,
              serves:      item.serves,
              bestBefore:  d.bestBefore || null,
              completedAt: d.completedAt || d.donationDate || null,
            }));
        });

        return {
          _id:        ngo._id,
          ngoName:    ngo.ngoName,
          name:       ngo.name,
          city:       ngo.city,
          profilePic: ngo.profilePic,
          address:    ngo.address,
          phone:      ngo.phone,
          email:      ngo.email,
          createdAt:  ngo.createdAt,
          stock,
        };
      })
    );

    const ngosWithItems = ngosWithStock.filter(n => n.stock.length > 0);
    res.json({ city: orphanage.city, ngos: ngosWithItems });
  } catch (err) {
    console.error("ngo-city-stock error:", err);
    res.status(500).json({ message: "Failed to fetch NGO stock" });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/orphanage/ngo-out-of-city-stock
// ✅ NEW: Orphanage sees NGO stock from OTHER cities
// ─────────────────────────────────────────────────────────
router.get("/ngo-out-of-city-stock", authMiddleware, async (req, res) => {
  try {
    const orphanage = await Orphanage.findById(req.user.id)
      .select("city orphanageName name address phone email profilePic");
    if (!orphanage) return res.status(404).json({ message: "Orphanage not found" });

    const ngos = await Ngo.find({ city: { $ne: orphanage.city } })
      .select("ngoName name city profilePic address phone email createdAt");

    const ngosWithStock = await Promise.all(
      ngos.map(async (ngo) => {
        const completedDonations = await Donation.find({
          acceptedBy: ngo._id,
          status: "completed",
        }).select("items bestBefore completedAt donationDate _id donatedItems");

        const stock = completedDonations.flatMap(d => {
          const donatedIndexes = new Set((d.donatedItems || []).map(di => di.itemIndex));
          return d.items
            .map((item, idx) => ({ item, idx }))
            .filter(({ idx }) => !donatedIndexes.has(idx))
            .map(({ item, idx }) => ({
              donationId:  d._id,
              itemIndex:   idx,
              name:        item.name,
              serves:      item.serves,
              bestBefore:  d.bestBefore || null,
              completedAt: d.completedAt || d.donationDate || null,
            }));
        });

        return {
          _id:        ngo._id,
          ngoName:    ngo.ngoName,
          name:       ngo.name,
          city:       ngo.city,
          profilePic: ngo.profilePic,
          address:    ngo.address,
          phone:      ngo.phone,
          email:      ngo.email,
          createdAt:  ngo.createdAt,
          stock,
        };
      })
    );

    const ngosWithItems = ngosWithStock.filter(n => n.stock.length > 0);
    res.json({ orphanageCity: orphanage.city, ngos: ngosWithItems });
  } catch (err) {
    console.error("ngo-out-of-city-stock error:", err);
    res.status(500).json({ message: "Failed to fetch out-of-city NGO stock" });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/orphanage/city-orphanages
// NGO gets all orphanages in their city (for donate-item picker)
// ─────────────────────────────────────────────────────────
router.get("/city-orphanages", authMiddleware, async (req, res) => {
  try {
    const ngo = await Ngo.findById(req.user.id).select("city");
    if (!ngo) return res.status(404).json({ message: "NGO not found" });

    const orphanages = await Orphanage.find({ city: ngo.city })
      .select("orphanageName name city address phone email profilePic childrenCount");

    res.json(orphanages);
  } catch (err) {
    console.error("city-orphanages error:", err);
    res.status(500).json({ message: "Failed to fetch orphanages" });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/orphanage/request-food
// Orphanage requests a specific item — NGO gets notification
// Body: { donationId, itemIndex, ngoId }
// ─────────────────────────────────────────────────────────
router.post("/request-food", authMiddleware, async (req, res) => {
  try {
    const { donationId, ngoId, itemIndex } = req.body;
    const orphanage = await Orphanage.findById(req.user.id)
      .select("orphanageName name city address phone");
    if (!orphanage) return res.status(404).json({ message: "Orphanage not found" });

    const donation = await Donation.findById(donationId);
    if (!donation) return res.status(404).json({ message: "Donation not found" });

    const idx  = itemIndex !== undefined ? itemIndex : 0;
    const item = donation.items[idx];
    const itemName      = item?.name || donation.items.map(i => i.name).join(", ");
    const orphanageName = orphanage.orphanageName || orphanage.name || "An orphanage";

    await Notification.create({
      userId:      ngoId,
      donationId:  donationId,
      type:        "food_request",
      message:     `🏠 ${orphanageName} is requesting the food "${itemName}" from your stock. Tap Donate to send it to them.`,
      metadata: {
        orphanageId:    req.user.id,
        orphanageName:  orphanageName,
        orphanageCity:  orphanage.city,
        orphanageAddr:  orphanage.address,
        orphanagePhone: orphanage.phone,
        itemName,
        itemIndex: idx,
        donationId,
      },
      actionType: "donate",
    });

    res.json({ message: "Food request sent successfully" });
  } catch (err) {
    console.error("request-food error:", err);
    res.status(500).json({ message: "Failed to send food request" });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/orphanage/donate-to-orphanage
// NGO clicks Donate from notification (whole donation flow)
// Body: { donationId, orphanageId }
// ─────────────────────────────────────────────────────────
router.post("/donate-to-orphanage", authMiddleware, async (req, res) => {
  try {
    const { donationId, orphanageId } = req.body;
    const ngo = await Ngo.findById(req.user.id).select("ngoName name city");
    if (!ngo) return res.status(404).json({ message: "NGO not found" });

    const donation = await Donation.findById(donationId);
    if (!donation) return res.status(404).json({ message: "Donation not found" });

    const ngoName   = ngo.ngoName || ngo.name || "NGO";
    const itemNames = donation.items.map(i => i.name).join(", ");

    const alreadyDonatedIndexes = new Set(
      (donation.donatedItems || []).map(di => di.itemIndex)
    );

    const orphanage     = await Orphanage.findById(orphanageId).select("orphanageName name");
    const orphanageName = orphanage?.orphanageName || orphanage?.name || "Orphanage";

    donation.items.forEach((item, idx) => {
      if (!alreadyDonatedIndexes.has(idx)) {
        donation.donatedItems.push({
          itemIndex:     idx,
          itemName:      item.name,
          orphanageId:   orphanageId,
          orphanageName: orphanageName,
          status:        "pending",
        });
      }
    });

    await donation.save();

    await Notification.create({
      userId:     orphanageId,
      donationId: donationId,
      type:       "food_request_accepted",
      message:    `✅ Your request for "${itemNames}" has been accepted by ${ngoName} NGO. They will deliver the food by reaching you.`,
    });

    await Notification.updateMany(
      { userId: req.user.id, donationId: donationId, type: "food_request" },
      { actioned: true }
    );

    res.json({ message: "Donation confirmed, orphanage notified" });
  } catch (err) {
    console.error("donate-to-orphanage error:", err);
    res.status(500).json({ message: "Failed to confirm donation" });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/orphanage/donate-item
// NGO donates a specific item to a chosen orphanage (from FoodStock page)
// Body: { donationId, itemIndex, orphanageId }
// ─────────────────────────────────────────────────────────
router.post("/donate-item", authMiddleware, async (req, res) => {
  try {
    const { donationId, itemIndex, orphanageId } = req.body;

    const ngo = await Ngo.findById(req.user.id).select("ngoName name");
    if (!ngo) return res.status(404).json({ message: "NGO not found" });

    const donation = await Donation.findById(donationId);
    if (!donation) return res.status(404).json({ message: "Donation not found" });

    const item = donation.items[itemIndex];
    if (!item) return res.status(400).json({ message: "Item not found in donation" });

    const alreadyDonated = donation.donatedItems?.some(di => di.itemIndex === itemIndex);
    if (alreadyDonated) return res.status(400).json({ message: "This item has already been donated" });

    const orphanage = await Orphanage.findById(orphanageId)
      .select("orphanageName name city address phone email profilePic");
    if (!orphanage) return res.status(404).json({ message: "Orphanage not found" });

    const ngoName       = ngo.ngoName || ngo.name || "NGO";
    const orphanageName = orphanage.orphanageName || orphanage.name || "Orphanage";

    donation.donatedItems.push({
      itemIndex:     itemIndex,
      itemName:      item.name,
      orphanageId:   orphanageId,
      orphanageName: orphanageName,
      status:        "pending",
    });

    await donation.save();

    await Notification.create({
      userId:     orphanageId,
      donationId: donationId,
      type:       "food_incoming",
      message:    `🍱 ${ngoName} NGO wants to donate "${item.name}" to you and will deliver it to you.`,
      metadata:   { donationId, itemIndex, itemName: item.name, ngoName },
    });

    res.json({ message: "Item donated successfully, orphanage notified" });
  } catch (err) {
    console.error("donate-item error:", err);
    res.status(500).json({ message: "Failed to donate item" });
  }
});

// ─────────────────────────────────────────────────────────
// PUT /api/orphanage/delivery-completed
// NGO marks a specific donated item delivery done
// Body: { donationId, itemIndex }
// ─────────────────────────────────────────────────────────
router.put("/delivery-completed", authMiddleware, async (req, res) => {
  try {
    const { donationId, itemIndex } = req.body;
    const ngo = await Ngo.findById(req.user.id).select("ngoName name");
    if (!ngo) return res.status(404).json({ message: "NGO not found" });

    const donation = await Donation.findById(donationId);
    if (!donation) return res.status(404).json({ message: "Donation not found" });

    const ngoName = ngo.ngoName || ngo.name || "NGO";

    if (itemIndex !== undefined) {
      const donatedItem = donation.donatedItems?.find(di => di.itemIndex === itemIndex);
      if (!donatedItem) return res.status(404).json({ message: "Donated item record not found" });

      donatedItem.status = "awaiting_confirmation";
      await donation.save();

      await Notification.create({
        userId:     donatedItem.orphanageId,
        donationId: donationId,
        type:       "delivery_confirm_request",
        message:    `📦 ${ngoName} NGO wants to confirm that the delivery of "${donatedItem.itemName}" has been completed and you received the food.`,
        actionType: "confirm_delivery",
        metadata:   { donationId, itemIndex, ngoName, itemNames: donatedItem.itemName },
      });
    } else {
      // Legacy: whole donation
      donation.deliveryStatus = "awaiting_confirmation";
      await donation.save();

      const itemNames = donation.items.map(i => i.name).join(", ");
      await Notification.create({
        userId:     donation.deliveryTo,
        donationId: donationId,
        type:       "delivery_confirm_request",
        message:    `📦 ${ngoName} NGO wants to confirm that the delivery of "${itemNames}" has been completed and you received the food.`,
        actionType: "confirm_delivery",
        metadata:   { donationId, ngoName, itemNames },
      });
    }

    res.json({ message: "Delivery completion request sent to orphanage" });
  } catch (err) {
    console.error("delivery-completed error:", err);
    res.status(500).json({ message: "Failed to mark delivery" });
  }
});

// ─────────────────────────────────────────────────────────
// PUT /api/orphanage/confirm-delivery
// Orphanage confirms receipt of a specific item
// Body: { donationId, itemIndex }
// ─────────────────────────────────────────────────────────
router.put("/confirm-delivery", authMiddleware, async (req, res) => {
  try {
    const { donationId, itemIndex } = req.body;
    const orphanage = await Orphanage.findById(req.user.id).select("orphanageName name");
    if (!orphanage) return res.status(404).json({ message: "Orphanage not found" });

    const donation = await Donation.findById(donationId).populate("donor", "name");
    if (!donation) return res.status(404).json({ message: "Donation not found" });

    const orphanageName = orphanage.orphanageName || orphanage.name || "Orphanage";

    if (itemIndex !== undefined) {
      const donatedItem = donation.donatedItems?.find(di => di.itemIndex === itemIndex);
      if (!donatedItem) return res.status(404).json({ message: "Donated item not found" });

      donatedItem.status      = "delivered";
      donatedItem.deliveredAt = new Date();

      const existing = donation.receivedByName || "";
      if (!existing.includes(orphanageName)) {
        donation.receivedByName = existing ? `${existing}, ${orphanageName}` : orphanageName;
      }
      donation.receivedBy = req.user.id;

      await donation.save();

      if (donation.donor) {
        await Notification.create({
          userId:     donation.donor._id || donation.donor,
          donationId: donationId,
          type:       "delivery_confirmed",
          message:    `🏠 ${orphanageName} has confirmed receiving "${donatedItem.itemName}" from your donation. Thank you for your generosity!`,
        });
      }
    } else {
      // Legacy whole-donation confirm
      const itemNames = donation.items.map(i => i.name).join(", ");
      donation.deliveryStatus = "delivered";
      donation.receivedBy     = req.user.id;
      donation.receivedByName = orphanageName;
      await donation.save();

      if (donation.donor) {
        await Notification.create({
          userId:     donation.donor._id || donation.donor,
          donationId: donationId,
          type:       "delivery_confirmed",
          message:    `🏠 ${orphanageName} has confirmed receiving your food donation "${itemNames}". Thank you for your generosity!`,
        });
      }
    }

    await Notification.updateMany(
      { userId: req.user.id, donationId: donationId, type: "delivery_confirm_request" },
      { actioned: true }
    );

    res.json({ message: "Delivery confirmed" });
  } catch (err) {
    console.error("confirm-delivery error:", err);
    res.status(500).json({ message: "Failed to confirm delivery" });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/orphanage/deliveries
// NGO gets all per-item deliveries assigned to orphanages
// ─────────────────────────────────────────────────────────
router.get("/deliveries", authMiddleware, async (req, res) => {
  try {
    const donations = await Donation.find({
      acceptedBy: req.user.id,
      "donatedItems.0": { $exists: true },
    })
      .populate("donatedItems.orphanageId", "orphanageName name address city phone email profilePic")
      .populate("donor", "name phone")
      .sort({ updatedAt: -1 });

    const deliveries = donations.flatMap(d =>
      (d.donatedItems || []).map(di => ({
        _id:            `${d._id}_${di.itemIndex}`,
        donationId:     d._id,
        itemIndex:      di.itemIndex,
        itemName:       di.itemName,
        serves:         d.items[di.itemIndex]?.serves,
        bestBefore:     d.bestBefore,
        donationDate:   d.donationDate,
        deliveryStatus: di.status,
        orphanage:      di.orphanageId,
        orphanageName:  di.orphanageName,
        donatedAt:      di.donatedAt,
        deliveredAt:    di.deliveredAt,
      }))
    );

    res.json(deliveries);
  } catch (err) {
    console.error("deliveries error:", err);
    res.status(500).json({ message: "Failed to fetch deliveries" });
  }
});

module.exports = router;
const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const authMiddleware = require("../middleware/authMiddleware");

/* GET ALL NOTIFICATIONS */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 });
    const unreadCount = notifications.filter(n => !n.read).length;
    res.json({ notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* MARK ALL AS READ */
router.put("/mark-read", authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user.id, read: false },
      { read: true }
    );
    res.json({ message: "All marked as read" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* DELETE ALL NOTIFICATIONS FOR USER */
router.delete("/clear-all", authMiddleware, async (req, res) => {
  try {
    await Notification.deleteMany({ userId: req.user.id });
    res.json({ message: "All notifications cleared" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* MARK NOTIFICATION AS CONFIRMED (after donor hits Confirm) */
router.put("/:id/confirm", authMiddleware, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { confirmed: true, read: true, actioned: true });
    res.json({ message: "Notification confirmed" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* MARK NOTIFICATION AS ACTIONED (generic — used after NGO donates, orphanage confirms, etc.) */
router.put("/:id/action", authMiddleware, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { actioned: true, read: true });
    res.json({ message: "Notification actioned" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

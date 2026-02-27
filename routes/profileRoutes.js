const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcryptjs");

const Donor = require("../models/Donor");
const Ngo = require("../models/Ngo");
const Orphanage = require("../models/Orphanage");

const router = express.Router();

// ─── Multer config ───
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// ─── Helper: get model by role ───
const getModel = (role) => {
  if (role === "donor") return Donor;
  if (role === "ngo") return Ngo;
  if (role === "orphanage") return Orphanage;
  return null;
};

/* ======================================= */
/* UPDATE PROFILE                          */
/* ======================================= */
router.put("/update", authMiddleware, upload.single("profilePic"), async (req, res) => {
  try {
    const { id, role } = req.user;
    const Model = getModel(role);
    if (!Model) return res.status(400).json({ message: "Invalid user role" });

    const updateData = {};
    for (let key in req.body) {
      if (req.body[key] !== undefined) updateData[key] = req.body[key];
    }
    if (req.file) updateData.profilePic = req.file.path;

    const updatedUser = await Model.findByIdAndUpdate(id, updateData, { new: true }).select("-password");
    res.json(updatedUser);
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

/* ======================================= */
/* CHANGE PASSWORD                         */
/* ======================================= */
router.put("/change-password", authMiddleware, async (req, res) => {
  try {
    const { id, role } = req.user;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: "Both old and new password are required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters." });
    }

    const Model = getModel(role);
    if (!Model) return res.status(400).json({ message: "Invalid user role" });

    // ✅ Fetch user WITH password to compare
    const user = await Model.findById(id);
    if (!user) return res.status(404).json({ message: "User not found." });

    // ✅ Check old password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    // ✅ Hash new password and save
    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.json({ message: "Password changed successfully." });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ message: "Failed to change password." });
  }
});

module.exports = router;
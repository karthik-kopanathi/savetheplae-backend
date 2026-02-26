const mongoose = require("mongoose");

const orphanageSchema = new mongoose.Schema({
  orphanageName: String,
  name: String,
  email: String,
  phone: String,
  licenseNumber: String,
  childrenCount: Number,
  address: String,
  city: String,       // ✅ added
  profilePic: String, // ✅ added (for settings page)
  password: String,
  role: { type: String, default: "orphanage" },
});

module.exports = mongoose.model("Orphanage", orphanageSchema);
const mongoose = require("mongoose");

const donorSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  phone: String,
  donorType: String,
  address: String,
  city: String, // ✅ added
  password: String,
  googleId: String,
  profilePic: { type: String },
  role: { type: String, default: "donor" },
});

module.exports = mongoose.model("Donor", donorSchema);
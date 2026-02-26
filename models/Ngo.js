const mongoose = require("mongoose");

const ngoSchema = new mongoose.Schema({
  ngoName: {
    type: String,
    required: true,
  },

  name: {
    type: String,
    required: true,
  },

  email: {
    type: String,
    required: true,
    unique: true,
  },

  phone: {
    type: String,
    required: true,
  },

  regNumber: {
    type: String,
    required: true,
  },

  address: {
    type: String,
    required: true,
  },

  city: {
    type: String,
    required: true,   // 🔥 Important for filtering
  },

  password: {
    type: String,
    required: true,
  },

  role: {
    type: String,
    default: "ngo",
  },
}, { timestamps: true });

module.exports = mongoose.model("Ngo", ngoSchema);
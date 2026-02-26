const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema({
  items: [
    {
      name:   { type: String, required: true },
      serves: { type: Number, required: true },
    },
  ],

  donor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Donor",
    required: true,
  },

  donationDate:        { type: Date, default: Date.now },
  bestBefore:          { type: String, required: true },
  city:                { type: String, required: true },
  location:            { type: String, required: true },
  instructions:        { type: String },
  status:              { type: String, default: "pending" },
  acceptedBy:          { type: mongoose.Schema.Types.ObjectId, ref: "Ngo" },
  confirmationPending: { type: Boolean, default: false },
  completedAt:         { type: Date, default: null },

  // Legacy whole-donation delivery fields (kept for backward compat)
  deliveryTo:     { type: mongoose.Schema.Types.ObjectId, ref: "Orphanage", default: null },
  deliveryStatus: { type: String, enum: ["pending", "awaiting_confirmation", "delivered"], default: null },
  receivedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "Orphanage", default: null },
  receivedByName: { type: String, default: null },

  // ✅ Per-item delivery tracking
  donatedItems: [
    {
      itemIndex:     { type: Number, required: true },   // index into items[]
      itemName:      { type: String },
      orphanageId:   { type: mongoose.Schema.Types.ObjectId, ref: "Orphanage" },
      orphanageName: { type: String },
      status:        { type: String, enum: ["pending", "awaiting_confirmation", "delivered"], default: "pending" },
      donatedAt:     { type: Date, default: Date.now },
      deliveredAt:   { type: Date, default: null },
    },
  ],
});

module.exports = mongoose.model("Donation", donationSchema);
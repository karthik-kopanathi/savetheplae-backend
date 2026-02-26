const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  read: {
    type: Boolean,
    default: false,
  },
  // type: "accepted" | "confirm_pickup" | "complete_profile"
  type: {
    type: String,
    default: "accepted",
  },
  // donationId: used for confirm_pickup notifications
  donationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Donation",
    default: null,
  },
  // confirmed: true after donor hits Confirm
  confirmed: {
    type: Boolean,
    default: false,
  },
  actionType: { type: String, default: null }, 
 metadata:   { type: mongoose.Schema.Types.Mixed, default: null },
 actioned:   { type: Boolean, default: false },

}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);
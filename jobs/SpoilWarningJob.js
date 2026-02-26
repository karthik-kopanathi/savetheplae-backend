// SpoilWarningJob.js
// Place in your backend /jobs folder.
// Call startSpoilWarningJob() once in server.js after DB connects.

const Donation = require("../models/Donation");
const Notification = require("../models/Notification");

const WARN_THRESHOLD_MS = 8 * 60 * 60 * 1000; // 8 hours
const CHECK_INTERVAL_MS = 15 * 60 * 1000;      // ✅ check every 15 min (was 1hr — too slow for ≤8h items)

const parseBestBeforeMs = (str) => {
  if (!str) return null;
  const match = str.match(/(\d+(\.\d+)?)\s*hour/i);
  if (!match) return null;
  return parseFloat(match[1]) * 60 * 60 * 1000;
};

const checkSpoilWarnings = async () => {
  try {
    const donations = await Donation.find({
      status: "completed",
      acceptedBy: { $ne: null },
    });

    const now = Date.now();

    for (const donation of donations) {
      const durationMs = parseBestBeforeMs(donation.bestBefore);
      if (!durationMs) continue;

      // Use completedAt (when food entered stock), fall back to donationDate
      const startTime = donation.completedAt
        ? new Date(donation.completedAt).getTime()
        : new Date(donation.donationDate).getTime();

      const expiresAt  = startTime + durationMs;
      const remaining  = expiresAt - now;

      // Skip if already fully expired
      if (remaining <= 0) continue;

      // ✅ Build set of already-donated itemIndexes
      const donatedIndexes = new Set(
        (donation.donatedItems || []).map(di => di.itemIndex)
      );

      // ✅ Only warn for items still in stock (not donated to an orphanage)
      const undistributedItems = donation.items.filter((_, idx) => !donatedIndexes.has(idx));
      if (undistributedItems.length === 0) continue; // all items already donated — skip

      // Only warn if within the 8-hour window
      if (remaining > WARN_THRESHOLD_MS) continue;

      const hoursLeft = Math.max(1, Math.ceil(remaining / 3600000));

      // ✅ Check per-donation (not per-item) — one warning per donation is enough
      const alreadyNotified = await Notification.findOne({
        userId:     donation.acceptedBy,
        donationId: donation._id,
        type:       "spoil_warning",
      });

      if (alreadyNotified) continue;

      const itemNames = undistributedItems.map(i => i.name).join(", ");

      await Notification.create({
        userId:     donation.acceptedBy,
        donationId: donation._id,
        type:       "spoil_warning",
        message:    `⚠️ Your food stock of "${itemNames}" is about to spoil in ${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""}. Please distribute it as soon as possible!`,
      });

      console.log(`[SpoilWarning] Notified NGO ${donation.acceptedBy} about "${itemNames}" (${hoursLeft}h left)`);
    }
  } catch (err) {
    console.error("[SpoilWarning] Error:", err);
  }
};

// ✅ Also run immediately whenever a donation is marked completed
// Call this from your donationRoutes confirm-completion handler
const checkSpoilForDonation = async (donationId) => {
  try {
    const donation = await Donation.findById(donationId);
    if (!donation || donation.status !== "completed") return;

    const durationMs = parseBestBeforeMs(donation.bestBefore);
    if (!durationMs) return;

    const startTime = donation.completedAt
      ? new Date(donation.completedAt).getTime()
      : new Date(donation.donationDate).getTime();

    const remaining = (startTime + durationMs) - Date.now();
    if (remaining <= 0 || remaining > WARN_THRESHOLD_MS) return;

    const hoursLeft = Math.max(1, Math.ceil(remaining / 3600000));
    const itemNames = donation.items.map(i => i.name).join(", ");

    const alreadyNotified = await Notification.findOne({
      userId:     donation.acceptedBy,
      donationId: donation._id,
      type:       "spoil_warning",
    });
    if (alreadyNotified) return;

    await Notification.create({
      userId:     donation.acceptedBy,
      donationId: donation._id,
      type:       "spoil_warning",
      message:    `⚠️ "${itemNames}" just entered your stock and will spoil in ${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""}! Distribute it immediately.`,
    });

    console.log(`[SpoilWarning] Immediate warning for "${itemNames}" (${hoursLeft}h left)`);
  } catch (err) {
    console.error("[SpoilWarning] checkSpoilForDonation error:", err);
  }
};

const startSpoilWarningJob = () => {
  console.log("[SpoilWarning] Job started — checks every 15 minutes");
  checkSpoilWarnings();
  setInterval(checkSpoilWarnings, CHECK_INTERVAL_MS);
};

module.exports = { startSpoilWarningJob, checkSpoilWarnings, checkSpoilForDonation };
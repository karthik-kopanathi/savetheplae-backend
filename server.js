const express = require("express");
const cors = require("cors");
const passport = require("passport");
require("dotenv").config();

const connectDB = require("./config/db");
require("./config/passport");

const authRoutes = require("./routes/authRoutes");
const googleAuthRoutes = require("./routes/googleAuthRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const donationRoutes = require("./routes/donationRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const { startSpoilWarningJob } = require("./jobs/SpoilWarningJob");
const statsRoutes = require("./routes/statsRoutes");

const app = express();

connectDB().then(() => {
  startSpoilWarningJob();
});

app.use(cors());
app.use(express.json({ limit: "10mb" })); // ✅ increased for Base64 images
app.use(passport.initialize());

// ✅ REMOVED: /uploads static — no longer needed
app.use("/api/auth", authRoutes);
app.use("/api/auth", googleAuthRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/donations", donationRoutes);
app.use("/api/profile", require("./routes/profileRoutes"));
app.use("/api/notifications", notificationRoutes);
app.use("/api/partners", require("./routes/partnersRoutes"));
app.use("/api/orphanage", require("./routes/orphanageRoutes"));
app.use("/api/stats", statsRoutes);
app.use("/api/public", require("./routes/publicRoutes"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
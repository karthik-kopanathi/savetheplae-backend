const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const Donor = require("../models/Donor");
const Notification = require("../models/Notification");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;

        let user = await Donor.findOne({ email });

        // ✅ Existing user — just update name
        if (user) {
          user.name = profile.displayName;
          await user.save();

          // ✅ If city is still missing, create/ensure the notification exists
          if (!user.city) {
            const alreadyNotified = await Notification.findOne({
              userId: user._id,
              type: "complete_profile",
            });

            if (!alreadyNotified) {
              await Notification.create({
                userId: user._id,
                message: "👋 Please complete your profile — add your city in Settings so we can match you with nearby donations.",
                type: "complete_profile",
                read: false,
              });
            }
          }

          return done(null, user);
        }

        // ✅ New user — download profile pic
        let profilePic = "/default-avatar.png";
        const googlePhoto = profile.photos?.[0]?.value;

        if (googlePhoto) {
          try {
            const response = await axios({
              url: googlePhoto,
              method: "GET",
              responseType: "arraybuffer",
            });

            const uploadDir = path.join(__dirname, "../uploads");
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

            const imagePath = path.join(uploadDir, `${profile.id}.jpg`);
            fs.writeFileSync(imagePath, response.data);
            profilePic = `uploads/${profile.id}.jpg`;
          } catch (error) {
            console.log("Image download failed:", error.message);
          }
        }

        // ✅ Create new donor
        user = await Donor.create({
          name: profile.displayName,
          email,
          googleId: profile.id,
          profilePic,
          role: "donor",
          // city intentionally left empty — they must fill it in settings
        });

        // ✅ Create "complete your profile" notification for new Google user
        await Notification.create({
          userId: user._id,
          message: "👋 Please complete your profile — add your Details in Settings so we can match you with nearby donations.",
          type: "complete_profile",
          read: false,
        });

        return done(null, user);
      } catch (err) {
        console.error("Google login error:", err);
        return done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await Donor.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
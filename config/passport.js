const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const axios = require("axios");
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

        // ✅ New user — download profile pic as Base64 (no disk needed)
        let profilePic = "/default-avatar.png";
        const googlePhoto = profile.photos?.[0]?.value;

        if (googlePhoto) {
          try {
            const response = await axios({
              url: googlePhoto,
              method: "GET",
              responseType: "arraybuffer",
            });

            const base64 = Buffer.from(response.data).toString("base64");
            profilePic = `data:image/jpeg;base64,${base64}`;
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
        });

        // ✅ Create "complete your profile" notification
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
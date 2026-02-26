const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");

const router = express.Router();

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  (req, res) => {
    // 🔑 CREATE JWT
    const token = jwt.sign(
      {
        id: req.user._id,
        role: req.user.role || "donor",
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // 🔁 REDIRECT WITH TOKEN
   res.redirect(`http://localhost:5173/login?token=${token}`);
  }
);

module.exports = router;

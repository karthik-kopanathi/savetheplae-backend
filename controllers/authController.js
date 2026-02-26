const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Donor = require("../models/Donor");
const Ngo = require("../models/Ngo");
const Orphanage = require("../models/Orphanage");

exports.register = async (req, res) => {
  try {
    const { role, email, password } = req.body;

    // 1️⃣ Check if user already exists based on role
    let existingUser;
    if (role === "donor") existingUser = await Donor.findOne({ email });
    if (role === "ngo") existingUser = await Ngo.findOne({ email });
    if (role === "orphanage") existingUser = await Orphanage.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ message: "You already have an account" });
    }

    // 2️⃣ Hash password
    const hashed = await bcrypt.hash(password, 10);

    // 3️⃣ Create user
    let user;
    if (role === "donor") user = await Donor.create({ ...req.body, password: hashed });
    if (role === "ngo") user = await Ngo.create({ ...req.body, password: hashed });
    if (role === "orphanage") user = await Orphanage.create({ ...req.body, password: hashed });

    res.status(201).json({ message: "Registered successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Registration failed" });
  }
};

exports.login = async (req, res) => {
  const { email, password, role } = req.body;
  try {
    let user;
    if (role === "donor") user = await Donor.findOne({ email });
    if (role === "ngo") user = await Ngo.findOne({ email });
    if (role === "orphanage") user = await Orphanage.findOne({ email });

    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, role }, process.env.JWT_SECRET);
    res.json({ token, role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login failed" });
  }
};

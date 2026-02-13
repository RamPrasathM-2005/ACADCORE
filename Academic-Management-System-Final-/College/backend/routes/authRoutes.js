import express from "express";
import requireAuth from "../../middleware/requireAuth.js"; // Added .js extension
import {
  login,
  googleLogin,
  logout,
  me,
  forgotPassword,
  resetPassword,
} from "../../controllers/auth/authController.js"; // Added .js extension

const router = express.Router();

// Public routes
router.post("/login", login);
router.post("/google-login", googleLogin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

// Protected routes
router.get("/me", requireAuth, me);
router.post("/logout", requireAuth, logout);

export default router; // Changed from module.exports
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import crypto from "crypto";
import db from "../../models/index.js";
import { sendMail } from "../../services/mailService.js";
import requireAuth from "../../middleware/requireAuth.js";
import { checkLockout, clearFailedAttempts, registerFailedAttempt } from "../../utils/loginLockout.js";

const { Op } = db.Sequelize;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";
const ACCESS_EXPIRY = process.env.ACCESS_TOKEN_EXPIRES || "15m";
const REFRESH_EXPIRY = process.env.REFRESH_TOKEN_EXPIRES || "7d";
const ACCESS_COOKIE_MS = parseInt(process.env.ACCESS_COOKIE_MAX_AGE_MS || `${15 * 60 * 1000}`, 10);
const REFRESH_COOKIE_MS = parseInt(process.env.REFRESH_COOKIE_MAX_AGE_MS || `${7 * 24 * 60 * 60 * 1000}`, 10);
const JWT_ISSUER = process.env.JWT_ISSUER || "acadcore";

let refreshTokenStoreReady = false;

const tokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const createTokenId = () => crypto.randomBytes(16).toString("hex");

const jwtSecret = () => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  return process.env.JWT_SECRET;
};

const accessCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: ACCESS_COOKIE_MS,
});

const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: REFRESH_COOKIE_MS,
});

const clearCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
});

const createAccessToken = (payload) =>
  jwt.sign({ ...payload, type: "access" }, jwtSecret(), {
    expiresIn: ACCESS_EXPIRY,
    issuer: JWT_ISSUER,
  });

const createRefreshToken = (payload, tokenId) =>
  jwt.sign({ ...payload, type: "refresh", tokenId }, jwtSecret(), {
    expiresIn: REFRESH_EXPIRY,
    issuer: JWT_ISSUER,
  });

const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions());
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
};

const clearAuthCookies = (res) => {
  res.clearCookie(ACCESS_COOKIE, clearCookieOptions());
  res.clearCookie(REFRESH_COOKIE, clearCookieOptions());
};

const ensureRefreshTokenStore = async () => {
  if (refreshTokenStoreReady || !db.RefreshToken) return;
  await db.RefreshToken.sync();
  refreshTokenStoreReady = true;
};

const persistRefreshToken = async ({ tokenId, refreshToken, userId, req, expiresAt }) => {
  if (!db.RefreshToken) return null;
  await ensureRefreshTokenStore();
  return db.RefreshToken.create({
    tokenId,
    userId,
    tokenHash: tokenHash(refreshToken),
    expiresAt,
    createdByIp: req.ip,
    userAgent: req.get("user-agent") || null,
  });
};

const findStoredRefreshToken = async (refreshToken) => {
  if (!db.RefreshToken) return null;
  await ensureRefreshTokenStore();
  return db.RefreshToken.findOne({
    where: {
      tokenHash: tokenHash(refreshToken),
      revokedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
  });
};

const revokeStoredRefreshToken = async (record, replacedByTokenId = null) => {
  if (!record || record.revokedAt) return;
  record.revokedAt = new Date();
  record.replacedByTokenId = replacedByTokenId;
  await record.save();
};

const revokeAllUserRefreshTokens = async (userId) => {
  if (!db.RefreshToken || !userId) return;
  await ensureRefreshTokenStore();
  await db.RefreshToken.update(
    { revokedAt: new Date() },
    { where: { userId, revokedAt: null } }
  );
};

const issueTokensForUser = async (user, req) => {
  const roleName = user.role?.roleName || "User";
  const payload = { id: user.userId, roleId: user.roleId, role: roleName };
  const accessToken = createAccessToken(payload);
  const tokenId = createTokenId();
  const refreshToken = createRefreshToken(payload, tokenId);
  const decodedRefresh = jwt.decode(refreshToken);
  const expiresAt = new Date(decodedRefresh.exp * 1000);

  await persistRefreshToken({
    tokenId,
    refreshToken,
    userId: user.userId,
    req,
    expiresAt,
  });

  return { accessToken, refreshToken, roleName, userId: user.userId };
};

const getLoginIdentifier = (body = {}) => {
  return (body.identifier || body.email || body.userNumber || "").trim();
};

export const protect = requireAuth;

export const login = async (req, res) => {
  try {
    const identifier = getLoginIdentifier(req.body);
    const password = String(req.body.password || "").trim();
    const lockout = checkLockout(identifier, req.ip);

    if (lockout.locked) {
      return res.status(429).json({
        status: "error",
        message: `Account temporarily locked. Try again in ${lockout.retryAfterSec}s.`,
      });
    }

    const user = await db.User.findOne({
      where: {
        [Op.or]: [{ userMail: identifier }, { userNumber: identifier }],
      },
      include: [{ model: db.Role, as: "role", attributes: ["roleName", "roleId"] }],
    });

    if (!user) {
      registerFailedAttempt(identifier, req.ip);
      return res.status(401).json({ msg: "Invalid credentials" });
    }

    if (user.status && user.status !== "Active") {
      return res.status(403).json({ msg: "User is inactive" });
    }

    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) {
      registerFailedAttempt(identifier, req.ip);
      return res.status(401).json({ msg: "Invalid credentials" });
    }

    clearFailedAttempts(identifier, req.ip);
    const { accessToken, refreshToken, roleName, userId } = await issueTokensForUser(user, req);
    setAuthCookies(res, accessToken, refreshToken);

    return res.json({
      message: "Login success",
      role: roleName,
      user: { id: userId, role: roleName, userId },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

export const googleLogin = async (req, res) => {
  try {
    const { token: googleToken } = req.body;

    if (!googleToken) return res.status(400).json({ msg: "Google token missing" });
    if (!googleClient) return res.status(500).json({ msg: "Google login not configured" });

    const ticket = await googleClient.verifyIdToken({ idToken: googleToken, audience: googleClientId });
    const payload = ticket.getPayload();
    const email = payload?.email;
    if (!email) return res.status(400).json({ msg: "Invalid Google token" });

    const user = await db.User.findOne({
      where: { userMail: email },
      include: [{ model: db.Role, as: "role", attributes: ["roleId", "roleName"] }],
    });

    if (!user) return res.status(401).json({ msg: "No user found for this Google account" });
    if (user.status && user.status !== "Active") return res.status(403).json({ msg: "User is inactive" });

    const { accessToken, refreshToken, roleName, userId } = await issueTokensForUser(user, req);
    setAuthCookies(res, accessToken, refreshToken);

    return res.json({
      message: "Google login success",
      role: roleName,
      user: { id: userId, role: roleName, userId },
    });
  } catch (err) {
    console.error("Google login error:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

export const refresh = async (req, res) => {
  try {
    const currentRefresh = req.cookies?.[REFRESH_COOKIE];
    if (!currentRefresh) {
      clearAuthCookies(res);
      return res.status(401).json({ status: "failure", message: "Refresh token missing" });
    }

    let decoded;
    try {
      decoded = jwt.verify(currentRefresh, jwtSecret(), { issuer: JWT_ISSUER });
    } catch {
      clearAuthCookies(res);
      return res.status(401).json({ status: "failure", message: "Invalid refresh token" });
    }

    if (decoded.type !== "refresh" || !decoded.tokenId) {
      clearAuthCookies(res);
      return res.status(401).json({ status: "failure", message: "Invalid token type" });
    }

    const stored = await findStoredRefreshToken(currentRefresh);
    if (!stored || stored.tokenId !== decoded.tokenId) {
      clearAuthCookies(res);
      return res.status(401).json({ status: "failure", message: "Refresh token revoked" });
    }

    const user = await db.User.findByPk(decoded.id, {
      include: [{ model: db.Role, as: "role", attributes: ["roleId", "roleName"] }],
    });
    if (!user || (user.status && user.status !== "Active")) {
      await revokeStoredRefreshToken(stored);
      clearAuthCookies(res);
      return res.status(401).json({ status: "failure", message: "User not active" });
    }

    const { accessToken, refreshToken, roleName, userId } = await issueTokensForUser(user, req);
    const newDecoded = jwt.decode(refreshToken);
    await revokeStoredRefreshToken(stored, newDecoded?.tokenId || null);

    setAuthCookies(res, accessToken, refreshToken);

    return res.status(200).json({
      status: "success",
      message: "Token refreshed",
      user: { id: userId, userId, role: roleName },
    });
  } catch (err) {
    console.error("Refresh error:", err);
    clearAuthCookies(res);
    return res.status(500).json({ status: "error", message: "Failed to refresh token" });
  }
};

export const me = async (req, res) => {
  try {
    return res.json({
      id: req.user.id,
      userId: req.user.id,
      role: req.user.role,
      roleId: req.user.roleId,
    });
  } catch {
    return res.status(500).json({ msg: "Server error" });
  }
};

export const logout = async (req, res) => {
  try {
    const currentRefresh = req.cookies?.[REFRESH_COOKIE];
    if (currentRefresh) {
      const stored = await findStoredRefreshToken(currentRefresh);
      if (stored) await revokeStoredRefreshToken(stored);
      else if (req.user?.id) await revokeAllUserRefreshTokens(req.user.id);
    } else if (req.user?.id) {
      await revokeAllUserRefreshTokens(req.user.id);
    }
    clearAuthCookies(res);
    return res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    clearAuthCookies(res);
    return res.status(200).json({ message: "Logged out successfully" });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    if (!email) return res.status(400).json({ msg: "Email is required" });

    const user = await db.User.findOne({ where: { userMail: email } });
    if (!user) return res.status(200).json({ msg: "If the email exists, a reset link has been sent" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    if (db.ResetToken) {
      await db.ResetToken.destroy({ where: { userId: user.userId } });
      await db.ResetToken.create({ userId: user.userId, token: hashedToken, expiresAt });
    }

    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
    const emailHtml = `<h2>Password Reset Request</h2><p>Click <a href="${resetUrl}">here</a> to reset.</p>`;

    await sendMail({ to: email, subject: "Password Reset Request", html: emailHtml });
    return res.status(200).json({ msg: "If the email exists, a reset link has been sent" });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (password !== confirmPassword) return res.status(400).json({ msg: "Passwords do not match" });

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const resetTokenEntry = await db.ResetToken?.findOne({
      where: { token: hashedToken, expiresAt: { [Op.gt]: new Date() } },
    });

    if (!resetTokenEntry) return res.status(400).json({ msg: "Invalid or expired token" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await db.User.update({ password: hashedPassword }, { where: { userId: resetTokenEntry.userId } });
    await revokeAllUserRefreshTokens(resetTokenEntry.userId);
    await resetTokenEntry.destroy();

    return res.status(200).json({ msg: "Password reset successful" });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

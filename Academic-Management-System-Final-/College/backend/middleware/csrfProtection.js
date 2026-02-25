const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const getAllowedOrigins = () => {
  const defaults = ["http://localhost:5173"];
  const envOrigins = (process.env.FRONTEND_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...defaults, ...envOrigins]);
};

const allowedOrigins = getAllowedOrigins();

export const csrfProtection = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get("origin");
  const referer = req.get("referer");

  if (origin && allowedOrigins.has(origin)) return next();
  if (referer && [...allowedOrigins].some((o) => referer.startsWith(o))) return next();

  return res.status(403).json({
    status: "error",
    message: "CSRF validation failed: untrusted origin",
  });
};

export default csrfProtection;

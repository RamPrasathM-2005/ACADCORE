import jwt from "jsonwebtoken";

// Renamed the function to requireAuth so it matches your export and your routes
export const requireAuth = (req, res, next) => {
  // 1. Check for token in cookies
  // 2. Also check Authorization header
  let token = req.cookies?.access_token;

  if (!token && req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ status: "failure", message: "Not authorized, please login" });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Add user info to request object
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ status: "failure", message: "Token is invalid or expired" });
  }
};

// Now this works because requireAuth is defined above
export default requireAuth;
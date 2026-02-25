const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

const sanitizeValue = (value) => {
  if (typeof value === "string") {
    return value.replace(CONTROL_CHARS, "").trim();
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === "object") {
    const next = {};
    for (const [k, v] of Object.entries(value)) {
      next[k] = sanitizeValue(v);
    }
    return next;
  }
  return value;
};

export const sanitizeInput = (req, res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }
  if (req.query && typeof req.query === "object") {
    req.query = sanitizeValue(req.query);
  }
  if (req.params && typeof req.params === "object") {
    req.params = sanitizeValue(req.params);
  }
  next();
};

export default sanitizeInput;

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

function verifyToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Middleware: require valid JWT
function required(req, res, next) {
  const payload = verifyToken(req);
  if (!payload) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  req.user = payload;
  next();
}

// Middleware: attach user if token present, but do not block
function optional(req, res, next) {
  const payload = verifyToken(req);
  if (payload) req.user = payload;
  next();
}

module.exports = { required, optional };

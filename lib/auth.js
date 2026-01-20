import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

// Verify JWT token and extract user
export function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No token provided');
  }
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

// Check if user has required role
export function checkRole(user, allowedRoles) {
  if (!allowedRoles.includes(user.role)) {
    throw new Error('Insufficient permissions');
  }
  return true;
}

// Generate JWT token
export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { 
    expiresIn: process.env.JWT_EXPIRES_IN || '7d' 
  });
}

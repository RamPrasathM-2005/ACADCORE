import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import winston from 'winston';
import adminRoutes from './routes/admin/adminRoutes.js';
import authRoutes from './routes/auth/authRoutes.js';
import departmentRoutes from './routes/departmentRoutes.js';
import staffRoutes from './routes/staff/staffRoutes.js';
import attendanceRoutes from './routes/staff/staffattendanceroutes.js';
import adminattendance from './routes/admin/adminattendanceroutes.js';
import attendanceReportRoutes from './routes/admin/attendanceReportRoutes.js'
import studentRoutes from './routes/student/studentRoutes.js';
 import verticalRoutes from './routes/admin/verticalRoutes.js';
import cbcsRouter from './routes/cbcsRoutes.js';
import companyRoutes from './routes/companyRoutes.js';
import roleRoutes from './routes/roleRoutes.js'
import userRoutes from './routes/userRoutes.js'
import sanitizeInput from './middleware/sanitizeInput.js';
import csrfProtection from './middleware/csrfProtection.js';

dotenv.config({ path: './config.env' });

const app = express();

// Structured logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// HTTPS redirection
app.use((req, res, next) => {
  if (req.protocol === 'http' && process.env.NODE_ENV === 'production') {
    return res.redirect(301, `https://${req.get('host')}${req.url}`);
  }
  next();
});

// CORS (moved early)
const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:5173'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'CSRF-Token'],
  maxAge: 600,
  optionsSuccessStatus: 204
}));

app.options('*', cors());

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:5173', 'http://localhost:4000'],
      imgSrc: ["'self'", 'data:']
    }
  }
}));

// Cookie parser (early for sessions)
app.use(cookieParser());

// Body parsing (before rate limit) - CRITICAL FIX: Use rawBody for potential proxy issues, but mainly disable sanitization on body fields
app.use(express.json({ limit: '10mb', verify: (req, res, buf) => { req.rawBody = buf; } })); // Preserve raw for debugging
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 700 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/api/auth/'),
  message: { status: 'error', message: 'Too many requests, try again later.' },
  handler: (req, res, _next, options) => {
    logger.warn({ message: 'Rate limit exceeded', ip: req.ip, url: req.url });
    res.status(429).json(options.message);
  }
});
app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many authentication attempts, try again later.' },
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/google-login', authLimiter);

app.use(csrfProtection);

// Routes (apply limiter only where needed; remove from bulk routes if batching)
// NOTE: Auth limiter commented out above, so removed from here
app.use('/api/auth', sanitizeInput, authRoutes);
app.use('/api/companies', sanitizeInput, companyRoutes);
app.use('/api/roles', sanitizeInput, roleRoutes);
app.use('/api/users', sanitizeInput, userRoutes);
app.use('/api/admin', sanitizeInput, adminRoutes); // No global limiter here if bulk
app.use('/api/departments', sanitizeInput, departmentRoutes);
app.use('/api/staff', sanitizeInput, staffRoutes);
app.use('/api/staff/attendance', sanitizeInput, attendanceRoutes);
app.use('/api/admin/attendance', sanitizeInput, adminattendance);
app.use("/api/admin/attendanceReports", attendanceReportRoutes);
app.use('/api/student', sanitizeInput, studentRoutes);
app.use('/api/admin', sanitizeInput, verticalRoutes);
app.use('/api/cbcs', cbcsRouter);

// Global CORS fallback for any response (add this new middleware)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, CSRF-Token');
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'success', message: 'Server running' });
});

// Error handling
app.use((err, req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, CSRF-Token');
  logger.error({
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    ip: req.ip
  });
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ status: 'error', message: 'Invalid CSRF token' });
  }
  res.status(500).json({ status: 'error', message: err.message || 'Something went wrong!' });
});

export default app;

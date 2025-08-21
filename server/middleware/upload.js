const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const uploadsDir = path.join(__dirname, '../uploads');
const expenseAttachmentsDir = path.join(uploadsDir, 'expenses');
const profilePicturesDir = path.join(uploadsDir, 'profiles');

[uploadsDir, expenseAttachmentsDir, profilePicturesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure storage for expense attachments
const expenseStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, expenseAttachmentsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp and user ID
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const userId = req.user?.id || 'unknown';
    const sanitizedOriginalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `expense-${userId}-${uniqueSuffix}-${sanitizedOriginalName}`);
  }
});

// Configure storage for profile pictures
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, profilePicturesDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename for profile picture
    const userId = req.user?.id || 'unknown';
    const ext = path.extname(file.originalname);
    cb(null, `profile-${userId}-${Date.now()}${ext}`);
  }
});

// File filter for images
const imageFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos de imagen (JPEG, PNG, GIF, WebP)'), false);
  }
};

// File filter for expense attachments (more permissive)
const expenseFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido. Se permiten: imágenes, PDF, documentos de Office y archivos de texto'), false);
  }
};

// Multer configurations
const expenseUpload = multer({
  storage: expenseStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files per expense
  },
  fileFilter: expenseFilter
});

const profileUpload = multer({
  storage: profileStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for profile pictures
    files: 1 // Only one profile picture
  },
  fileFilter: imageFilter
});

module.exports = {
  expenseUpload,
  profileUpload,
  uploadsDir,
  expenseAttachmentsDir,
  profilePicturesDir
};
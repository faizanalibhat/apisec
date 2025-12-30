import fs from "fs";
import path from "path";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "auth-scripts");

/**
 * Ensure upload directory exists
 */
function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

/**
 * Multer disk storage config
 */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },

  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  }
});

/**
 * Multer instance
 */
const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  }
});

/**
 * Normalize file object(s) for downstream usage
 */
function normalizeFiles(req, res, next) {
  const files = [];

  const rawFiles = req.files
    ? Array.isArray(req.files)
      ? req.files
      : Object.values(req.files).flat()
    : req.file
      ? [req.file]
      : [];

  for (const file of rawFiles) {
    files.push({
      filename: file.filename,
      original_name: file.originalname,
      file_type: file.mimetype,
      file_size: file.size,
      storage: "disk",
      path: file.path
    });
  }

  req.uploadedFiles = files;
  next();
}

/**
 * Export helpers
 */
export const uploadSingle = (fieldName) => [
  upload.single(fieldName),
  normalizeFiles
];

export const uploadMultiple = (fieldName, maxCount = 5) => [
  upload.array(fieldName, maxCount),
  normalizeFiles
];

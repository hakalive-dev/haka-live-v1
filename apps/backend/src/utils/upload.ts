import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../middleware/error.middleware';

// Use memory storage — buffers are passed to Supabase Storage, not written to disk.
// Render and other cloud platforms have ephemeral filesystems, so disk storage is unreliable.
const memStorage = multer.memoryStorage();

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowed = /jpeg|jpg|png|gif|webp|pdf|doc|docx/;
  const ext = path.extname(file.originalname).toLowerCase().slice(1);
  if (allowed.test(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only image and document files are allowed'));
  }
};

export const adminUpload = multer({
  storage: memStorage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const imageFileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Only JPEG, PNG, or WebP images are allowed', 400));
  }
};

/** Image-only multer instance for chat image uploads (5 MB cap). */
export const chatImageUpload = multer({
  storage: memStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

/** Audio-only multer instance for room music uploads (20 MB cap). */
const audioFileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const extAllowed = /^(mp3|m4a|aac|wav|ogg)$/;
  const ext = path.extname(file.originalname).toLowerCase().slice(1);
  if (extAllowed.test(ext)) {
    cb(null, true);
  } else {
    cb(new AppError('Only audio files (mp3, m4a, aac, wav, ogg) are allowed', 400));
  }
};

export const audioUpload = multer({
  storage: memStorage,
  fileFilter: audioFileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

const momentMediaFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const imageExt = /^(jpe?g|png|webp)$/i;
  const videoExt = /^(mp4|mov|webm|m4v)$/i;
  const ext = path.extname(file.originalname).toLowerCase().slice(1);
  if (imageExt.test(ext) || videoExt.test(ext)) {
    cb(null, true);
    return;
  }
  cb(new AppError('Only image (jpeg, png, webp) or video (mp4, mov, webm) files are allowed', 400));
};

/** Moment / short-video uploads — images up to 10 MB, videos up to 50 MB. */
export const momentMediaUpload = multer({
  storage: memStorage,
  fileFilter: momentMediaFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});

/** Generate a unique storage filename preserving the original extension */
export function storageFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  return `${uuidv4()}${ext}`;
}

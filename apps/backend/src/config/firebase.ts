import admin from 'firebase-admin';
import { env } from './env';

// Initialize Firebase Admin SDK once.
// The private key uses literal \n in env — replace with real newlines.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      // Docker Compose env_file includes surrounding quotes as literal chars — strip them.
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n'),
    }),
  });
}

export const firebaseAdmin = admin;

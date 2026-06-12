#!/usr/bin/env node
/**
 * Fails the build if expo-video Media3 1.9.0 patch was not applied.
 * vision-camera requires Media3 1.9; unpatched expo-video 3.0.x crashes with AbstractMethodError.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const playerDir = path.join(
  root,
  'node_modules',
  'expo-video',
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'video',
  'player',
);
const buildGradle = path.join(root, 'node_modules', 'expo-video', 'android', 'build.gradle');
const loadControl = path.join(playerDir, 'DefaultLoadControl.java');
const videoPlayerLoadControl = path.join(playerDir, 'VideoPlayerLoadControl.kt');

const errors = [];

if (!fs.existsSync(buildGradle)) {
  errors.push('expo-video android/build.gradle not found — run npm install');
} else {
  const gradle = fs.readFileSync(buildGradle, 'utf8');
  if (!gradle.includes('androidxMedia3Version = "1.9.0"')) {
    errors.push('expo-video build.gradle must pin androidxMedia3Version = "1.9.0"');
  }
}

if (!fs.existsSync(loadControl)) {
  errors.push('expo-video DefaultLoadControl.java not found');
} else {
  const java = fs.readFileSync(loadControl, 'utf8');
  if (!java.includes('getAllocator(PlayerId playerId)')) {
    errors.push('DefaultLoadControl must use getAllocator(PlayerId playerId) for Media3 1.9');
  }
}

if (!fs.existsSync(videoPlayerLoadControl)) {
  errors.push('expo-video VideoPlayerLoadControl.kt not found');
} else {
  const kotlin = fs.readFileSync(videoPlayerLoadControl, 'utf8');
  if (!kotlin.includes('override fun getAllocator(playerId: PlayerId)')) {
    errors.push('VideoPlayerLoadControl must override getAllocator(playerId: PlayerId)');
  }
}

if (errors.length > 0) {
  console.error('[verify-expo-video-patch] FAILED:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  console.error('\nRun: npm run postinstall (patch-package + postinstall-fixes.mjs)');
  process.exit(1);
}

console.log('[verify-expo-video-patch] OK — expo-video Media3 1.9 patch verified');

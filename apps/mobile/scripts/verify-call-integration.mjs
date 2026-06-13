#!/usr/bin/env node
/**
 * Static integration checks for 1:1 voice/video calling.
 * Run: node apps/mobile/scripts/verify-call-integration.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '../..');

function read(relFromMobile) {
  return fs.readFileSync(path.join(root, relFromMobile), 'utf8');
}

function readRepo(rel) {
  return fs.readFileSync(path.join(repo, rel), 'utf8');
}

const checks = [
  {
    name: 'IncomingCallProvider wired in App',
    pass: () => read('App.tsx').includes('IncomingCallProvider'),
  },
  {
    name: 'DM header has voice + video call buttons',
    pass: () => {
      const s = read('src/screens/chat/DMConversationScreen.tsx');
      return s.includes('startVoiceCall') && s.includes('startVideoCall');
    },
  },
  {
    name: 'VideoCallScreen supports callType voice',
    pass: () => read('src/screens/chat/VideoCallScreen.tsx').includes("callType = 'video'"),
  },
  {
    name: 'Incoming overlay replaces Alert',
    pass: () => {
      const s = read('src/utils/incomingVideoCall.ts');
      return s.includes('showIncomingCallFromExternal') && !s.includes('Alert.alert');
    },
  },
  {
    name: 'Ringtone asset exists',
    pass: () => fs.existsSync(path.join(root, 'assets/sounds/ringtone.wav')),
  },
  {
    name: 'Backend signalOutgoingCall supports callType',
    pass: () => readRepo('apps/backend/src/modules/chat/chat.push.ts').includes('callType'),
  },
  {
    name: 'Backend invite accepts callType body',
    pass: () => readRepo('apps/backend/src/modules/chat/chat.controller.ts').includes("req.body?.callType"),
  },
];

let failed = 0;
for (const c of checks) {
  const ok = c.pass();
  console.log(ok ? `✓ ${c.name}` : `✗ ${c.name}`);
  if (!ok) failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log('\nAll call integration checks passed.');
console.log('Manual device test: use dev/release build (not Expo Go), open DM → voice/video → answer on second device.');

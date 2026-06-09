#!/usr/bin/env node
/**
 * Downloads payout provider logos from documented public sources.
 * Run: node scripts/fetch-payout-brand-logos.mjs
 *
 * Sources:
 * - Wikimedia Commons / Wikipedia (per-file license on file page)
 * - Simple Icons (CC0) https://simpleicons.org/
 * - Official site favicons (OPay, PalmPay) — low-res; replace with brand kit when available
 *
 * Trademarks belong to their owners. Verify licenses before production release.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../assets/payment-methods/providers');

/** @type {Array<{ provider: string; url: string; filename: string; source: string; postConvert?: string }>} */
const DOWNLOADS = [
  // —— Batch 1 (Commons / Simple Icons) ——
  {
    provider: 'gcash',
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/52/GCash_logo.svg',
    filename: 'gcash.svg',
    source: 'Wikimedia Commons — File:GCash logo.svg',
  },
  {
    provider: 'maya',
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/e6/Maya_logo.svg',
    filename: 'maya.svg',
    source: 'Wikimedia Commons — File:Maya logo.svg (CC BY 4.0)',
  },
  {
    provider: 'mpesa',
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/15/M-PESA_LOGO-01.svg',
    filename: 'mpesa.svg',
    source: 'Wikimedia Commons — File:M-PESA LOGO-01.svg',
  },
  {
    provider: 'easypaisa',
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/9c/Easypaisa_Digital_Bank_logo.png',
    filename: 'easypaisa.png',
    source: 'Wikimedia Commons — File:Easypaisa Digital Bank logo.png',
  },
  {
    provider: 'jazzcash',
    url: 'https://upload.wikimedia.org/wikipedia/commons/4/41/JazzCash_logo_%282025%29.png',
    filename: 'jazzcash.png',
    source: 'Wikimedia Commons — File:JazzCash logo (2025).png',
  },
  {
    provider: 'esewa',
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Esewa_logo.webp',
    filename: 'esewa.webp',
    source: 'Wikimedia Commons — File:Esewa logo.webp',
  },
  {
    provider: 'usdt_trc20',
    url: 'https://cdn.jsdelivr.net/npm/simple-icons@14.15.0/icons/tether.svg',
    filename: 'usdt_trc20.svg',
    source: 'Simple Icons (CC0) — Tether',
  },
  {
    provider: 'usdt_bep20',
    url: 'https://cdn.jsdelivr.net/npm/simple-icons@14.15.0/icons/binance.svg',
    filename: 'usdt_bep20.svg',
    source: 'Simple Icons (CC0) — Binance',
  },
  {
    provider: 'vodafone_cash',
    url: 'https://cdn.jsdelivr.net/npm/simple-icons@14.15.0/icons/vodafone.svg',
    filename: 'vodafone_cash.svg',
    source: 'Simple Icons (CC0) — Vodafone',
  },
  {
    provider: 'sepa_iban',
    url: 'https://cdn.jsdelivr.net/npm/simple-icons@14.15.0/icons/sepa.svg',
    filename: 'sepa_iban.svg',
    source: 'Simple Icons (CC0) — SEPA',
  },
  // —— Batch 2 (Wikipedia / Commons / official favicon) ——
  {
    provider: 'bkash',
    url: 'https://upload.wikimedia.org/wikipedia/en/6/68/BKash_logo.svg',
    filename: 'bkash.svg',
    source: 'English Wikipedia — File:BKash logo.svg',
  },
  {
    provider: 'nagad',
    url: 'https://upload.wikimedia.org/wikipedia/bn/9/97/%E0%A6%A8%E0%A6%97%E0%A6%A6%E0%A7%87%E0%A6%B0_%E0%A6%B2%E0%A7%8B%E0%A6%97%E0%A7%8B.svg',
    filename: 'nagad.svg',
    source: 'Bengali Wikipedia — নগদের লোগো.svg',
  },
  {
    provider: 'telebirr',
    url: 'https://upload.wikimedia.org/wikipedia/en/a/a4/Telebirr.png',
    filename: 'telebirr.png',
    source: 'English Wikipedia — File:Telebirr.png',
  },
  {
    provider: 'momo',
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/a0/MoMo_Logo_App.svg',
    filename: 'momo.svg',
    source: 'Wikimedia Commons — File:MoMo Logo App.svg (MoMo developer branding)',
  },
  {
    provider: 'khalti',
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/ca/Khalti_Digital_Wallet_Logo.jpg',
    filename: 'khalti.jpg',
    source: 'Wikimedia Commons — File:Khalti Digital Wallet Logo.jpg (CC BY-SA 4.0)',
  },
  {
    provider: 'awash_bank',
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/33/Awash_International_Bank.png',
    filename: 'awash_bank.png',
    source: 'Wikimedia Commons — File:Awash International Bank.png',
  },
  {
    provider: 'abyssinia_bank',
    url: 'https://upload.wikimedia.org/wikipedia/en/e/ed/Bank_of_Abyssinia.png',
    filename: 'abyssinia_bank.png',
    source: 'English Wikipedia — File:Bank of Abyssinia.png',
  },
  {
    provider: 'mtn_momo',
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/5c/MTN_logo.svg',
    filename: 'mtn_momo.svg',
    source: 'Wikimedia Commons — File:MTN logo.svg',
  },
  {
    provider: 'cbe_birr',
    url: 'https://upload.wikimedia.org/wikipedia/commons/d/d6/LOGO_OF_COMMERCIAL_BANK_OF_ETHIOPIA_%28BAANKII_DALDALA_ITIYOOPHIYAA%29.jpg',
    filename: 'cbe_birr.jpg',
    source: 'Wikimedia Commons — CBE logo (used for CBE Birr rail)',
  },
  {
    provider: 'opay',
    url: 'https://www.opayweb.com/favicon.png',
    filename: 'opay.png',
    source: 'OPay official website favicon (opayweb.com) — replace with brand kit asset',
  },
  {
    provider: 'palmpay',
    url: 'https://www.palmpay.com/favicon.ico',
    filename: 'palmpay.ico',
    source: 'PalmPay official website favicon (palmpay.com) — replace with brand kit asset',
    postConvert: 'palmpay.png',
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function downloadOne({ provider, url, filename, source, postConvert }) {
  const dest = path.join(OUT, filename);
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(2000 * attempt);
    res = await fetch(url, {
      headers: { 'User-Agent': 'HakaLive/1.0 (payout logo fetch)' },
    });
    if (res.ok) break;
    if (res.status !== 429) break;
  }
  if (!res.ok) {
    throw new Error(`${provider}: HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);

  if (postConvert) {
    const outPng = path.join(OUT, postConvert);
    try {
      execSync(`convert '${dest}[4]' -resize 128x128 '${outPng}'`, { stdio: 'pipe' });
      fs.unlinkSync(dest);
      console.log(`✓ ${provider} -> ${postConvert} (${source}; converted from ICO)`);
    } catch {
      execSync(`convert '${dest}' -resize 128x128 '${outPng}'`, { stdio: 'pipe' });
      fs.unlinkSync(dest);
      console.log(`✓ ${provider} -> ${postConvert} (${source}; converted from ICO)`);
    }
    return;
  }

  console.log(`✓ ${provider} -> ${filename} (${source})`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const failed = [];
  for (const item of DOWNLOADS) {
    try {
      await downloadOne(item);
    } catch (e) {
      failed.push({ ...item, error: String(e) });
      console.warn(`✗ ${item.provider}: ${e.message}`);
    }
    await sleep(1200);
  }

  const ok = DOWNLOADS.filter((d) => !failed.find((f) => f.provider === d.provider));
  const attribution = ok.map(
    (d) => `- **${d.provider}**: ${d.source}\n  ${d.url}`,
  ).join('\n');
  const failNote =
    failed.length > 0
      ? `\n\n## Failed this run\n\n${failed.map((f) => `- **${f.provider}**: ${f.error}`).join('\n')}\n`
      : '';

  fs.writeFileSync(
    path.join(__dirname, '../assets/payment-methods/LOGO_ATTRIBUTION.md'),
    `# Payout method logo sources\n\nFetched by \`scripts/fetch-payout-brand-logos.mjs\`. Trademarks belong to their owners.\n\n${attribution}${failNote}\n\n## Still placeholder\n\nbKash/Nagad/etc. missing above, plus: payshap, whish_lbp_usd, local_office_*, bank_* generic transfer icon.\n`,
  );
  console.log('\nWrote LOGO_ATTRIBUTION.md');
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

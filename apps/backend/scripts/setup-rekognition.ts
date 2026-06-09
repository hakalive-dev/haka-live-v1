/**
 * One-time (or idempotent) setup for AWS Rekognition face collection used by Haka face verification.
 *
 * Prerequisites:
 *   - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY in environment (or .env loaded by your shell)
 *   - REKOGNITION_FACE_COLLECTION_ID (default: haka-live-faces)
 *   - REKOGNITION_REGION or AWS_S3_REGION_NAME (e.g. eu-west-1)
 *
 * Run from apps/backend:
 *   npx ts-node scripts/setup-rekognition.ts
 *   npx ts-node scripts/setup-rekognition.ts --check
 *
 * Docker dev:
 *   docker compose -f docker-compose.dev.yml exec backend npx ts-node scripts/setup-rekognition.ts
 */

import {
  CreateCollectionCommand,
  DescribeCollectionCommand,
  ListCollectionsCommand,
  RekognitionClient,
} from '@aws-sdk/client-rekognition';

const collectionId =
  process.env.REKOGNITION_FACE_COLLECTION_ID?.trim() || 'haka-live-faces';
const region =
  process.env.REKOGNITION_REGION?.trim() ||
  process.env.AWS_S3_REGION_NAME?.trim() ||
  'eu-west-1';

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

function fail(msg: string): never {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

async function main() {
  const checkOnly = process.argv.includes('--check');

  if (!accessKeyId || !secretAccessKey) {
    fail(
      'Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY. Add them to your root .env (docker) or export before running.',
    );
  }

  const client = new RekognitionClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  console.log(`Region:     ${region}`);
  console.log(`Collection: ${collectionId}`);
  console.log(`Mode:       ${checkOnly ? 'check' : 'create-if-missing'}\n`);

  try {
    const described = await client.send(
      new DescribeCollectionCommand({ CollectionId: collectionId }),
    );
    console.log('✅ Collection exists.');
    console.log(`   Face count: ${described.FaceCount ?? 0}`);
    console.log(`   ARN:        ${described.CollectionARN ?? '—'}`);
    return;
  } catch (err: unknown) {
    const name =
      err && typeof err === 'object' && 'name' in err
        ? String((err as { name: string }).name)
        : '';
    if (name !== 'ResourceNotFoundException') {
      throw err;
    }
  }

  if (checkOnly) {
    fail(
      `Collection "${collectionId}" not found in ${region}. Run without --check to create it.`,
    );
  }

  const existing = await client.send(new ListCollectionsCommand({ MaxResults: 100 }));
  if (existing.CollectionIds?.includes(collectionId)) {
    console.log('✅ Collection already listed (describe may be eventual).');
    return;
  }

  await client.send(new CreateCollectionCommand({ CollectionId: collectionId }));
  console.log(`✅ Created collection "${collectionId}" in ${region}.`);
  console.log('\nNext: set the same values on Render/production backend env.');
}

main().catch((err: unknown) => {
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name: string }).name)
      : '';
  if (name === 'UnrecognizedClientException' || name === 'InvalidClientTokenId') {
    fail(
      'Invalid AWS credentials. Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env ' +
        '(no quotes/spaces, active IAM user with Rekognition permissions).',
    );
  }
  console.error(err);
  process.exit(1);
});

import {
  RekognitionClient,
  type RekognitionClientConfig,
} from '@aws-sdk/client-rekognition';
import { env } from './env';

/** True when IAM credentials and collection id are set (face verification can run). */
export function isRekognitionConfigured(): boolean {
  return Boolean(
    env.AWS_ACCESS_KEY_ID &&
      env.AWS_SECRET_ACCESS_KEY &&
      env.REKOGNITION_FACE_COLLECTION_ID,
  );
}

/** AWS region for Rekognition API calls (must match where the collection was created). */
export function getRekognitionRegion(): string {
  return (
    env.REKOGNITION_REGION ??
    env.AWS_S3_REGION_NAME ??
    'eu-west-1'
  );
}

let cachedClient: RekognitionClient | null = null;

export function getRekognitionClient(): RekognitionClient {
  if (!cachedClient) {
    const config: RekognitionClientConfig = {
      region: getRekognitionRegion(),
    };
    if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      };
    }
    cachedClient = new RekognitionClient(config);
  }
  return cachedClient;
}

export function getFaceCollectionId(): string {
  return env.REKOGNITION_FACE_COLLECTION_ID ?? '';
}

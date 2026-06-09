import {
  CompareFacesCommand,
  DetectFacesCommand,
  DeleteFacesCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  type FaceDetail,
} from '@aws-sdk/client-rekognition';
import {
  getFaceCollectionId,
  getRekognitionClient,
  isRekognitionConfigured,
} from '../../config/rekognition';
import { AppError } from '../../middleware/error.middleware';
import { FACE_MIN_CONFIDENCE, FACE_MIN_SIMILARITY } from './face-verification.constants';

const FETCH_IMAGE_TIMEOUT_MS = 30_000;

export async function fetchImageBytes(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_IMAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new AppError(`Failed to fetch verification image (${res.status})`, 400);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AppError('Timed out loading verification image', 504);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function pickLargestFace(faces: FaceDetail[]): FaceDetail | null {
  if (!faces.length) return null;
  return faces.reduce((best, face) => {
    const bb = face.BoundingBox;
    const area = (bb?.Width ?? 0) * (bb?.Height ?? 0);
    const bestBb = best.BoundingBox;
    const bestArea = (bestBb?.Width ?? 0) * (bestBb?.Height ?? 0);
    return area > bestArea ? face : best;
  });
}

export async function assertSingleFace(imageBytes: Buffer): Promise<void> {
  if (!isRekognitionConfigured()) {
    throw new AppError('Face verification service is not configured', 503);
  }

  const client = getRekognitionClient();
  const result = await client.send(
    new DetectFacesCommand({
      Image: { Bytes: imageBytes },
      Attributes: ['DEFAULT'],
    }),
  );

  const faces = result.FaceDetails ?? [];
  if (faces.length === 0) {
    throw new AppError('No face detected in image', 400);
  }
  if (faces.length > 1) {
    throw new AppError('Multiple faces detected — only one person allowed', 400);
  }

  const face = pickLargestFace(faces);
  const confidence = face?.Confidence ?? 0;
  if (confidence < FACE_MIN_CONFIDENCE) {
    throw new AppError('Face not clear enough — improve lighting and try again', 400);
  }
}

export async function assertSamePerson(
  sourceBytes: Buffer,
  targetBytes: Buffer,
): Promise<number> {
  if (!isRekognitionConfigured()) {
    throw new AppError('Face verification service is not configured', 503);
  }

  const client = getRekognitionClient();
  const result = await client.send(
    new CompareFacesCommand({
      SourceImage: { Bytes: sourceBytes },
      TargetImage: { Bytes: targetBytes },
      SimilarityThreshold: FACE_MIN_SIMILARITY,
    }),
  );

  const matches = result.FaceMatches ?? [];
  const best = matches[0]?.Similarity ?? 0;
  if (best < FACE_MIN_SIMILARITY) {
    throw new AppError('Faces do not match across steps — please retry verification', 400);
  }
  return best;
}

export async function validateSessionFrames(
  frameUrls: Record<string, string>,
  orderedKeys: string[],
): Promise<{ referenceUrl: string; similarities: Record<string, number> }> {
  const missing = orderedKeys.filter((k) => !frameUrls[k]?.trim());
  if (missing.length) {
    throw new AppError(`Missing frames: ${missing.join(', ')}`, 400);
  }

  const bytesEntries = await Promise.all(
    orderedKeys.map(async (key) => {
      const bytes = await fetchImageBytes(frameUrls[key]);
      await assertSingleFace(bytes);
      return [key, bytes] as const;
    }),
  );
  const bytesByKey = Object.fromEntries(bytesEntries) as Record<string, Buffer>;

  const referenceKey = orderedKeys[0];
  const referenceBytes = bytesByKey[referenceKey];
  const compareResults = await Promise.all(
    orderedKeys.slice(1).map(async (key) => {
      const similarity = await assertSamePerson(referenceBytes, bytesByKey[key]);
      return [key, similarity] as const;
    }),
  );
  const similarities = Object.fromEntries(compareResults) as Record<string, number>;

  return { referenceUrl: frameUrls[referenceKey], similarities };
}

export async function indexUserFace(
  userId: string,
  imageUrl: string,
): Promise<string> {
  if (!isRekognitionConfigured()) {
    throw new AppError('Face verification service is not configured', 503);
  }

  const imageBytes = await fetchImageBytes(imageUrl);
  await assertSingleFace(imageBytes);

  const client = getRekognitionClient();
  const collectionId = getFaceCollectionId();

  const search = await client.send(
    new SearchFacesByImageCommand({
      CollectionId: collectionId,
      Image: { Bytes: imageBytes },
      FaceMatchThreshold: FACE_MIN_SIMILARITY,
      MaxFaces: 3,
    }),
  );

  for (const match of search.FaceMatches ?? []) {
    const externalId = match.Face?.ExternalImageId;
    if (externalId && externalId !== userId) {
      throw new AppError('This face is already registered to another account', 409);
    }
  }

  const indexed = await client.send(
    new IndexFacesCommand({
      CollectionId: collectionId,
      Image: { Bytes: imageBytes },
      ExternalImageId: userId,
      MaxFaces: 1,
    }),
  );

  const faceId = indexed.FaceRecords?.[0]?.Face?.FaceId;
  if (!faceId) {
    throw new AppError('Failed to enroll face in collection', 500);
  }
  return faceId;
}

/** Remove enrolled face from Rekognition collection (idempotent). */
export async function deleteUserFace(faceId: string): Promise<void> {
  const trimmed = faceId?.trim();
  if (!trimmed || !isRekognitionConfigured()) return;

  const client = getRekognitionClient();
  const collectionId = getFaceCollectionId();
  try {
    await client.send(
      new DeleteFacesCommand({
        CollectionId: collectionId,
        FaceIds: [trimmed],
      }),
    );
  } catch {
    /* face may already be deleted */
  }
}

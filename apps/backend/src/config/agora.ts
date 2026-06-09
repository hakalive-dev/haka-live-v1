import { env } from './env';

export const agoraConfig = {
  appId: env.AGORA_APP_ID ?? '',
  appCertificate: env.AGORA_APP_CERTIFICATE ?? '',
};

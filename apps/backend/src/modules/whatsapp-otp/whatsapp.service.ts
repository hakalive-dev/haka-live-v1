import { env } from '../../config/env';
import { AppError } from '../../middleware/error.middleware';

/**
 * Low-level Meta WhatsApp Cloud API client — sends a single OTP via the approved
 * AUTHENTICATION template (`haka_otp`, copy-code button). No SMS fallback.
 *
 * Setup (one-time, outside the repo):
 *  - Business Meta App → WhatsApp product → verified WABA
 *  - WHATSAPP_PHONE_NUMBER_ID + a PERMANENT System User WHATSAPP_ACCESS_TOKEN
 *  - approved AUTHENTICATION template named WHATSAPP_TEMPLATE_NAME
 */

export function isWhatsAppConfigured(): boolean {
  return Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN);
}

interface MetaErrorBody {
  error?: { message?: string; code?: number; error_data?: { details?: string } };
}

/**
 * Send a 6-digit OTP to `phone` (E.164, with or without leading +).
 * The code is passed twice — once in the BODY parameter, once in the copy-code
 * BUTTON parameter — as required by Meta for AUTHENTICATION templates.
 * Throws AppError on missing config or non-2xx Meta response.
 */
export async function sendOtp(phone: string, code: string): Promise<void> {
  if (!isWhatsAppConfigured()) {
    throw new AppError('WhatsApp OTP is not configured', 503);
  }

  // Meta expects E.164 without the leading '+'.
  const to = phone.replace(/\D/g, '');

  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: env.WHATSAPP_TEMPLATE_NAME,
      language: { code: env.WHATSAPP_TEMPLATE_LANG },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: code }],
        },
      ],
    },
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[whatsapp] network error sending OTP:', err);
    throw new AppError('Failed to send WhatsApp message. Please try again.', 502);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as MetaErrorBody;
    const metaMsg = body.error?.message ?? `HTTP ${res.status}`;
    const metaCode = body.error?.code;
    console.error('[whatsapp] Meta API error sending OTP:', {
      status: res.status,
      code: metaCode,
      message: metaMsg,
      details: body.error?.error_data?.details,
    });
    throw new AppError('Could not deliver the WhatsApp code. Please try again.', 502);
  }
}

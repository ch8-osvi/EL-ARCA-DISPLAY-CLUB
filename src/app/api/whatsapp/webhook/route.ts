import { NextRequest, NextResponse } from 'next/server';
import { processWhatsAppAiMessage, sendWhatsAppMessage, normalizePhoneNumber } from '@/lib/whatsapp/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Set of recently processed message IDs to prevent re-delivery duplicates
const processedMessageIds = new Set<string>();

/**
 * GET /api/whatsapp/webhook
 * Healthcheck & Meta Webhook verification handshake
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || 'el_arca_whatsapp_secret_2026';

  // Meta Cloud API handshake
  if (mode === 'subscribe' && token === expectedToken) {
    console.log('[WhatsApp Webhook] Meta Verification handshake successful!');
    return new Response(challenge, { status: 200 });
  }

  // Healthcheck for Whapi or browser verification
  return NextResponse.json({
    status: 'online',
    service: 'El Arca Display Club - WhatsApp AI Bot',
    gateway: 'Whapi.cloud & Meta Cloud API Ready',
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/whatsapp/webhook
 * Handles incoming WhatsApp messages from both Whapi.cloud and Meta Cloud API
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // =========================================================================
    // CASE 1: WHAPI.CLOUD GATEWAY (Independent, QR-based, zero Meta ban)
    // =========================================================================
    const rawWhapiMessages: any[] = Array.isArray(body.messages)
      ? body.messages
      : body.message
      ? [body.message]
      : [];

    if (rawWhapiMessages.length > 0) {
      for (const msg of rawWhapiMessages) {
        // CRITICAL: Ignore messages sent by the bot itself or from the connected phone
        if (msg.from_me === true) {
          continue;
        }

        const messageId = msg.id;
        if (messageId && processedMessageIds.has(messageId)) {
          continue;
        }
        if (messageId) {
          processedMessageIds.add(messageId);
          if (processedMessageIds.size > 2000) processedMessageIds.clear();
        }

        // Extract text body
        const userText =
          msg.text?.body ||
          (typeof msg.body === 'string' ? msg.body : '') ||
          msg.caption ||
          '';

        const chatId = msg.chat_id || msg.from || '';
        const senderPhone = normalizePhoneNumber(chatId);

        if (userText.trim() && senderPhone) {
          console.log(`[Whapi Inbound] From: ${senderPhone} | Text: "${userText}"`);

          // Process through Gemini with Admin/Client security isolation
          const aiReply = await processWhatsAppAiMessage(userText, senderPhone);

          // Reply back via Whapi Gateway
          await sendWhatsAppMessage(chatId || senderPhone, aiReply);
        }
      }

      return NextResponse.json({ status: 'whapi_processed' }, { status: 200 });
    }

    // =========================================================================
    // CASE 2: META CLOUD API (Official WhatsApp Business Webhook)
    // =========================================================================
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0]?.value;
      const message = change?.messages?.[0];

      if (!message) {
        return NextResponse.json({ status: 'no_message' }, { status: 200 });
      }

      const messageId = message.id;
      if (messageId && processedMessageIds.has(messageId)) {
        return NextResponse.json({ status: 'already_processed' }, { status: 200 });
      }

      if (messageId) {
        processedMessageIds.add(messageId);
        if (processedMessageIds.size > 2000) processedMessageIds.clear();
      }

      if (message.type === 'text') {
        const senderPhone = normalizePhoneNumber(message.from);
        const userText = message.text?.body || '';

        if (userText.trim() && senderPhone) {
          console.log(`[Meta Inbound] From: ${senderPhone} | Text: "${userText}"`);

          const aiResponse = await processWhatsAppAiMessage(userText, senderPhone);
          await sendWhatsAppMessage(senderPhone, aiResponse);
        }
      }

      return NextResponse.json({ status: 'meta_processed' }, { status: 200 });
    }

    return NextResponse.json({ status: 'ignored_payload' }, { status: 200 });
  } catch (err) {
    console.error('[WhatsApp Webhook Error]', err);
    return NextResponse.json({ status: 'error_logged' }, { status: 200 });
  }
}

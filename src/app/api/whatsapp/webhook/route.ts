import { NextRequest, NextResponse } from 'next/server';
import { processWhatsAppAiMessage, sendWhatsAppMessage, normalizePhoneNumber } from '@/lib/whatsapp/service';

export const dynamic = 'force-dynamic';

// Set of recently processed message IDs to prevent Meta re-delivery duplicates
const processedMessageIds = new Set<string>();

/**
 * GET /api/whatsapp/webhook
 * Meta Webhook verification handshake
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || 'el_arca_whatsapp_secret_2026';

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('[WhatsApp Webhook] Verification successful!');
    return new Response(challenge, { status: 200 });
  }

  console.warn('[WhatsApp Webhook] Verification failed. Token mismatch or bad mode.');
  return new Response('Verification failed', { status: 403 });
}

/**
 * POST /api/whatsapp/webhook
 * Handles incoming WhatsApp messages from Meta Cloud API
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Check if this is an event from WhatsApp Business API
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'not_whatsapp_event' }, { status: 200 });
    }

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    // If it's a delivery status, read receipt or empty, simply acknowledge 200 OK
    if (!message) {
      return NextResponse.json({ status: 'no_message' }, { status: 200 });
    }

    const messageId = message.id;
    if (messageId && processedMessageIds.has(messageId)) {
      // Already processed this message
      return NextResponse.json({ status: 'already_processed' }, { status: 200 });
    }

    if (messageId) {
      processedMessageIds.add(messageId);
      // Clean old IDs periodically
      if (processedMessageIds.size > 2000) {
        processedMessageIds.clear();
      }
    }

    // Only handle text messages for now
    if (message.type === 'text') {
      const senderPhone = normalizePhoneNumber(message.from);
      const userText = message.text?.body || '';

      if (userText.trim() && senderPhone) {
        console.log(`[WhatsApp Inbound] From: ${senderPhone} | Message: "${userText}"`);

        // Process message through Gemini AI with security isolation
        const aiResponse = await processWhatsAppAiMessage(userText, senderPhone);

        // Send back the reply via WhatsApp Cloud API
        await sendWhatsAppMessage(senderPhone, aiResponse);
      }
    }

    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (err) {
    console.error('[WhatsApp Webhook Error]', err);
    // Always return 200 to Meta so it does not retry endlessly on application errors
    return NextResponse.json({ status: 'error_logged' }, { status: 200 });
  }
}

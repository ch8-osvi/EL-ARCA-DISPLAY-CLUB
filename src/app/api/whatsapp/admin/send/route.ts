import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppMessage, normalizePhoneNumber } from '@/lib/whatsapp/service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, text } = body || {};

    const cleanTo = normalizePhoneNumber(to || '');
    if (!cleanTo || !text || !text.trim()) {
      return NextResponse.json(
        { error: 'Parámetros to (teléfono) y text (mensaje) requeridos' },
        { status: 400 }
      );
    }

    const success = await sendWhatsAppMessage(cleanTo, text.trim());
    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Mensaje enviado exitosamente vía WhatsApp',
        to: cleanTo,
      });
    } else {
      return NextResponse.json(
        { error: 'El servicio de WhatsApp no pudo entregar el mensaje. Verifica que el bot esté conectado.' },
        { status: 502 }
      );
    }
  } catch (err: any) {
    console.error('[WhatsApp Admin Direct Send Error]', err);
    return NextResponse.json({ error: err.message || 'Error al enviar mensaje' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import { getWhatsAppConfig } from '@/lib/models/WhatsAppConfig';
import { normalizePhoneNumber } from '@/lib/whatsapp/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectToDatabase();
    const config = await getWhatsAppConfig();
    return NextResponse.json({
      status: 'ok',
      adminPhones: config.adminPhones || [],
      blacklistedPhones: config.blacklistedPhones || [],
      botPhone: config.botPhone || '',
      botStatus: config.botStatus || 'online',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const body = await req.json();
    const { action, phone } = body || {};

    const cleanPhone = normalizePhoneNumber(phone || '');
    if (!cleanPhone && (action === 'add_admin' || action === 'add_blacklist')) {
      return NextResponse.json({ error: 'Número de teléfono inválido' }, { status: 400 });
    }

    const config = await getWhatsAppConfig();

    if (action === 'add_admin') {
      if (!config.adminPhones.includes(cleanPhone)) {
        config.adminPhones.push(cleanPhone);
      }
    } else if (action === 'remove_admin') {
      config.adminPhones = config.adminPhones.filter((p) => normalizePhoneNumber(p) !== cleanPhone);
      // Garantizar que el número del dueño nunca se elimine por error
      if (!config.adminPhones.includes('5352031972')) {
        config.adminPhones.push('5352031972');
      }
    } else if (action === 'add_blacklist') {
      if (!config.blacklistedPhones.includes(cleanPhone)) {
        config.blacklistedPhones.push(cleanPhone);
      }
    } else if (action === 'remove_blacklist') {
      config.blacklistedPhones = config.blacklistedPhones.filter((p) => normalizePhoneNumber(p) !== cleanPhone);
    } else if (action === 'set_bot_phone') {
      config.botPhone = cleanPhone;
      config.botStatus = 'online';
    } else {
      return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
    }

    await config.save();

    return NextResponse.json({
      status: 'success',
      adminPhones: config.adminPhones,
      blacklistedPhones: config.blacklistedPhones,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import React from 'react';

export interface TicketItem {
  productId: string;
  marca: string;
  modelo: string;
  calidad: string;
  qty: number;
  precioUSD: number;
  subtotalUSD: number;
}

export interface TicketData {
  orderNumber: string;
  clientName?: string;
  items: TicketItem[];
  currency: 'USD' | 'CUP';
  exchangeRate: number;
  subtotalUSD: number;
  totalUSD: number;
  totalCUP: number;
  paid: boolean;
  notes?: string;
  createdAt: string | Date;
}

export interface RefundItem {
  marca: string;
  modelo: string;
  calidad: string;
  qty: number;
  refundUSD: number;
  refundCUP: number;
}

export interface RefundTicketData {
  orderNumber: string;
  clientName?: string;
  items: RefundItem[];
  reason: string;
  exchangeRate: number;
  totalRefundUSD: number;
  totalRefundCUP: number;
  createdAt: string | Date;
}

/** Known standard Bluetooth Thermal Printer Service UUIDs */
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000e0ff-3c17-d293-8e48-14fe2e4da212',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000feea-0000-1000-8000-00805f9b34fb',
  '000018f1-0000-1000-8000-00805f9b34fb',
  '00001101-0000-1000-8000-00805f9b34fb', // Serial Port Profile
];

/**
 * Builds raw ESC/POS byte sequence for 58mm / 80mm thermal printers
 */
export function buildEscPosBytes(data: TicketData, copies = 1): Uint8Array {
  const encoder = new TextEncoder();
  const bytes: number[] = [];

  const add = (arr: number[]) => bytes.push(...arr);
  const text = (str: string) => {
    const sanitized = str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E\n\r]/g, ' ');
    const encoded = encoder.encode(sanitized);
    for (let i = 0; i < encoded.length; i++) {
      bytes.push(encoded[i]);
    }
  };

  const line = (str: string) => text(str + '\n');
  const divider = () => line('--------------------------------');

  const dateFormatted = new Date(data.createdAt).toLocaleString('es-CU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  for (let c = 0; c < copies; c++) {
    add([0x1b, 0x40]); // ESC @
    add([0x1b, 0x61, 0x01]); // Align Center
    add([0x1b, 0x45, 0x01]); // Bold ON
    add([0x1d, 0x21, 0x11]); // Double width & height
    line('EL ARCA');
    line('DISPLAY CLUB');
    add([0x1d, 0x21, 0x00]); // Normal size
    add([0x1b, 0x45, 0x00]); // Bold OFF
    line('Venta de Repuestos & Displays');
    line('WhatsApp: +53 5865-9856');
    divider();

    add([0x1b, 0x61, 0x00]); // Align Left
    line(`ORDEN:   #${data.orderNumber}`);
    line(`FECHA:   ${dateFormatted}`);
    line(`CLIENTE: ${data.clientName || 'Consumidor Final'}`);
    line(`ESTADO:  ${data.paid ? 'PAGADO [OK]' : 'PENDIENTE'}`);
    divider();

    line('ARTICULO          CANT     TOTAL');
    divider();

    data.items.forEach((item) => {
      add([0x1b, 0x45, 0x01]);
      line(`${item.marca} ${item.modelo}`);
      add([0x1b, 0x45, 0x00]);

      const cal = item.calidad.substring(0, 12).padEnd(12, ' ');
      const qtyStr = `x${item.qty}`.padStart(4, ' ');
      const subtotal = `$${(item.precioUSD * item.qty).toFixed(2)}`.padStart(12, ' ');
      line(`${cal}  ${qtyStr}  ${subtotal}`);
    });

    divider();

    line(`TASA DE CAMBIO: 1 USD = ${data.exchangeRate} CUP`);
    add([0x1b, 0x45, 0x01]);
    add([0x1d, 0x21, 0x01]);
    line(`TOTAL USD: $${data.totalUSD.toFixed(2)} USD`);
    line(`TOTAL CUP: ${data.totalCUP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CUP`);
    add([0x1d, 0x21, 0x00]);
    add([0x1b, 0x45, 0x00]);

    if (data.notes) {
      divider();
      line(`OBS: ${data.notes}`);
    }

    divider();
    add([0x1b, 0x61, 0x01]);
    line('Gracias por su preferencia!');
    line('Revise su mercancia al recibir.');
    line('*** EL ARCA DISPLAY CLUB ***');
    line('\n\n\n\n');
    add([0x1d, 0x56, 0x41, 0x10]);
  }

  return new Uint8Array(bytes);
}

/**
 * Builds raw ESC/POS byte sequence for Refund Receipt
 */
export function buildRefundEscPosBytes(data: RefundTicketData): Uint8Array {
  const encoder = new TextEncoder();
  const bytes: number[] = [];

  const add = (arr: number[]) => bytes.push(...arr);
  const text = (str: string) => {
    const sanitized = str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E\n\r]/g, ' ');
    const encoded = encoder.encode(sanitized);
    for (let i = 0; i < encoded.length; i++) {
      bytes.push(encoded[i]);
    }
  };

  const line = (str: string) => text(str + '\n');
  const divider = () => line('--------------------------------');

  const dateFormatted = new Date(data.createdAt).toLocaleString('es-CU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  add([0x1b, 0x40]);
  add([0x1b, 0x61, 0x01]);
  add([0x1b, 0x45, 0x01]);
  add([0x1d, 0x21, 0x11]);
  line('COMPROBANTE');
  line('DE DEVOLUCION');
  add([0x1d, 0x21, 0x00]);
  add([0x1b, 0x45, 0x00]);
  line('EL ARCA DISPLAY CLUB');
  line('WhatsApp: +53 5865-9856');
  divider();

  add([0x1b, 0x61, 0x00]);
  line(`ORDEN REF: #${data.orderNumber}`);
  line(`FECHA DEV: ${dateFormatted}`);
  line(`CLIENTE:   ${data.clientName || 'Consumidor Final'}`);
  line(`MOTIVO:    ${data.reason}`);
  divider();

  line('REPUESTO DEVUELTO  CANT  REEMBOLSO');
  divider();

  data.items.forEach((item) => {
    add([0x1b, 0x45, 0x01]);
    line(`${item.marca} ${item.modelo}`);
    add([0x1b, 0x45, 0x00]);
    const cal = item.calidad.substring(0, 12).padEnd(12, ' ');
    const qtyStr = `x${item.qty}`.padStart(4, ' ');
    const refUSD = `$${item.refundUSD.toFixed(2)}`.padStart(12, ' ');
    line(`${cal}  ${qtyStr}  ${refUSD}`);
  });

  divider();

  add([0x1b, 0x45, 0x01]);
  line(`REEMBOLSO USD: $${data.totalRefundUSD.toFixed(2)} USD`);
  line(`REEMBOLSO CUP: ${data.totalRefundCUP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CUP`);
  add([0x1b, 0x45, 0x00]);

  divider();
  add([0x1b, 0x61, 0x01]);
  line('Mercancia reincorporada a stock.');
  line('Firma Cliente / Tecnico');
  line('\n\n___________________________');
  line('\n\n\n\n');
  add([0x1d, 0x56, 0x41, 0x10]);

  return new Uint8Array(bytes);
}

/**
 * Generic helper to send ESC/POS bytes via Bluetooth
 */
async function sendBytesViaBluetooth(rawBytes: Uint8Array): Promise<{ success: boolean; error?: string }> {
  if (typeof navigator === 'undefined' || !(navigator as any).bluetooth) {
    return {
      success: false,
      error: 'Web Bluetooth no soportado en este navegador. Usa Chrome o Edge sobre HTTPS.',
    };
  }

  try {
    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES,
    });

    if (!device || !device.gatt) {
      return { success: false, error: 'No se seleccionó dispositivo Bluetooth.' };
    }

    const server = await device.gatt.connect();
    let targetChar: any = null;

    for (const serviceUuid of PRINTER_SERVICES) {
      try {
        const service = await server.getPrimaryService(serviceUuid);
        const characteristics = await service.getCharacteristics();

        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            targetChar = char;
            break;
          }
        }
        if (targetChar) break;
      } catch {}
    }

    if (!targetChar) {
      try {
        const services = await server.getPrimaryServices();
        for (const service of services) {
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              targetChar = char;
              break;
            }
          }
          if (targetChar) break;
        }
      } catch {}
    }

    if (!targetChar) {
      return {
        success: false,
        error: 'No se encontró canal de escritura en la impresora Bluetooth seleccionada.',
      };
    }

    const CHUNK_SIZE = 128;
    for (let i = 0; i < rawBytes.length; i += CHUNK_SIZE) {
      const chunk = rawBytes.slice(i, i + CHUNK_SIZE);
      if (targetChar.writeValueWithoutResponse) {
        await targetChar.writeValueWithoutResponse(chunk);
      } else {
        await targetChar.writeValue(chunk);
      }
      await new Promise((r) => setTimeout(r, 40));
    }

    return { success: true };
  } catch (err: any) {
    if (err.name === 'NotFoundError') {
      return { success: false, error: 'Selección de impresora cancelada.' };
    }
    console.error('Bluetooth error:', err);
    return { success: false, error: err.message || 'Error al imprimir por Bluetooth.' };
  }
}

/**
 * Generic helper to send ESC/POS bytes via USB/Serial
 */
async function sendBytesViaUsb(rawBytes: Uint8Array): Promise<{ success: boolean; error?: string }> {
  if (typeof navigator === 'undefined' || !(navigator as any).serial) {
    return {
      success: false,
      error: 'Web Serial / USB no soportado en este navegador. Usa Chrome o Edge.',
    };
  }

  try {
    const port = await (navigator as any).serial.requestPort();
    await port.open({ baudRate: 9600 });
    const writer = port.writable.getWriter();
    await writer.write(rawBytes);
    writer.releaseLock();
    await port.close();
    return { success: true };
  } catch (err: any) {
    if (err.name === 'NotFoundError') {
      return { success: false, error: 'Selección de puerto USB cancelada.' };
    }
    console.error('USB error:', err);
    return { success: false, error: err.message || 'Error al imprimir por USB.' };
  }
}

export async function printViaBluetooth(data: TicketData, copies = 1) {
  const rawBytes = buildEscPosBytes(data, copies);
  return sendBytesViaBluetooth(rawBytes);
}

export async function printViaUsb(data: TicketData, copies = 1) {
  const rawBytes = buildEscPosBytes(data, copies);
  return sendBytesViaUsb(rawBytes);
}

export async function printRefundViaBluetooth(data: RefundTicketData) {
  const rawBytes = buildRefundEscPosBytes(data);
  return sendBytesViaBluetooth(rawBytes);
}

export async function printRefundViaUsb(data: RefundTicketData) {
  const rawBytes = buildRefundEscPosBytes(data);
  return sendBytesViaUsb(rawBytes);
}

export function printRefundTicket(data: RefundTicketData) {
  const printWindow = window.open('', '_blank', 'width=380,height=600');
  if (!printWindow) {
    alert('Permita las ventanas emergentes para imprimir el comprobante.');
    return;
  }

  const itemsHtml = data.items
    .map(
      (item) => `
      <div style="margin-bottom: 5px; font-size: 11px;">
        <div style="font-weight: bold;">${item.marca} ${item.modelo}</div>
        <div style="display: flex; justify-content: space-between; font-size: 10px;">
          <span style="width: 55%; color: #333;">${item.calidad}</span>
          <span style="width: 15%; text-align: center;">x${item.qty}</span>
          <span style="width: 30%; text-align: right; font-weight: bold; color: #b91c1c;">-$${item.refundUSD.toFixed(2)}</span>
        </div>
      </div>
    `
    )
    .join('');

  const dateFormatted = new Date(data.createdAt).toLocaleString('es-CU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Comprobante Devolución #${data.orderNumber}</title>
        <meta charset="utf-8" />
        <style>
          @page { size: auto; margin: 0mm; }
          body { margin: 0; padding: 8px; background: #fff; font-family: 'Courier New', Courier, monospace; font-size: 12px; }
        </style>
      </head>
      <body>
        <div style="width: 58mm; max-width: 100%; margin: 0 auto; text-align: left;">
          <div style="text-align: center; margin-bottom: 8px;">
            <div style="font-size: 14px; font-weight: bold;">COMPROBANTE DE DEVOLUCIÓN</div>
            <div style="font-size: 11px; margin-top: 2px;">EL ARCA DISPLAY CLUB</div>
            <div style="font-size: 10px;">WhatsApp: +53 5865-9856</div>
            <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
          </div>
          <div style="font-size: 11px; margin-bottom: 6px;">
            <div><strong>ORDEN REF:</strong> #${data.orderNumber}</div>
            <div><strong>FECHA:</strong> ${dateFormatted}</div>
            <div><strong>CLIENTE:</strong> ${data.clientName || 'Consumidor Final'}</div>
            <div><strong>MOTIVO:</strong> ${data.reason}</div>
            <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
          </div>
          <div style="font-weight: bold; font-size: 10px; margin-bottom: 4px; display: flex; justify-content: space-between;">
            <span>ARTÍCULO</span><span>CANT</span><span>REEMBOLSO</span>
          </div>
          <div style="border-bottom: 1px solid #000; margin-bottom: 4px;"></div>
          ${itemsHtml}
          <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
          <div style="font-size: 11px; line-height: 1.4;">
            <div><strong>TOTAL REEMBOLSADO USD:</strong> $${data.totalRefundUSD.toFixed(2)} USD</div>
            <div><strong>TOTAL REEMBOLSADO CUP:</strong> ${data.totalRefundCUP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CUP</div>
          </div>
          <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
          <div style="text-align: center; font-size: 9px; margin-top: 12px;">
            <div>Mercancía reincorporada al inventario.</div>
            <div style="margin-top: 20px;">___________________________</div>
            <div>Firma Cliente / Técnico</div>
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

export function printTicket(data: TicketData, copies = 1) {
  const printWindow = window.open('', '_blank', 'width=380,height=600');
  if (!printWindow) {
    alert('Permita las ventanas emergentes para imprimir el ticket.');
    return;
  }

  const itemsHtml = data.items
    .map(
      (item) => `
      <div style="margin-bottom: 5px; font-size: 11px;">
        <div style="font-weight: bold;">${item.marca} ${item.modelo}</div>
        <div style="display: flex; justify-content: space-between; font-size: 10px;">
          <span style="width: 55%; color: #333;">${item.calidad}</span>
          <span style="width: 15%; text-align: center;">x${item.qty}</span>
          <span style="width: 30%; text-align: right; font-weight: bold;">$${(item.precioUSD * item.qty).toFixed(2)}</span>
        </div>
      </div>
    `
    )
    .join('');

  const dateFormatted = new Date(data.createdAt).toLocaleString('es-CU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const singleTicketHtml = `
    <div style="font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.25; color: #000; background: #fff; width: 58mm; max-width: 100%; margin: 0 auto 20px auto; padding: 4px; page-break-after: always;">
      <div style="text-align: center; margin-bottom: 8px;">
        <div style="font-size: 15px; font-weight: bold; letter-spacing: 1px;">EL ARCA DISPLAY CLUB</div>
        <div style="font-size: 10px; margin-top: 2px;">Venta de Repuestos & Displays</div>
        <div style="font-size: 10px; margin-top: 1px;">WhatsApp: +53 5865-9856</div>
        <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
      </div>

      <div style="font-size: 11px; margin-bottom: 6px;">
        <div><strong>ORDEN:</strong> #${data.orderNumber}</div>
        <div><strong>FECHA:</strong> ${dateFormatted}</div>
        <div><strong>CLIENTE:</strong> ${data.clientName || 'Consumidor Final'}</div>
        <div><strong>ESTADO:</strong> ${data.paid ? 'PAGADO [OK]' : 'PENDIENTE'}</div>
        <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
      </div>

      <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 10px; margin-bottom: 4px;">
        <span style="width: 55%;">ARTICULO</span>
        <span style="width: 15%; text-align: center;">CANT</span>
        <span style="width: 30%; text-align: right;">TOTAL</span>
      </div>
      <div style="border-bottom: 1px solid #000; margin-bottom: 4px;"></div>

      ${itemsHtml}

      <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>

      <div style="font-size: 11px; line-height: 1.4;">
        <div style="display: flex; justify-content: space-between;">
          <span>TASA CUP:</span>
          <strong>1 USD = ${data.exchangeRate} CUP</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; margin-top: 3px;">
          <span>TOTAL USD:</span>
          <span>$${data.totalUSD.toFixed(2)} USD</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: bold;">
          <span>TOTAL CUP:</span>
          <span>${data.totalCUP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CUP</span>
        </div>
      </div>

      ${
        data.notes
          ? `
        <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
        <div style="font-size: 10px;"><strong>OBS:</strong> ${data.notes}</div>
      `
          : ''
      }

      <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
      <div style="text-align: center; font-size: 9px; margin-top: 6px;">
        <div>¡Gracias por su preferencia!</div>
        <div style="margin-top: 2px;">Revise su mercancía antes de retirarse.</div>
        <div style="margin-top: 2px; font-weight: bold;">*** EL ARCA DISPLAY CLUB ***</div>
      </div>
    </div>
  `;

  let fullHtml = '';
  for (let i = 0; i < copies; i++) {
    fullHtml += singleTicketHtml;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Ticket #${data.orderNumber}</title>
        <meta charset="utf-8" />
        <style>
          @page { size: auto; margin: 0mm; }
          body { margin: 0; padding: 8px; background: #fff; }
        </style>
      </head>
      <body>
        ${fullHtml}
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

export const TicketContent: React.FC<TicketData> = ({
  orderNumber,
  clientName,
  items,
  exchangeRate,
  totalUSD,
  totalCUP,
  paid,
  notes,
  createdAt,
}) => {
  const dateFormatted = new Date(createdAt).toLocaleString('es-CU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      id="thermal-ticket-print"
      style={{
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: '12px',
        lineHeight: '1.25',
        color: '#000',
        backgroundColor: '#fff',
        width: '58mm',
        maxWidth: '100%',
        margin: '0 auto',
        padding: '6px 4px',
        textAlign: 'left',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
        <div style={{ fontSize: '15px', fontWeight: 'bold', letterSpacing: '1px' }}>
          EL ARCA DISPLAY CLUB
        </div>
        <div style={{ fontSize: '10px', marginTop: '2px' }}>
          Venta de Repuestos & Displays
        </div>
        <div style={{ fontSize: '10px', marginTop: '1px' }}>
          WhatsApp: +53 5865-9856
        </div>
        <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />
      </div>

      <div style={{ fontSize: '11px', marginBottom: '6px' }}>
        <div><strong>ORDEN:</strong> #{orderNumber}</div>
        <div><strong>FECHA:</strong> {dateFormatted}</div>
        <div><strong>CLIENTE:</strong> {clientName || 'Consumidor Final'}</div>
        <div><strong>ESTADO:</strong> {paid ? 'PAGADO [OK]' : 'PENDIENTE'}</div>
        <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontWeight: 'bold',
          fontSize: '10px',
          marginBottom: '4px',
        }}
      >
        <span style={{ width: '55%' }}>ARTICULO</span>
        <span style={{ width: '15%', textAlign: 'center' }}>CANT</span>
        <span style={{ width: '30%', textAlign: 'right' }}>TOTAL</span>
      </div>
      <div style={{ borderBottom: '1px solid #000', marginBottom: '4px' }} />

      {items.map((item, idx) => (
        <div key={idx} style={{ marginBottom: '5px', fontSize: '11px' }}>
          <div style={{ fontWeight: 'bold' }}>
            {item.marca} {item.modelo}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
            <span style={{ width: '55%', color: '#333' }}>{item.calidad}</span>
            <span style={{ width: '15%', textAlign: 'center' }}>x{item.qty}</span>
            <span style={{ width: '30%', textAlign: 'right', fontWeight: 'bold' }}>
              ${(item.precioUSD * item.qty).toFixed(2)}
            </span>
          </div>
        </div>
      ))}

      <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

      <div style={{ fontSize: '11px', lineHeight: '1.4' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>TASA CUP:</span>
          <strong>1 USD = {exchangeRate} CUP</strong>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '13px',
            fontWeight: 'bold',
            marginTop: '3px',
          }}
        >
          <span>TOTAL USD:</span>
          <span>${totalUSD.toFixed(2)} USD</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '12px',
            fontWeight: 'bold',
          }}
        >
          <span>TOTAL CUP:</span>
          <span>{totalCUP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CUP</span>
        </div>
      </div>

      {notes && (
        <>
          <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />
          <div style={{ fontSize: '10px' }}>
            <strong>OBS:</strong> {notes}
          </div>
        </>
      )}

      <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />
      <div style={{ textAlign: 'center', fontSize: '9px', marginTop: '6px' }}>
        <div>¡Gracias por su preferencia!</div>
        <div style={{ marginTop: '2px' }}>Revise su mercancía antes de retirarse.</div>
        <div style={{ marginTop: '2px', fontWeight: 'bold' }}>*** EL ARCA DISPLAY CLUB ***</div>
      </div>
    </div>
  );
};

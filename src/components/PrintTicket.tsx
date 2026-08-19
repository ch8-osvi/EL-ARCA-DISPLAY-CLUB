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

/**
 * Pure text-based lightweight HTML thermal ticket generator (58mm / 80mm thermal printers compatible).
 * Uses pure CSS @media print with high contrast black/white typography, no heavy images or slow external assets.
 */
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
      {/* Header */}
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

      {/* Order Info */}
      <div style={{ fontSize: '11px', marginBottom: '6px' }}>
        <div><strong>ORDEN:</strong> #{orderNumber}</div>
        <div><strong>FECHA:</strong> {dateFormatted}</div>
        <div><strong>CLIENTE:</strong> {clientName || 'Consumidor Final'}</div>
        <div><strong>ESTADO:</strong> {paid ? 'PAGADO [OK]' : 'PENDIENTE'}</div>
        <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />
      </div>

      {/* Items Table Header */}
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

      {/* Item Rows */}
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

      {/* Totals */}
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

      {/* Footer */}
      <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />
      <div style={{ textAlign: 'center', fontSize: '9px', marginTop: '6px' }}>
        <div>¡Gracias por su preferencia!</div>
        <div style={{ marginTop: '2px' }}>Revise su mercancía antes de retirarse.</div>
        <div style={{ marginTop: '2px', fontWeight: 'bold' }}>*** EL ARCA DISPLAY CLUB ***</div>
      </div>
    </div>
  );
};

/**
 * Helper to trigger print directly without opening bloated popup windows.
 */
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
          @page {
            size: auto;
            margin: 0mm;
          }
          body {
            margin: 0;
            padding: 8px;
            background: #fff;
          }
        </style>
      </head>
      <body>
        ${fullHtml}
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() {
              window.close();
            }, 500);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

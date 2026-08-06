/**
 * Cetak nota ke printer POS-58 via jendela HTML sempit.
 * PDF 58mm di Chrome sering tampil sebagai garis putih di preview A4
 * (halaman PDF terlalu sempit vs kertas A4 default).
 */

export interface NotaPrintLineItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  note?: string | null;
}

export interface NotaPrintPayment {
  payment_date: string;
  method: string;
  amount: number;
}

export interface NotaPrintCharge {
  name: string;
  amount: number;
}

export interface NotaPrintData {
  store_name: string;
  store_address?: string;
  store_phone?: string;
  transaction_number: string;
  customer_name: string;
  payment_type: string;
  created_at_label: string;
  lineItems: NotaPrintLineItem[];
  customerCharges: NotaPrintCharge[];
  final_price: number;
  total_due: number;
  total_paid: number;
  remaining: number;
  dp_amount: number;
  status: string;
  payments: NotaPrintPayment[];
  money: (n: number) => string;
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReceiptHtml(data: NotaPrintData): string {
  const { money } = data;
  const items = data.lineItems
    .map((item) => {
      const note = item.note
        ? `<div class="muted">${esc(item.note)}</div>`
        : "";
      return `<div class="item">
        <div class="bold">${esc(item.product_name)}</div>
        ${note}
        <div class="row">
          <span>${item.quantity} x ${esc(money(item.unit_price))}</span>
          <span class="bold">${esc(money(item.line_total))}</span>
        </div>
      </div>`;
    })
    .join("");

  const charges =
    data.customerCharges.length > 0
      ? `<hr class="dash" /><div class="section">Biaya pembeli</div>${data.customerCharges
          .map(
            (c) =>
              `<div class="row"><span>${esc(c.name)}</span><span class="bold">${esc(money(c.amount))}</span></div>`,
          )
          .join("")}`
      : "";

  const payments =
    data.payments.length > 0
      ? `<hr class="dash" /><div class="section">Riwayat bayar</div>${data.payments
          .map(
            (p) =>
              `<div class="row"><span class="muted">${esc(p.payment_date)} — ${esc(p.method)}</span><span>${esc(money(p.amount))}</span></div>`,
          )
          .join("")}`
      : "";

  const dpRow =
    data.payment_type === "DP"
      ? `<div class="row"><span>DP Awal</span><span>${esc(money(data.dp_amount))}</span></div>`
      : "";

  const remainRow =
    data.remaining > 0
      ? `<div class="row"><span>Sisa Tagihan</span><span class="bold">${esc(money(data.remaining))}</span></div>`
      : data.payment_type !== "CASH"
        ? `<div class="center bold">*** LUNAS ***</div>`
        : "";

  const address = data.store_address
    ? `<div class="muted center">${esc(data.store_address)}</div>`
    : "";
  const phone = data.store_phone
    ? `<div class="muted center">Telp: ${esc(data.store_phone)}</div>`
    : "";

  return `<div id="receipt">
    <div class="bold center">${esc(data.store_name)}</div>
    ${address}
    ${phone}
    <hr class="dash" />
    <h1>NOTA PEMBAYARAN</h1>
    <div class="muted center">${esc(data.transaction_number)}</div>
    <hr class="dash" />
    <div>Tanggal: ${esc(data.created_at_label)}</div>
    <div>Pelanggan: <span class="bold">${esc(data.customer_name)}</span></div>
    <div>Tipe: ${data.payment_type === "CASH" ? "Cash (Lunas)" : "DP / Uang Muka"}</div>
    <hr class="dash" />
    <div class="section">Rincian produk</div>
    ${items}
    ${charges}
    <hr class="dash" />
    <div class="row"><span>Total Tagihan</span><span class="bold">${esc(money(data.total_due))}</span></div>
    ${dpRow}
    <div class="row"><span>Total Dibayar</span><span class="bold">${esc(money(data.total_paid))}</span></div>
    ${remainRow}
    ${payments}
    <hr class="dash" />
    <div class="center">Terima kasih!</div>
    <div class="muted center">${esc(data.status)}</div>
  </div>`;
}

const PRINT_STYLES = `
  @page { size: 58mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 58mm;
    max-width: 58mm;
    background: #fff;
    color: #000;
    font-family: "Courier New", Courier, monospace;
    font-size: 11px;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  #receipt {
    width: 54mm;
    max-width: 54mm;
    margin: 0 auto;
    padding: 2mm 1.5mm;
  }
  h1 {
    font-size: 13px;
    margin: 4px 0 2px;
    text-align: center;
    letter-spacing: 0.05em;
  }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .muted { font-size: 10px; }
  .section {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    margin: 2px 0 4px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    margin: 2px 0;
  }
  .item { margin-bottom: 6px; }
  .dash {
    border: none;
    border-top: 1px dashed #000;
    margin: 6px 0;
  }
`;

/** Buka jendela sempit lalu dialog cetak — cocok untuk POS-58 di Chrome. */
export function printNotaHtml(data: NotaPrintData): void {
  const win = window.open("", "_blank", "width=320,height=720");
  if (!win) {
    throw new Error("POPUP_BLOCKED");
  }

  const body = buildReceiptHtml(data);
  win.document.open();
  win.document.write(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=220, initial-scale=1" />
  <title>Nota ${esc(data.transaction_number)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  ${body}
  <script>
    window.onload = function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 300);
    };
  <\/script>
</body>
</html>`);
  win.document.close();
}

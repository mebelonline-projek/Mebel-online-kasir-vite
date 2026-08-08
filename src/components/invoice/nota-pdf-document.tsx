import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { InvoiceData } from "@/components/invoice/invoice-document";

/** 58mm roll ≈ 164.4pt; tinggi cukup untuk nota tipikal (wrap jika lebih panjang). */
const THERMAL_WIDTH_PT = 164.41;
/** Tinggi default; konten lebih panjang otomatis wrap ke halaman berikutnya. */
const THERMAL_HEIGHT_PT = 800;

const styles = StyleSheet.create({
  page: {
    width: THERMAL_WIDTH_PT,
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 6,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#000",
  },
  center: { textAlign: "center" },
  storeName: {
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 2,
  },
  storeDetail: {
    fontSize: 7,
    textAlign: "center",
    color: "#333",
    marginBottom: 1,
  },
  title: {
    fontSize: 9,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  mono: {
    fontSize: 7,
    textAlign: "center",
    marginBottom: 4,
  },
  dash: {
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    borderBottomStyle: "dashed",
    marginVertical: 4,
  },
  row: {
    flexDirection: "row",
    marginBottom: 2,
  },
  label: { width: 42, fontSize: 7, color: "#333" },
  value: { flex: 1, fontSize: 7 },
  valueBold: { flex: 1, fontSize: 7, fontWeight: "bold" },
  sectionLabel: {
    fontSize: 7,
    fontWeight: "bold",
    marginBottom: 3,
    marginTop: 2,
  },
  itemName: { fontSize: 7, fontWeight: "bold", marginBottom: 1 },
  itemNote: { fontSize: 6, color: "#444", marginBottom: 1 },
  itemLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  itemMeta: { fontSize: 6, color: "#333", flex: 1 },
  itemTotal: { fontSize: 7, fontWeight: "bold", textAlign: "right" },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  summaryLabel: { fontSize: 7 },
  summaryValue: { fontSize: 7, fontWeight: "bold" },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 1,
  },
  paymentText: { fontSize: 6 },
  footer: {
    marginTop: 6,
    textAlign: "center",
    fontSize: 7,
  },
  footerStatus: {
    marginTop: 2,
    textAlign: "center",
    fontSize: 6,
    color: "#444",
  },
});

const fmt = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`;

export function NotaPdfDocument({ data }: { data: InvoiceData }) {
  const lineItems =
    data.lineItems && data.lineItems.length > 0
      ? data.lineItems
      : [
          {
            product_name: data.productName,
            quantity: 1,
            unit_price: data.finalPrice,
            line_total: data.finalPrice,
            note: null as string | null,
          },
        ];

  const charges = data.customerCharges || [];
  const totalDue = data.totalDue ?? data.finalPrice;
  const remaining = data.remainingAmount;

  return (
    <Document title={`Nota ${data.invoiceNumber}`}>
      <Page size={[THERMAL_WIDTH_PT, THERMAL_HEIGHT_PT]} style={styles.page} wrap>
        <Text style={styles.storeName}>{data.storeName}</Text>
        {data.storeAddress ? (
          <Text style={styles.storeDetail}>{data.storeAddress}</Text>
        ) : null}
        {data.storePhone ? (
          <Text style={styles.storeDetail}>Telp: {data.storePhone}</Text>
        ) : null}

        <View style={styles.dash} />
        <Text style={styles.title}>NOTA PEMBAYARAN</Text>
        <Text style={styles.mono}>{data.invoiceNumber}</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Tanggal</Text>
          <Text style={styles.value}>: {data.createdAt}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Pelanggan</Text>
          <Text style={styles.valueBold}>: {data.customerName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Tipe</Text>
          <Text style={styles.value}>
            : {data.paymentType === "CASH" ? "Cash (Lunas)" : "DP / Uang Muka"}
          </Text>
        </View>

        {data.description ? (
          <>
            <View style={styles.dash} />
            <Text style={styles.sectionLabel}>Catatan</Text>
            <Text style={styles.itemNote}>{data.description}</Text>
          </>
        ) : null}

        <View style={styles.dash} />
        <Text style={styles.sectionLabel}>Rincian Produk</Text>

        {lineItems.map((item, index) => (
          <View key={`${item.product_name}-${index}`} wrap={false}>
            <Text style={styles.itemName}>{item.product_name}</Text>
            {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}
            <View style={styles.itemLine}>
              <Text style={styles.itemMeta}>
                {item.quantity} x {fmt(item.unit_price)}
              </Text>
              <Text style={styles.itemTotal}>{fmt(item.line_total)}</Text>
            </View>
          </View>
        ))}

        {charges.length > 0 ? (
          <>
            <View style={styles.dash} />
            <Text style={styles.sectionLabel}>Biaya pembeli</Text>
            {charges.map((c, i) => (
              <View key={`${c.name}-${i}`} style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{c.name}</Text>
                <Text style={styles.summaryValue}>{fmt(c.amount)}</Text>
              </View>
            ))}
          </>
        ) : null}

        <View style={styles.dash} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Tagihan</Text>
          <Text style={styles.summaryValue}>{fmt(totalDue)}</Text>
        </View>
        {data.paymentType === "DP" ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>DP Awal</Text>
            <Text style={styles.summaryValue}>{fmt(data.dpAmount)}</Text>
          </View>
        ) : null}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Dibayar</Text>
          <Text style={styles.summaryValue}>{fmt(data.totalPaid)}</Text>
        </View>
        {remaining > 0 ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Sisa Tagihan</Text>
            <Text style={styles.summaryValue}>{fmt(remaining)}</Text>
          </View>
        ) : data.paymentType !== "CASH" ? (
          <Text style={styles.center}>*** LUNAS ***</Text>
        ) : null}

        {data.payments.length > 0 ? (
          <>
            <View style={styles.dash} />
            <Text style={styles.sectionLabel}>Riwayat Pembayaran</Text>
            {data.payments.map((p, i) => (
              <View key={i} style={styles.paymentRow}>
                <Text style={styles.paymentText}>
                  {p.date} — {p.method}
                </Text>
                <Text style={styles.paymentText}>{fmt(p.amount)}</Text>
              </View>
            ))}
          </>
        ) : null}

        <View style={styles.dash} />
        <Text style={styles.footer}>Terima kasih atas kepercayaan Anda!</Text>
        <Text style={styles.footerStatus}>{data.status}</Text>
      </Page>
    </Document>
  );
}

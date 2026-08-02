import { Document, Page, Text, View, StyleSheet, Font, Image } from "@react-pdf/renderer";

Font.register({
  family: "Helvetica",
  fonts: [
    { src: "Helvetica", fontWeight: "normal" },
    { src: "Helvetica-Bold", fontWeight: "bold" },
  ],
});

export interface InvoiceLineItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  note?: string | null;
}

export interface InvoiceData {
  invoiceNumber: string;
  createdAt: string;
  status: string;
  storeName: string;
  storeAddress: string | null;
  storePhone: string | null;
  storeLogoUrl: string | null;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  productName: string;
  productDescription: string | null;
  description: string | null;
  lineItems?: InvoiceLineItem[];
  finalPrice: number;
  paymentType: string;
  dpAmount: number;
  totalPaid: number;
  remainingAmount: number;
  payments: Array<{
    amount: number;
    date: string;
    method: string;
    note: string | null;
  }>;
}

const styles = StyleSheet.create({
  page: {
    padding: 20,
    paddingTop: 16,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: "#800000",
    borderBottomStyle: "solid",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    flex: 1,
  },
  logo: {
    width: 40,
    height: 40,
    objectFit: "contain",
  },
  storeInfo: {
    flexDirection: "column",
  },
  storeName: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#800000",
    marginBottom: 2,
  },
  storeDetail: {
    fontSize: 8,
    color: "#666",
    marginBottom: 1,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  invoiceTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#800000",
    marginBottom: 3,
  },
  invoiceNumber: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 2,
  },
  invoiceDate: {
    fontSize: 8,
    color: "#666",
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#800000",
    marginBottom: 5,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    borderBottomStyle: "solid",
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  infoLabel: {
    width: 60,
    fontSize: 8,
    color: "#666",
  },
  infoValue: {
    flex: 1,
    fontSize: 8,
  },
  table: {
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#800000",
    color: "#ffffff",
    padding: 5,
    fontSize: 8,
    fontWeight: "bold",
  },
  tableHeaderItem: { flex: 3 },
  tableHeaderQty: { flex: 1, textAlign: "center" },
  tableHeaderPrice: { flex: 1.5, textAlign: "right" },
  tableHeaderTotal: { flex: 1.5, textAlign: "right" },
  tableRow: {
    flexDirection: "row",
    padding: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    borderBottomStyle: "solid",
    fontSize: 8,
  },
  tableCell: { flex: 3 },
  tableCellQty: { flex: 1, textAlign: "center" },
  tableCellPrice: { flex: 1.5, textAlign: "right" },
  tableCellTotal: { flex: 1.5, textAlign: "right" },
  summary: {
    marginLeft: "auto",
    width: "65%",
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    paddingHorizontal: 6,
    fontSize: 8,
  },
  summaryRowBold: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 9,
    fontWeight: "bold",
    backgroundColor: "#f5f5f5",
    borderTopWidth: 1,
    borderTopColor: "#800000",
    borderTopStyle: "solid",
  },
  summaryLabel: { color: "#666" },
  summaryValue: { fontWeight: "bold" },
  summaryValueGreen: { fontWeight: "bold", color: "#16a34a" },
  summaryValueRed: { fontWeight: "bold", color: "#dc2626" },
  paymentItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    paddingHorizontal: 6,
    fontSize: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    borderBottomStyle: "solid",
  },
  paymentDate: { color: "#666", fontSize: 7 },
  paymentMethod: { color: "#666", fontSize: 7 },
  paymentAmount: { fontWeight: "bold" },
  footer: {
    marginTop: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    borderTopStyle: "solid",
    textAlign: "center",
    fontSize: 7,
    color: "#999",
  },
});

const fmt = (amount: number) => {
  return `Rp ${amount.toLocaleString("id-ID")}`;
};

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {data.storeLogoUrl && (
              <Image style={styles.logo} src={data.storeLogoUrl} />
            )}
            <View style={styles.storeInfo}>
              <Text style={styles.storeName}>{data.storeName}</Text>
              {data.storeAddress && (
                <Text style={styles.storeDetail}>{data.storeAddress}</Text>
              )}
              {data.storePhone && (
                <Text style={styles.storeDetail}>Telp: {data.storePhone}</Text>
              )}
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{data.invoiceNumber}</Text>
            <Text style={styles.invoiceDate}>{data.createdAt}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Pelanggan</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Nama</Text>
            <Text style={styles.infoValue}>{data.customerName}</Text>
          </View>
          {data.customerPhone && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Telepon</Text>
              <Text style={styles.infoValue}>{data.customerPhone}</Text>
            </View>
          )}
          {data.customerAddress && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Alamat</Text>
              <Text style={styles.infoValue}>{data.customerAddress}</Text>
            </View>
          )}
        </View>

        {data.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Catatan</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoValue}>{data.description}</Text>
            </View>
          </View>
        )}

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderItem}>Keterangan</Text>
            <Text style={styles.tableHeaderQty}>Qty</Text>
            <Text style={styles.tableHeaderPrice}>Harga</Text>
            <Text style={styles.tableHeaderTotal}>Subtotal</Text>
          </View>
          {(data.lineItems && data.lineItems.length > 0
            ? data.lineItems
            : [
                {
                  product_name: data.productName,
                  quantity: 1,
                  unit_price: data.finalPrice,
                  line_total: data.finalPrice,
                  note: null,
                },
              ]
          ).map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.tableCell}>
                {item.product_name}
                {item.note ? `\n${item.note}` : ""}
              </Text>
              <Text style={styles.tableCellQty}>{item.quantity}</Text>
              <Text style={styles.tableCellPrice}>{fmt(item.unit_price)}</Text>
              <Text style={styles.tableCellTotal}>{fmt(item.line_total)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Pesanan</Text>
            <Text style={styles.summaryValue}>{fmt(data.finalPrice)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Dibayar</Text>
            <Text style={styles.summaryValueGreen}>{fmt(data.totalPaid)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Metode</Text>
            <Text style={styles.summaryValue}>
              {data.paymentType === "CASH" ? "Cash" : "DP (Uang Muka)"}
            </Text>
          </View>
          <View style={styles.summaryRowBold}>
            <Text style={styles.summaryLabel}>Sisa Tagihan</Text>
            <Text
              style={
                data.remainingAmount <= 0
                  ? styles.summaryValueGreen
                  : styles.summaryValueRed
              }
            >
              {data.remainingAmount <= 0
                ? "LUNAS"
                : fmt(data.remainingAmount)}
            </Text>
          </View>
        </View>

        {data.payments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Riwayat Pembayaran</Text>
            {data.payments.map((payment, index) => (
              <View key={index} style={styles.paymentItem}>
                <Text style={styles.paymentDate}>{payment.date}</Text>
                <Text style={styles.paymentMethod}>{payment.method}</Text>
                <Text style={styles.paymentAmount}>{fmt(payment.amount)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer}>
          <Text>Terima kasih atas kepercayaan Anda</Text>
          <Text style={{ marginTop: 2 }}>
            {data.storeName} — {data.storeAddress}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

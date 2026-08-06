/** Biaya dibebankan ke pembeli — masuk nota, bukan omzet. */

export interface CustomerChargeAmount {
  amount: number;
}

export function sumCustomerCharges(
  charges: CustomerChargeAmount[] | null | undefined
): number {
  if (!charges || charges.length === 0) return 0;
  return charges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
}

export function totalTagihan(
  finalPrice: number,
  charges: CustomerChargeAmount[] | null | undefined
): number {
  return Math.max(0, Number(finalPrice) || 0) + sumCustomerCharges(charges);
}

/**
 * Alokasi pembayaran kronologis: barang dulu, lalu biaya pembeli.
 * Dipakai dashboard agar ongkir tidak menggelembungkan omzet.
 */
export function allocatePaymentToGoods(params: {
  paymentAmount: number;
  goodsRemaining: number;
}): { toGoods: number; toCharges: number; goodsRemaining: number } {
  const amount = Math.max(0, Number(params.paymentAmount) || 0);
  const goodsRemaining = Math.max(0, Number(params.goodsRemaining) || 0);
  const toGoods = Math.min(amount, goodsRemaining);
  return {
    toGoods,
    toCharges: amount - toGoods,
    goodsRemaining: goodsRemaining - toGoods,
  };
}

/**
 * Hitung bagian pembayaran dalam rentang yang menutup harga barang.
 * `allPayments` harus diurutkan naik (payment_date).
 */
export function sumGoodsRevenueInRange(
  allPayments: Array<{ amount: number; payment_date: string }>,
  finalPrice: number,
  rangeStartMs: number,
  rangeEndMs: number
): { goodsInRange: number } {
  let goodsRemaining = Math.max(0, Number(finalPrice) || 0);
  let goodsInRange = 0;

  for (const p of allPayments) {
    const t = new Date(p.payment_date).getTime();
    const { toGoods, goodsRemaining: next } = allocatePaymentToGoods({
      paymentAmount: Number(p.amount) || 0,
      goodsRemaining,
    });
    goodsRemaining = next;
    if (t >= rangeStartMs && t <= rangeEndMs) {
      goodsInRange += toGoods;
    }
  }

  return { goodsInRange };
}

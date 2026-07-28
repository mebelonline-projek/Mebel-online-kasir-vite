import { z } from "zod";

const DB_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function dbId(message = "ID tidak valid") {
  return z.string().regex(DB_UUID_RE, message);
}

export function optionalDbId(message = "ID tidak valid") {
  return dbId(message).optional().or(z.literal(""));
}

export const loginSchema = z.object({
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter").max(100),
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
});

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const transactionItemSchema = z.object({
  product_id: optionalDbId(),
  product_name: z.string().min(1, "Nama produk wajib").max(200),
  quantity: z.coerce.number().min(1, "Min 1").max(999),
  unit_price: z.coerce.number().min(1, "Harga item harus lebih dari 0").max(999_999_999),
  note: z.string().max(300).optional().or(z.literal("")),
  warehouse_id: optionalDbId(),
});

export type TransactionItemFormValues = z.infer<typeof transactionItemSchema>;

export const transactionCreateSchema = z
  .object({
    customer_id: optionalDbId(),
    product_id: optionalDbId(),
    customer_name: z
      .string()
      .max(100, "Nama pelanggan maksimal 100 karakter")
      .optional()
      .or(z.literal(""))
      .nullable(),
    description: z
      .string()
      .max(1000, "Deskripsi maksimal 1000 karakter")
      .optional()
      .or(z.literal(""))
      .nullable(),
    final_price: z.coerce
      .number()
      .min(1, "Harga harus lebih dari 0")
      .max(999_999_999, "Harga terlalu besar"),
    payment_type: z.enum(["CASH", "DP"], { error: "Pilih tipe pembayaran" }),
    payment_method: z.enum(["TUNAI", "TRANSFER"]).default("TUNAI"),
    client_id: dbId().optional(),
    dp_amount: z.coerce.number().min(0, "DP tidak boleh negatif").default(0),
    items: z.array(transactionItemSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.payment_type === "DP") {
        return data.dp_amount > 0 && data.dp_amount < data.final_price;
      }
      return true;
    },
    {
      message: "DP harus lebih dari 0 dan kurang dari harga final",
      path: ["dp_amount"],
    }
  );

export type TransactionCreateValues = z.infer<typeof transactionCreateSchema>;

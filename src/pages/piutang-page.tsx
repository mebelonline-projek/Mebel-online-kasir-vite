import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { useAuth } from "@/contexts/auth-context";
import {
  getPiutangPageData,
  type PiutangRow,
} from "@/lib/piutang";
import { formatCurrency, formatDate } from "@/lib/formatters";

export function PiutangPage() {
  const { role } = useAuth();
  const [piutangList, setPiutangList] = useState<PiutangRow[]>([]);
  const [totalPiutang, setTotalPiutang] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getPiutangPageData();
    if (!result.success || !result.data) {
      toast.error(result.message || "Gagal memuat piutang");
      setPiutangList([]);
      setTotalPiutang(0);
    } else {
      setPiutangList(result.data.piutangList);
      setTotalPiutang(result.data.totalPiutang);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (role === "OWNER") void load();
  }, [role, load]);

  if (role !== "OWNER") {
    return <Navigate to="/kasir" replace />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Piutang
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Daftar transaksi DP dan menunggu pelunasan yang masih ada sisa
          tagihan.
        </p>
      </div>

      <Card className="shadow-sm">
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Piutang
            </p>
            <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
              {formatCurrency(totalPiutang)}
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15">
            <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
        </CardContent>
      </Card>

      {loading && piutangList.length === 0 ? (
        <div className="animate-pulse space-y-4">
          <div className="h-20 rounded-xl bg-muted/50" />
          <div className="h-64 rounded-xl bg-muted/50" />
        </div>
      ) : piutangList.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-16 text-center text-muted-foreground">
            Tidak ada piutang outstanding saat ini.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {piutangList.map((tx) => (
              <Card key={tx.id} className="shadow-sm">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold">
                      {tx.transaction_number}
                    </span>
                    <StatusBadge status={tx.status} />
                  </div>
                  <p className="font-semibold">
                    {tx.customer_name || "Tanpa nama"}
                  </p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sisa tagihan</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {formatCurrency(tx.remaining)}
                    </span>
                  </div>
                  <Link to={`/transaksi/${tx.id}/pelunasan`} className="block">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full gap-1"
                    >
                      Input Pelunasan
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="hidden overflow-hidden shadow-sm md:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Transaksi</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Dibayar</TableHead>
                    <TableHead>Sisa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="w-[120px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {piutangList.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-mono text-sm font-bold">
                        {tx.transaction_number}
                      </TableCell>
                      <TableCell>{tx.customer_name || "—"}</TableCell>
                      <TableCell>{formatCurrency(tx.final_price)}</TableCell>
                      <TableCell>{formatCurrency(tx.paid)}</TableCell>
                      <TableCell className="font-bold text-amber-600 dark:text-amber-400">
                        {formatCurrency(tx.remaining)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={tx.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(tx.created_at)}
                      </TableCell>
                      <TableCell>
                        <Link to={`/transaksi/${tx.id}/pelunasan`}>
                          <Button type="button" size="sm" variant="outline">
                            Pelunasan
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

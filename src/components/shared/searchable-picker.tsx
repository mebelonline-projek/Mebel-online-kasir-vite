import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PickerOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface Props {
  label: string;
  placeholder?: string;
  options: PickerOption[];
  value: string | null;
  onChange: (id: string | null, option: PickerOption | null) => void;
  allowManual?: boolean;
  manualValue?: string;
  onManualChange?: (value: string) => void;
  manualPlaceholder?: string;
}

export function SearchablePicker({
  label,
  placeholder = "Cari...",
  options,
  value,
  onChange,
  allowManual = true,
  manualValue = "",
  onManualChange,
  manualPlaceholder = "Atau ketik manual...",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value) || null;

  const filtered = options.filter((o) => {
    const q = query.toLowerCase();
    return (
      o.label.toLowerCase().includes(q) ||
      (o.sublabel?.toLowerCase().includes(q) ?? false)
    );
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <label className="text-sm font-medium">{label}</label>

      {selected ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary bg-primary/5 p-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selected.label}</p>
            {selected.sublabel && (
              <p className="truncate text-xs text-muted-foreground">
                {selected.sublabel}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onChange(null, null)}
            className="shrink-0 rounded p-1 hover:bg-muted"
            aria-label="Hapus pilihan"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="pr-8"
          />
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

          {open && filtered.length > 0 && (
            <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-md">
              {filtered.slice(0, 20).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={cn(
                    "min-h-[44px] w-full px-3 py-3 text-left text-sm transition-colors hover:bg-accent",
                    value === opt.id && "bg-accent"
                  )}
                  onClick={() => {
                    onChange(opt.id, opt);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <p className="font-medium">{opt.label}</p>
                  {opt.sublabel && (
                    <p className="text-xs text-muted-foreground">
                      {opt.sublabel}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}

          {open && query && filtered.length === 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover p-3 text-sm text-muted-foreground shadow-md">
              Tidak ditemukan
            </div>
          )}
        </div>
      )}

      {allowManual && !selected && onManualChange && (
        <Input
          value={manualValue}
          onChange={(e) => onManualChange(e.target.value)}
          placeholder={manualPlaceholder}
          className="text-sm"
        />
      )}
    </div>
  );
}

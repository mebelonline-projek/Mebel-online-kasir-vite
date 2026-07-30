import { Input } from "@/components/ui/input";
import {
  useCallback,
  useState,
  type InputHTMLAttributes,
} from "react";

interface CurrencyInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type"
  > {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function CurrencyInput({
  value,
  onChange,
  placeholder = "1.000.000",
  className = "",
  ...props
}: CurrencyInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);

  const formatDisplay = (val: string): string => {
    if (!val) return "";
    const num = parseInt(val.replace(/\D/g, ""), 10);
    if (Number.isNaN(num)) return "";
    return num.toLocaleString("id-ID");
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={isFocused ? value : formatDisplay(value)}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
      autoComplete="off"
      {...props}
    />
  );
}

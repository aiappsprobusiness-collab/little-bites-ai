import { cn } from "@/lib/utils";

/** Единый чип аллергии для всех тарифов: оливковая палитра, без красного. */
export function AllergyChip({
  label,
  className,
  ...rest
}: { label: string } & React.ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] border border-[currentColor]/15",
        "bg-primary/[0.06] text-primary border-primary/20",
        className
      )}
      {...rest}
    >
      {label}
    </span>
  );
}

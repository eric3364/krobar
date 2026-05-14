// <SlotIconBadge> — vignette d'icône Lucide par slot avec popover d'alternatives.
// Charge les SVG individuels via getLucideIconSvg (cache mémoire + localStorage 7j).

import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getLucideIconSvg } from "@/api/lucide";
import { cn } from "@/lib/utils";

export type SlotIconBadgeProps = {
  slotKey: string;
  iconChoice: { default: string | null; alternatives: string[] };
  selectedIconName: string | null;
  onChange: (newIconName: string) => void;
};

function useLucideSvg(name: string | null): { svg: string | null; failed: boolean } {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setSvg(null);
    setFailed(false);
    if (!name) return;
    let cancelled = false;
    getLucideIconSvg(name)
      .then((s) => { if (!cancelled) setSvg(s); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [name]);
  return { svg, failed };
}

function IconGlyph({
  name,
  size,
  className,
}: { name: string | null; size: number; className?: string }) {
  const { svg, failed } = useLucideSvg(name);
  if (!name || failed) {
    return (
      <span
        aria-hidden
        className={cn("inline-block bg-muted rounded", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  if (!svg) {
    return <Skeleton className={cn("rounded", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex items-center justify-center text-current animate-in fade-in-0 duration-150",
        `[&_svg]:w-[${size}px] [&_svg]:h-[${size}px] [&_svg]:stroke-current`,
        className,
      )}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default function SlotIconBadge({
  slotKey,
  iconChoice,
  selectedIconName,
  onChange,
}: SlotIconBadgeProps) {
  const [open, setOpen] = useState(false);
  const current = selectedIconName ?? iconChoice.default;
  const alts = (iconChoice.alternatives ?? []).filter((n) => n && n !== current);

  if (!current && alts.length === 0) return null;

  return (
    <TooltipProvider delayDuration={400}>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Icône du slot ${slotKey}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpen((v) => !v);
                  }
                }}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border bg-background hover:border-primary hover:bg-accent text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <IconGlyph name={current} size={18} />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">
            <span className="font-mono text-xs">{current ?? "—"}</span>
            <span className="block text-[10px] text-muted-foreground">slot : {slotKey}</span>
          </TooltipContent>
        </Tooltip>

        <PopoverContent
          align="start"
          side="top"
          collisionPadding={8}
          className="w-auto p-2"
        >
          {alts.length === 0 ? (
            <p className="text-xs text-muted-foreground italic px-1">
              Pas d'alternative.
            </p>
          ) : (
            <div className="flex items-center gap-1.5">
              {alts.slice(0, 5).map((alt) => (
                <Tooltip key={alt}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => { onChange(alt); setOpen(false); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { onChange(alt); setOpen(false); }
                      }}
                      className="w-9 h-9 rounded-md border border-border bg-background hover:border-primary hover:bg-accent text-foreground inline-flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <IconGlyph name={alt} size={22} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <span className="font-mono text-xs">{alt}</span>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}

import { CATEGORY_ICONS } from "./CategoryIcon";
import { CATEGORIES, productCategory } from "@/lib/categories";

function categoryIdentity(category: unknown) {
  const id = productCategory(category);
  return {
    label: CATEGORIES.find((c) => c.id === id)!.singular,
    Icon: CATEGORY_ICONS[id],
  };
}

/** Compact identity for selectors; never rendered alongside the card emblem. */
export function CategoryDetails({ category }: { category?: unknown }) {
  const { label, Icon } = categoryIdentity(category);
  return (
    <span
      aria-label={`Tipo de repuesto: ${label}`}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400"
    >
      <Icon
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 text-[#B6AA8B]"
        strokeWidth={1.5}
      />
      <span>{label}</span>
    </span>
  );
}

/** One category emblem and one text hierarchy, shared by every product card. */
export default function ProductIdentity({
  model,
  category,
  as: Title = "h3",
  className = "",
  titleClassName = "text-base",
}: {
  model: string;
  category?: unknown;
  as?: "h3" | "h4" | "p";
  className?: string;
  titleClassName?: string;
}) {
  const { label, Icon } = categoryIdentity(category);
  return (
    <div className={`flex min-w-0 items-start gap-2.5 ${className}`}>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-[#171B2B]/70 text-[#B6AA8B] shadow-inner"
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <span
          aria-label={`Tipo de repuesto: ${label}`}
          className="block text-[10px] font-medium uppercase tracking-[0.14em] text-gray-400"
        >
          {label}
        </span>
        <Title
          className={`font-bold leading-snug text-white [overflow-wrap:anywhere] ${titleClassName}`}
        >
          {model}
        </Title>
      </div>
    </div>
  );
}

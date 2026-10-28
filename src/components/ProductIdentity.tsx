import { CATEGORIES, productCategory } from "@/lib/categories";

/** Product classification is metadata, visually separate from commercial badges. */
export function CategoryDetails({ category }: { category?: unknown }) {
  const label = CATEGORIES.find(
    (c) => c.id === productCategory(category),
  )!.singular;
  return (
    <span
      aria-label={`Tipo de repuesto: ${label}`}
      className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
        Tipo
      </span>
      <span className="text-xs font-semibold text-gray-200">{label}</span>
    </span>
  );
}

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
  return (
    <div className={`min-w-0 space-y-1.5 ${className}`}>
      <Title
        className={`font-bold leading-snug text-white [overflow-wrap:anywhere] ${titleClassName}`}
      >
        {model}
      </Title>
      <CategoryDetails category={category} />
    </div>
  );
}

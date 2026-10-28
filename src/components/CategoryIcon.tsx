import type { SVGProps } from "react";
import { BatteryFull, Cable, Smartphone } from "lucide-react";

function BackCoverIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <circle cx="9.5" cy="6" r="1.25" />
      <circle cx="9.5" cy="10" r="1.25" />
    </svg>
  );
}

/** The same category pictograms are used in navigation, cards and selectors. */
export const CATEGORY_ICONS = {
  DISPLAY: Smartphone,
  BATERIA: BatteryFull,
  TAPA: BackCoverIcon,
  ACCESORIO: Cable,
};

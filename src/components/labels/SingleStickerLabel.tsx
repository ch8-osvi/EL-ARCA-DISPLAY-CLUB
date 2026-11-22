"use client";

import React from "react";
import { Smartphone } from "lucide-react";
import { Product } from "@/lib/types";
import { productLabel } from "@/lib/labelLayout";
import { productQuality } from "@/lib/categories";

interface SingleStickerLabelProps {
  product: Product;
  widthMm: number;
  heightMm: number;
}

export default function SingleStickerLabel({
  product,
  widthMm,
  heightMm,
}: SingleStickerLabelProps) {
  const name = productLabel(product);
  const quality = productQuality(product.calidad || "ORIGINAL");
  const unit = Math.min(widthMm / 40, heightMm / 20, 1.65);
  const mm = (value: number) => `${value * unit}mm`;
  const gold = "#9B711C";
  const nameLength = name.toUpperCase().length;
  const nameSize = Math.min(3.45, 14.6 / Math.sqrt(Math.max(nameLength, 1)));
  const qualitySize = Math.min(1.9, 55 / Math.max(quality.length, 1));

  return (
    <div
      className="single-sticker-label"
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        boxSizing: "border-box",
        border: "0.2mm solid #85817A",
        borderLeft: `${mm(0.75)} solid ${gold}`,
        borderRadius: mm(1.1),
        background: "#FFFFFF",
        color: "#151310",
        fontFamily: "Arial, Helvetica, sans-serif",
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr) auto",
        gap: mm(0.55),
        padding: `${mm(0.8)} ${mm(1.55)}`,
        overflow: "hidden",
        lineHeight: 1.05,
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: mm(0.95),
          borderBottom: "0.2mm solid #D8BA76",
          paddingBottom: mm(0.5),
        }}
      >
        <img
          src="/logo.png"
          alt=""
          width={32}
          height={32}
          style={{
            width: mm(4.7),
            height: mm(4.7),
            objectFit: "contain",
            flexShrink: 0,
          }}
        />
        <div style={{ fontSize: mm(2.1), fontWeight: 900, letterSpacing: "0.07em" }}>
          EL ARCA
          <div
            style={{
              color: "#6D521F",
              fontSize: mm(1.35),
              fontWeight: 800,
              marginTop: mm(0.36),
              letterSpacing: "0.12em",
            }}
          >
            DISPLAY CLUB
          </div>
        </div>
      </div>

      <div
        style={{
          alignSelf: "safe center",
          fontSize: mm(nameSize),
          fontWeight: 900,
          letterSpacing: "-0.025em",
          overflowWrap: "anywhere",
          textTransform: "uppercase",
        }}
      >
        {name}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: mm(0.75),
          minWidth: 0,
          paddingTop: mm(0.43),
          borderTop: "0.2mm solid #D8BA76",
        }}
      >
        <Smartphone
          aria-hidden="true"
          strokeWidth={2.2}
          style={{
            width: mm(2.75),
            height: mm(2.75),
            color: gold,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: mm(qualitySize),
            fontWeight: 900,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            overflowWrap: "anywhere",
          }}
        >
          {quality}
        </span>
      </div>
    </div>
  );
}

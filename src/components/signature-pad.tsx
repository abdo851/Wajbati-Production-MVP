"use client";

import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { useI18n } from "@/components/language";
import { quietButtonClass } from "@/components/ui";

export function SignatureCapture({ label, onChange }: { label: string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = canvas.offsetWidth || 320;
    const height = canvas.offsetHeight || 144;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const context = canvas.getContext("2d");
    context?.scale(ratio, ratio);
    const pad = new SignaturePad(canvas, { penColor: "#1E1A15", backgroundColor: "rgba(255,255,255,0)" });
    padRef.current = pad;
    return () => {
      pad.off();
    };
  }, []);

  return (
    <div className="space-y-2">
      <p className="text-base leading-7">{label}</p>
      <canvas ref={canvasRef} className="h-36 w-full touch-none rounded-lg border border-line bg-white" />
      <div className="flex gap-2">
        <button
          type="button"
          className={quietButtonClass}
          onClick={() => {
            padRef.current?.clear();
            setReady(false);
            onChange("");
          }}
        >
          {t("sign.clear")}
        </button>
        <button
          type="button"
          className={quietButtonClass}
          onClick={() => {
            const pad = padRef.current;
            if (!pad || pad.isEmpty()) return;
            onChange(pad.toDataURL("image/png"));
            setReady(true);
          }}
        >
          {t("sign.confirm")}
        </button>
      </div>
      {ready ? <p className="text-sm text-olive">{t("sign.confirm")}</p> : null}
    </div>
  );
}

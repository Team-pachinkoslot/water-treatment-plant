"use client";
import { useId, useState } from "react";
import { glossary } from "@/lib/scenarios/incident";

// 用語に下線を付け、ホバー(デスクトップ)・フォーカス(キーボード)・タップ(スマホ)で説明を表示する。
export function Term({ name, children }: { name: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const desc = glossary[name];
  if (!desc) return <>{children ?? name}</>;
  return (
    <span className="glossary-term">
      <button
        type="button"
        className="glossary-trigger"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children ?? name}
      </button>
      {open && (
        <span role="tooltip" id={id} className="glossary-tooltip">
          {desc}
        </span>
      )}
    </span>
  );
}

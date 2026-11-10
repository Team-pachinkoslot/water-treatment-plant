"use client";
import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { glossary } from "@/lib/scenarios/incident";

// 用語に下線を付け、ホバー(デスクトップ)・フォーカス(キーボード)・タップ(スマホ)で説明を表示する。
export function Term({ name, children }: { name: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const id = useId();
  const desc = glossary[name];
  function show(element: HTMLButtonElement) {
    const rect = element.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)), top: Math.min(rect.bottom + 6, window.innerHeight - 120) });
    setOpen(true);
  }
  if (!desc) return <>{children ?? name}</>;
  return (
    <span className="glossary-term">
      <button
        type="button"
        className="glossary-trigger"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={e => show(e.currentTarget)}
        onMouseEnter={e => show(e.currentTarget)}
        onMouseLeave={() => setOpen(false)}
        onFocus={e => show(e.currentTarget)}
        onBlur={() => setOpen(false)}
        onKeyDown={e => { if (e.key === "Escape") { setOpen(false); e.currentTarget.blur(); } }}
      >
        {children ?? name}
      </button>
      {open && createPortal(
        <span role="tooltip" id={id} className="glossary-tooltip" style={position}>
          {desc}
        </span>, document.body
      )}
    </span>
  );
}

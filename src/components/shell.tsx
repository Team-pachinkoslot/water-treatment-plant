"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Box,
  FlaskConical,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";

const links = [
  { href: "/", label: "概要", icon: LayoutDashboard },
  { href: "/labs/water-treatment", label: "演習ラボ", icon: FlaskConical },
  { href: "/dashboard", label: "開発プレビュー", icon: Box },
  { href: "/guide", label: "学習ガイド", icon: BookOpen },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [rules, setRules] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const rulesTriggerRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  // スマホ幅のメニューは Esc で閉じ、メニューボタンへフォーカスを戻す
  useEffect(() => {
    if (!menu) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenu(false);
      menuButtonRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu]);
  useEffect(() => {
    if (!rules) return;
    const previous = rulesTriggerRef.current;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setRules(false);
      if (event.key === "Tab") {
        const buttons =
          dialogRef.current?.querySelectorAll<HTMLButtonElement>("button");
        if (!buttons?.length) return;
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [rules]);
  return (
    <div className="app-shell">
      <header className={`site-header ${menu ? "is-open" : ""}`}>
        <div className="site-header-inner">
          <Link href="/" className="brand" onClick={() => setMenu(false)}>
            <span className="brand-mark">
              <Box size={20} />
            </span>
            <span>
              ICS<span className="brand-light">LAB</span>
              <small>INDUSTRIAL CYBER SECURITY</small>
            </span>
          </Link>
          <div className="site-menu" id="site-menu">
            <nav className="site-nav" aria-label="メインナビゲーション">
              {links.map(({ href, label, icon: Icon }) => {
                const active =
                  href === "/" ? path === "/" : path.startsWith(href);
                return (
                  <Link
                    onClick={() => setMenu(false)}
                    className={`nav-link ${active ? "active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    href={href}
                    key={href}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <ul className="env-status" aria-label="環境の状態">
              <li>
                <i className="dot cyan" aria-hidden="true" /> LOCAL ENVIRONMENT
              </li>
              <li>
                <i className="dot cyan" aria-hidden="true" /> Sandbox only
              </li>
              <li>
                <i className="dot amber" aria-hidden="true" /> Phase 1{" "}
                <small>開発中</small>
              </li>
            </ul>
          </div>
          <button
            ref={menuButtonRef}
            className="menu-button"
            onClick={() => setMenu(!menu)}
            aria-label="メニュー"
            aria-expanded={menu}
            aria-controls="site-menu"
          >
            {menu ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-sandbox">
            <ShieldCheck size={18} aria-hidden="true" />
            <p>すべて架空の設備・データを使用する学習環境です。</p>
            <button
              ref={rulesTriggerRef}
              className="text-link"
              onClick={() => setRules(true)}
            >
              演習ルールを確認 <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="footer-about">
            <span>LEARNING ENVIRONMENT</span>
            <p>ローカルの模擬環境で、産業システムの安全を学ぶ。</p>
          </div>
          <div className="footer-meta">
            <span>
              © 2026 ICS Lab <span className="footer-separator">/</span> Learn.
              Investigate. Defend.
            </span>
            <span>
              <i className="dot amber" /> モック環境{" "}
              <span className="footer-separator">·</span> ARM64 / VMware Fusion
            </span>
            <span className="version">
              ICS LAB v0.1.0 <i className="dot" />
            </span>
          </div>
        </div>
      </footer>
      {rules && (
        <div className="modal-backdrop" onClick={() => setRules(false)}>
          <section
            ref={dialogRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rules-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              autoFocus
              aria-label="閉じる"
              onClick={() => setRules(false)}
            >
              <X />
            </button>
            <ShieldCheck className="text-orange" size={30} />
            <h2 id="rules-title">演習環境のルール</h2>
            <p>指定されたローカルVMと架空のデータだけを対象にします。</p>
            <ul>
              <li>
                Red
                Team：調査と証拠収集のみ。設備操作・破壊・サービス停止は行いません。
              </li>
              <li>Blue Team：仮想モデルの安全な模擬操作のみを扱います。</li>
              <li>
                Host-onlyに加え、ホスト側のアクセス制御と通信の検証が必要です。
              </li>
              <li>
                実行可能になるフェーズでは演習ログを保存し、終了時に基準スナップショットへ復元します。
              </li>
            </ul>
            <div className="notice">
              現在はPhase 1です。VMや実設備への接続はありません。
            </div>
            <button className="button primary" onClick={() => setRules(false)}>
              確認しました <ShieldCheck size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

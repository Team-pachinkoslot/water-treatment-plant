"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Box,
  ChevronRight,
  FlaskConical,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [rules, setRules] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const rulesTriggerRef = useRef<HTMLButtonElement>(null);
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
      <aside className={`sidebar ${menu ? "is-open" : ""}`}>
        <Link href="/" className="brand" onClick={() => setMenu(false)}>
          <span className="brand-mark">
            <Box size={23} />
          </span>
          <span>
            ICS<span className="brand-light">LAB</span>
            <small>INDUSTRIAL CYBER SECURITY</small>
          </span>
        </Link>
        <div className="workspace-label">
          WORKSPACE <span>LOCAL</span>
        </div>
        <nav aria-label="メインナビゲーション">
          {[
            { href: "/", label: "概要", icon: LayoutDashboard },
            { href: "/labs", label: "演習ラボ", icon: FlaskConical },
            { href: "/dashboard", label: "開発プレビュー", icon: Box },
            { href: "/guide", label: "学習ガイド", icon: BookOpen },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              onClick={() => setMenu(false)}
              className={`nav-link ${(href === "/" ? path === "/" : path.startsWith(href)) ? "active" : ""}`}
              href={href}
              key={href}
            >
              <Icon size={18} />
              {label}
              {href === "/labs" && <span className="nav-count">03</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-section">
          <span>LEARNING ENVIRONMENT</span>
          <div>
            <i className="dot amber" /> Phase 1 <small>開発中</small>
          </div>
          <p>
            ローカルの模擬環境で、
            <br />
            産業システムの安全を学ぶ。
          </p>
        </div>
        <div className="sidebar-bottom">
          <div className="sandbox-card">
            <ShieldCheck size={21} />
            <strong>Sandbox only</strong>
            <p>
              すべて架空の設備・データを
              <br />
              使用する学習環境です。
            </p>
            <button ref={rulesTriggerRef} onClick={() => setRules(true)}>
              演習ルールを確認 <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="version">
            <span>ICS LAB</span>
            <span>
              v0.1.0 <i className="dot" />
            </span>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-backdrop"
          aria-label="メニューを閉じる"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="menu-button"
              onClick={() => setMenu(!menu)}
              aria-label="メニュー"
            >
              <Menu size={21} />
            </button>
            <span>ワークスペース</span>
            <ChevronRight size={13} />
            <strong>
              {path.startsWith("/labs/")
                ? "シナリオ詳細"
                : path === "/labs"
                  ? "演習ラボ"
                  : path === "/dashboard"
                    ? "開発プレビュー"
                    : path === "/guide"
                      ? "学習ガイド"
                      : "概要"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="local-badge">
              <LockKeyhole size={12} /> LOCAL ENVIRONMENT
            </span>
            <span className="avatar">L</span>
          </div>
        </header>
        <main id="main-content">{children}</main>
        <footer className="footer">
          <span>
            © 2026 ICS Lab <span className="footer-separator">/</span> Learn.
            Investigate. Defend.
          </span>
          <span>
            <i className="dot amber" /> モック環境{" "}
            <span className="footer-separator">·</span> ARM64 / VMware Fusion
          </span>
        </footer>
      </div>
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

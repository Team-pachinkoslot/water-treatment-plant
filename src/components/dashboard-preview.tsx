"use client";
import { useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Code2,
  Database,
  LockKeyhole,
  RefreshCw,
  Server,
} from "lucide-react";
import { labs } from "@/lib/labs";
import { PlantDiagram } from "./plant-diagram";
import { runtimeProvider } from "@/lib/runtime";
const metrics = {
  water: [
    {
      name: "取水槽 水位",
      value: "72.4",
      unit: "%",
      points:
        "0,52 30,50 60,55 90,42 120,45 150,37 180,40 210,30 240,34 270,27 300,30",
    },
    {
      name: "配水流量",
      value: "128.6",
      unit: "m³/h",
      points:
        "0,48 30,43 60,47 90,35 120,40 150,35 180,43 210,37 240,39 270,30 300,34",
    },
    {
      name: "残留塩素",
      value: "0.42",
      unit: "mg/L",
      points:
        "0,40 30,42 60,38 90,43 120,39 150,40 180,35 210,39 240,34 270,38 300,36",
    },
  ],
  power: [
    {
      name: "母線電圧",
      value: "66.0",
      unit: "kV",
      points: "0,40 50,42 100,38 150,41 200,39 250,40 300,38",
    },
    {
      name: "負荷電流",
      value: "245",
      unit: "A",
      points: "0,55 50,48 100,50 150,40 200,37 250,42 300,35",
    },
    {
      name: "開閉器",
      value: "CLOSED",
      unit: "模擬状態",
      points: "0,40 300,40",
    },
  ],
  rail: [
    { name: "列車ID", value: "TR-07", unit: "模擬列車", points: "0,40 300,40" },
    {
      name: "模擬位置",
      value: "12.8",
      unit: "km",
      points: "0,65 50,57 100,50 150,43 200,36 250,29 300,22",
    },
    {
      name: "ダイヤ差分",
      value: "+0",
      unit: "秒",
      points: "0,40 50,40 100,40 150,40 200,40 300,40",
    },
  ],
};
export function DashboardPreview() {
  const [selected, setSelected] = useState(0);
  const [checking, setChecking] = useState(false);
  const [apiStatus, setApiStatus] = useState<"idle" | "ok" | "error">("idle");
  const lab = labs[selected];
  async function checkHealth() {
    setChecking(true);
    try {
      const r = await fetch("/api/health", { cache: "no-store" });
      const d = await r.json();
      setApiStatus(
        r.ok && d.status === "ok" && d.runtime.mode === "disabled"
          ? "ok"
          : "error",
      );
    } catch {
      setApiStatus("error");
    } finally {
      setChecking(false);
    }
  }
  return (
    <>
      <div className="preview-warning">
        <CircleAlert size={19} />
        <div>
          <strong>開発プレビュー / 固定の模擬データ</strong>
          <p>
            計測値・設備図は画面確認用です。実際のVM・設備・センサーとは接続していません。
          </p>
        </div>
        <span>PHASE 1</span>
      </div>
      <div
        className="filter-tabs dashboard-tabs"
        aria-label="プレビューする設備"
      >
        {labs.map((l, i) => (
          <button
            key={l.id}
            aria-pressed={selected === i}
            className={selected === i ? "selected" : ""}
            onClick={() => setSelected(i)}
          >
            LAB {l.number}
            <span>
              {l.category === "water"
                ? "水道"
                : l.category === "power"
                  ? "電力"
                  : "鉄道"}
            </span>
          </button>
        ))}
      </div>
      <div className="metrics-grid">
        {metrics[lab.category].map((m) => (
          <section className="metric-card" key={m.name}>
            <div className="metric-label">
              {m.name}
              <span>MOCK</span>
            </div>
            <div className="metric-value">
              {m.value}
              <small>{m.unit}</small>
            </div>
            <svg
              viewBox="0 0 300 80"
              aria-label={`${m.name}の固定サンプルグラフ`}
              role="img"
            >
              <path
                d="M0 65H300M0 35H300"
                stroke="#30373a"
                strokeDasharray="3 5"
              />
              <polyline
                points={m.points}
                fill="none"
                stroke="#7fb0b5"
                strokeWidth="2"
              />
            </svg>
            <div className="metric-time">
              <span>サンプル開始</span>
              <span>固定サンプル</span>
            </div>
          </section>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel topology-panel">
          <div className="panel-heading">
            <h2>
              <Activity size={17} /> 設備トポロジー
            </h2>
            <span>ILLUSTRATION</span>
          </div>
          <PlantDiagram category={lab.category} />
          <div className="topology-legend">
            <span>
              <i className="dot cyan" />
              模擬プロセス
            </span>
            <span>
              <i className="dot amber" />
              模擬制御経路
            </span>
            <span>
              <LockKeyhole size={12} /> 未接続
            </span>
          </div>
        </section>
        <section className="panel runtime-panel">
          <div className="panel-heading">
            <h2>
              <Server size={17} /> システム状態
            </h2>
            <span>LOCAL</span>
          </div>
          <div className="runtime-status">
            <LockKeyhole size={26} />
            <div>
              <strong>Runtime disabled</strong>
              <span>VMランタイムは無効です</span>
            </div>
          </div>
          <dl>
            <div>
              <dt>環境</dt>
              <dd>モック / Phase 1</dd>
            </div>
            <div>
              <dt>対象ラボ</dt>
              <dd>{lab.id}</dd>
            </div>
            <div>
              <dt>VM接続</dt>
              <dd>未接続</dd>
            </div>
            <div>
              <dt>設備操作</dt>
              <dd>未実装</dd>
            </div>
            <div>
              <dt>データソース</dt>
              <dd>固定サンプル</dd>
            </div>
          </dl>
          <p className="muted small">{runtimeProvider.reason}</p>
        </section>
      </div>
      <section className="panel api-panel">
        <div className="panel-heading">
          <h2>
            <Code2 size={17} /> Mock API
          </h2>
          <button
            className="text-link"
            onClick={checkHealth}
            disabled={checking}
          >
            <RefreshCw size={14} className={checking ? "spinning" : ""} />
            {checking ? "確認中…" : "ヘルスチェック"}
          </button>
        </div>
        <div className="api-result" role="status">
          {apiStatus === "ok" ? (
            <>
              <CheckCircle2 size={15} /> API応答正常 /
              ランタイム無効を確認しました
            </>
          ) : apiStatus === "error" ? (
            <>
              <CircleAlert size={15} />{" "}
              APIの応答を確認できませんでした。もう一度お試しください。
            </>
          ) : (
            <>
              <Database size={15} />{" "}
              3つの読み取り専用APIを提供しています。ヘルスチェックで応答を確認できます。
            </>
          )}
        </div>
        {["/api/health", "/api/labs", `/api/labs/${lab.slug}`].map((url) => (
          <a
            className="api-row"
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            <span className="method">GET</span>
            <code>{url}</code>
            <ArrowUpRight size={15} />
          </a>
        ))}
      </section>
    </>
  );
}

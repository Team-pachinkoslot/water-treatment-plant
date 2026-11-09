"use client";
import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { labs } from "@/lib/labs";
import { LabCard } from "./lab-card";
export function Catalog() {
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");
  const filtered = labs.filter(
    (l) =>
      (category === "all" || l.category === category) &&
      (level === "all" || l.level === level) &&
      `${l.title} ${l.subtitle} ${l.name} ${l.description} ${l.skills.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="catalog-toolbar">
        <div className="filter-tabs" aria-label="設備分野">
          {[
            { id: "all", label: "すべて", count: 3 },
            { id: "water", label: "水道", count: 1 },
            { id: "power", label: "電力", count: 1 },
            { id: "rail", label: "鉄道", count: 1 },
          ].map((t) => (
            <button
              key={t.id}
              aria-pressed={category === t.id}
              className={category === t.id ? "selected" : ""}
              onClick={() => setCategory(t.id)}
            >
              {t.label}
              <span>{t.count}</span>
            </button>
          ))}
        </div>
        <div className="search-controls">
          <label className="search-box">
            <Search size={16} />
            <input
              aria-label="ラボを検索"
              placeholder="ラボ・スキルを検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button aria-label="検索をクリア" onClick={() => setQuery("")}>
                <X size={14} />
              </button>
            )}
          </label>
          <label className="level-select">
            <SlidersHorizontal size={15} />
            <select
              aria-label="難易度"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option value="all">すべての難易度</option>
              <option>初級</option>
              <option>中級</option>
              <option>上級</option>
            </select>
          </label>
        </div>
      </div>
      <div className="results-meta" aria-live="polite">
        {filtered.length} 件のシナリオ <span>すべてのラボは現在準備中です</span>
      </div>
      <div className="lab-grid">
        {filtered.map((lab) => (
          <LabCard lab={lab} key={lab.id} />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="empty-state">
          <Search size={28} />
          <h2>条件に一致するラボがありません</h2>
          <p>検索語や難易度を変更してください。</p>
          <button
            className="button secondary"
            onClick={() => {
              setQuery("");
              setLevel("all");
              setCategory("all");
            }}
          >
            条件をリセット
          </button>
        </div>
      )}
    </>
  );
}

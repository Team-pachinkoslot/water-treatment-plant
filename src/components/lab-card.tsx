import Link from "next/link";
import {
  ArrowUpRight,
  Droplets,
  LockKeyhole,
  TrainFront,
  Zap,
} from "lucide-react";
import type { Lab } from "@/lib/labs";
import { PlantDiagram } from "./plant-diagram";
export function LabCard({ lab }: { lab: Lab }) {
  const Icon =
    lab.category === "water"
      ? Droplets
      : lab.category === "power"
        ? Zap
        : TrainFront;
  return (
    <Link href={`/labs/${lab.slug}`} className={`lab-card ${lab.category}`}>
      <div className="card-visual">
        <div className="card-visual-top">
          <span>LAB {lab.number}</span>
          <span className="coming-soon">
            <i className={`dot ${lab.status === "available" ? "cyan" : ""}`} /> {lab.status === "available" ? "ブラウザ演習" : "準備中"}
          </span>
        </div>
        <PlantDiagram compact category={lab.category} />
        <span className="card-project">
          {lab.category === "water"
            ? "PROJECT AQUA"
            : lab.category === "power"
              ? "POWER SUBSTATION"
              : "RAILWAY OPERATIONS"}
        </span>
      </div>
      <div className="card-body">
        <div className="card-category">
          <Icon size={15} />
          <span>
            {lab.category === "water"
              ? "WATER TREATMENT"
              : lab.category === "power"
                ? "POWER SYSTEMS"
                : "RAILWAY SYSTEMS"}
          </span>
          <span className={`level level-${lab.category}`}>{lab.level}</span>
        </div>
        <h3>{lab.title}</h3>
        <p>{lab.description}</p>
        <div className="skill-tags">
          {lab.skills.slice(0, 3).map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
        <div className="card-footer">
          <span>
            <LockKeyhole size={12} /> シナリオを確認
          </span>
          <ArrowUpRight size={18} />
        </div>
      </div>
    </Link>
  );
}

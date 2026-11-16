import Link from "next/link";
import { ArrowRight, ArrowUpRight, Clock3, Droplets } from "lucide-react";
import type { Lab } from "@/lib/labs";
import { aquaScenario } from "@/lib/scenarios/aqua";
import { PlantDiagram } from "./plant-diagram";
export function LabCard({ lab }: { lab: Lab }) {
  const { red, blue, total } = aquaScenario.durationMinutes;
  const titleId = `lab-${lab.id}-title`;
  return (
    <article className="featured-lab" aria-labelledby={titleId}>
      <div className="featured-lab-visual">
        <div className="featured-lab-visual-top">
          <span>LAB {lab.number}</span>
          <span className="coming-soon">
            <i className="dot cyan" /> ブラウザ演習
          </span>
        </div>
        <PlantDiagram compact />
        <span className="featured-lab-project">{lab.name}</span>
      </div>
      <div className="featured-lab-body">
        <div className="card-category">
          <Droplets size={15} />
          <span>WATER TREATMENT</span>
          <span className="level">{lab.level}</span>
        </div>
        <h3 id={titleId}>{lab.title}</h3>
        <p>{lab.description}</p>
        <div className="skill-tags">
          {lab.skills.slice(0, 3).map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
        <p className="featured-lab-meta">
          <Clock3 size={13} />
          {`所要時間 約${total}分（調査 ${red}分 / 防御 ${blue}分）`}
        </p>
        <div className="featured-lab-actions">
          <Link
            className="button primary"
            href={`/labs/${lab.slug}/practice?start=1`}
          >
            演習を始める <ArrowRight size={15} />
          </Link>
          <Link className="button secondary" href={`/labs/${lab.slug}`}>
            シナリオ詳細を見る <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
    </article>
  );
}

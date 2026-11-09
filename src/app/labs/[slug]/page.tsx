import { connection } from "next/server";
import { getScenarioMode } from "@/lib/scenarios/runtime.server";
import { notFound } from "next/navigation";
import { getLab, labs } from "@/lib/labs";
import { LabDetail } from "@/components/lab-detail";
export function generateStaticParams() {
  return labs.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lab = getLab(slug);
  return { title: lab?.title ?? "ラボが見つかりません" };
}
export default async function LabPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lab = getLab(slug);
  if (!lab) notFound();
  await connection();
  return <LabDetail lab={lab} exerciseEnabled={lab.id === "water-01" && getScenarioMode() === "simulator"} />;
}

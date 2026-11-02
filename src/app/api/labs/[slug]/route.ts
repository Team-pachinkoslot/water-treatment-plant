import { getLab } from "@/lib/labs";
import { runtimeProvider } from "@/lib/runtime";
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const lab = getLab(slug);
  if (!lab)
    return Response.json(
      {
        error: {
          code: "LAB_NOT_FOUND",
          message: "指定されたラボは見つかりません。",
        },
      },
      { status: 404 },
    );
  return Response.json({ lab, dataSource: "mock", runtime: runtimeProvider });
}

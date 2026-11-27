import { notFound } from "next/navigation";
import ReaderView from "@/components/ReaderView";
import { parseSourceRoute } from "@/lib/sources";

export const instant = false;

type Props = {
  params: Promise<{ source: string; id: string[] }>;
  searchParams: Promise<{ h?: string | string[] }>;
};

export default async function ReadPage({ params, searchParams }: Props) {
  const { source, id } = await params;
  const ref = parseSourceRoute(source, id);
  if (!ref) notFound();

  const query = await searchParams;
  const handoffSlug = typeof query.h === "string" ? query.h : undefined;

  return (
    <ReaderView
      key={`${ref.source}:${ref.id}:${handoffSlug ?? ""}`}
      source={ref.source}
      sourceId={ref.id}
      handoffSlug={handoffSlug}
    />
  );
}

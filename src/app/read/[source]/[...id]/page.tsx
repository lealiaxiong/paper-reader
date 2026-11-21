import { notFound } from "next/navigation";
import ReaderView from "@/components/ReaderView";
import { parseSourceRoute } from "@/lib/sources";

export const instant = false;

type Props = {
  params: Promise<{ source: string; id: string[] }>;
};

export default async function ReadPage({ params }: Props) {
  const { source, id } = await params;
  const ref = parseSourceRoute(source, id);
  if (!ref) notFound();

  return (
    <ReaderView
      key={`${ref.source}:${ref.id}`}
      source={ref.source}
      sourceId={ref.id}
    />
  );
}

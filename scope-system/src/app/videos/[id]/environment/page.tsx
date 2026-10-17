import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/environment";
import { EnvironmentWorkspace } from "@/components/video/EnvironmentWorkspace";

export default async function EnvironmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await createClient();
  const { data: video } = await db.from("videos").select("id,title,storage_path").eq("id", id).maybeSingle();
  if (!video) notFound();
  return <div className="p-8 max-w-7xl mx-auto space-y-6" dir="rtl" lang="he">
    <header dir="rtl" className="space-y-3">
      <Link href={`/videos/${id}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowRight size={15} aria-hidden />חזרה לשיעור</Link>
      <h1 className="text-2xl font-bold tracking-tight">סביבת הלמידה · <span dir="auto">{video.title}</span></h1>
    </header>
    <EnvironmentWorkspace key={id} videoId={id} videoUrl={video.storage_path} />
  </div>;
}

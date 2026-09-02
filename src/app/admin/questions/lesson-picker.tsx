"use client";

import { useRouter } from "next/navigation";

export function LessonPicker({ lessons, selected }: { lessons: { slug: string; title: string }[]; selected?: string }) {
  const router = useRouter();
  return (
    <select
      defaultValue={selected}
      onChange={(e) => router.push(`/admin/questions?lesson=${e.target.value}`)}
      className="mb-6 rounded-lg border border-navy-200 px-3 py-2 text-sm"
    >
      {lessons.map((l) => (
        <option key={l.slug} value={l.slug}>
          {l.title}
        </option>
      ))}
    </select>
  );
}

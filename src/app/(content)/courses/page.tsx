import { permanentRedirect } from "next/navigation";

/**
 * The course list merged into the roadmap, which now hosts both renderings of the same tree.
 * Lesson pages at `/courses/[slug]` are unaffected — only this index moved.
 */
export default function CoursesPage() {
  permanentRedirect("/roadmap?view=courses");
}

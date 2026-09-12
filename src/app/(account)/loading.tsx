import { PageSkeleton } from "@/components/page-skeleton";

/** Shown under the nav while a buyer page waits on its own rows. The header stays put. */
export default function Loading() {
  return <PageSkeleton />;
}

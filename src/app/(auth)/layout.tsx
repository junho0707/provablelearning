import { ServerNav } from '@/components/server-nav';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServerNav userRole={null} />
      {children}
    </>
  );
}

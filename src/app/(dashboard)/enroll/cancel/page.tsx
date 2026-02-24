import Link from 'next/link';

export default function EnrollCancelPage() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <h1 className="text-2xl font-bold mb-4">Enrollment Canceled</h1>
      <p className="text-gray-600 mb-8 text-center max-w-md">
        Your payment was not completed. Your reserved seat will be released
        shortly. You can try enrolling again.
      </p>
      <Link
        href="/enroll"
        className="rounded bg-black px-6 py-3 text-white font-medium hover:bg-gray-800"
      >
        Browse Courses
      </Link>
    </div>
  );
}

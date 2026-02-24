import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b">
        <span className="font-bold text-lg">ProvableLearning</span>
        <div className="flex gap-3">
          <Link
            href="/offerings"
            className="text-sm font-medium text-gray-600 hover:text-black px-3 py-2"
          >
            View Courses
          </Link>
          <Link
            href="/book"
            className="text-sm font-medium text-gray-600 hover:text-black px-3 py-2"
          >
            Book a Meeting
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-gray-600 hover:text-black px-3 py-2"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-black px-4 py-2 text-white text-sm font-medium hover:bg-gray-800"
          >
            Sign Up
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 py-24 max-w-3xl mx-auto text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          SAT Prep That Proves Results
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Small-group and 1-on-1 tutoring built on structured methodology, not guesswork.
          Every student gets a clear path to a higher score.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/offerings"
            className="rounded-md bg-black px-6 py-3 text-white font-medium hover:bg-gray-800"
          >
            View Courses
          </Link>
          <Link
            href="/signup"
            className="rounded-md border border-black px-6 py-3 font-medium hover:bg-gray-50"
          >
            Get Started
          </Link>
        </div>
      </section>

      {/* Teaching Philosophy */}
      <section className="px-6 py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">How We Teach</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">1</div>
              <h3 className="font-semibold text-lg mb-2">Diagnostic-First</h3>
              <p className="text-gray-600 text-sm">
                We identify exact weak points before teaching a single lesson.
                No wasted time on what students already know.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">2</div>
              <h3 className="font-semibold text-lg mb-2">Structured Courses</h3>
              <p className="text-gray-600 text-sm">
                4-week intensive courses with 8 sessions each.
                Focused on Digital SAT Reading & Writing or Math.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">3</div>
              <h3 className="font-semibold text-lg mb-2">Proven Tracking</h3>
              <p className="text-gray-600 text-sm">
                Every session logged. Attendance, homework, and progress
                visible to students and parents in real time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Group Sizes */}
      <section className="px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Find Your Fit</h2>
          <p className="text-gray-600 text-center mb-12 max-w-lg mx-auto">
            From intensive 1-on-1 to affordable large groups — choose the format that matches your goals and budget.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { name: '1-on-1', size: '1 student', price: '$800', desc: 'Maximum personalization. Your pace, your focus areas.' },
              { name: 'Small Group', size: '2–4 students', price: '$100', desc: 'Close-knit learning with plenty of individual attention.' },
              { name: 'Medium Group', size: '5–9 students', price: '$50', desc: 'Collaborative environment with targeted instruction.' },
              { name: 'Large Group', size: '10–30 students', price: '$20', desc: 'Accessible prep with structured curriculum.' },
            ].map((tier) => (
              <div key={tier.name} className="border rounded-lg p-6">
                <h3 className="font-semibold text-lg">{tier.name}</h3>
                <p className="text-sm text-gray-500 mb-3">{tier.size}</p>
                <p className="text-2xl font-bold mb-3">{tier.price}</p>
                <p className="text-sm text-gray-600">{tier.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-4">
            Prices shown per 4-week course (8 sessions).
          </p>
        </div>
      </section>

      {/* Credentials */}
      <section className="px-6 py-16 bg-gray-50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">Your Tutor</h2>
          <p className="text-gray-600 mb-8">
            With a background in mathematics and education, your tutor brings
            deep expertise in the Digital SAT format. Every lesson is designed
            around College Board standards and real exam patterns — not generic worksheets.
          </p>
          <div className="grid sm:grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-3xl font-bold">4 wk</p>
              <p className="text-sm text-gray-500">Focused courses</p>
            </div>
            <div>
              <p className="text-3xl font-bold">8</p>
              <p className="text-sm text-gray-500">Sessions per course</p>
            </div>
            <div>
              <p className="text-3xl font-bold">2x/wk</p>
              <p className="text-sm text-gray-500">Meeting frequency</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Start?</h2>
        <p className="text-gray-600 mb-8 max-w-lg mx-auto">
          Browse upcoming courses, pick a group size, and enroll in minutes.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/offerings"
            className="rounded-md bg-black px-6 py-3 text-white font-medium hover:bg-gray-800"
          >
            View Courses
          </Link>
          <Link
            href="/signup"
            className="rounded-md border border-black px-6 py-3 font-medium hover:bg-gray-50"
          >
            Create Account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-8 text-center text-sm text-gray-500">
        <p>&copy; {new Date().getFullYear()} ProvableLearning. All rights reserved.</p>
      </footer>
    </main>
  );
}

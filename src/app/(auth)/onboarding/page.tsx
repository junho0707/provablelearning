'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function OnboardingPage() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [role, setRole] = useState<'parent' | 'student'>('student');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [existingRole, setExistingRole] = useState<string | null>(null);

  useEffect(() => {
    async function checkExisting() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('users')
        .select('role, full_name, phone')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        setExistingRole(profile.role);
        setRole(profile.role as 'parent' | 'student');
        if (profile.full_name) setFullName(profile.full_name);
        if (profile.phone) setPhone(profile.phone);
      } else {
        const name = user.user_metadata?.full_name || user.user_metadata?.name || '';
        if (name) setFullName(name);
      }
    }
    checkExisting();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    const effectiveRole = existingRole || role;

    if (phone) {
      const digitsOnly = phone.replace(/\D/g, '');
      if (digitsOnly.length < 10) {
        setError('Please enter a valid phone number (at least 10 digits).');
        setLoading(false);
        return;
      }
    }

    if (effectiveRole === 'student' && !gradeLevel) {
      setError('Please select your grade level.');
      setLoading(false);
      return;
    }

    await supabase.auth.updateUser({
      data: { role: effectiveRole, full_name: fullName, phone: phone || null },
    });

    const { error: upsertError } = await supabase.from('users').upsert({
      id: user.id,
      role: effectiveRole,
      full_name: fullName || user.user_metadata?.full_name || '',
      phone: phone || null,
    });

    if (upsertError) {
      setError(upsertError.message);
      setLoading(false);
      return;
    }

    if (effectiveRole === 'student') {
      const { data: existingStudent } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existingStudent) {
        let studentError;
        const { error: err1 } = await supabase.from('students').insert({
          user_id: user.id,
          parent_id: null,
          active_status: 'active',
          email: user.email?.toLowerCase() || null,
          full_name: fullName || user.user_metadata?.full_name || '',
          grade_level: parseInt(gradeLevel, 10),
        });
        if (err1?.message?.includes('column') && err1?.message?.includes('does not exist')) {
          const { error: err2 } = await supabase.from('students').insert({
            user_id: user.id,
            parent_id: null,
            active_status: 'active',
            grade_level: parseInt(gradeLevel, 10),
          });
          studentError = err2;
        } else {
          studentError = err1;
        }

        if (studentError) {
          setError(studentError.message);
          setLoading(false);
          return;
        }
      }
    }

    window.location.href = `/${effectiveRole}`;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-50 p-8">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-white p-8 shadow-sm">
        <div className="text-center">
          <Link href="/" className="text-lg font-semibold text-navy-900">
            Provable<span className="text-gold-500">Learning</span>
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-navy-900">
            {existingRole ? 'Complete Your Profile' : 'Set Up Your Profile'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {existingRole
              ? `Finishing setup for your ${existingRole} account.`
              : 'Tell us a bit about yourself'}
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-error-light px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!existingRole && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">I am a...</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setRole('parent')}
                  className={`flex-1 rounded-lg py-3 text-sm font-semibold transition ${
                    role === 'parent'
                      ? 'bg-navy-900 text-white'
                      : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Parent
                </button>
                <button
                  type="button"
                  onClick={() => setRole('student')}
                  className={`flex-1 rounded-lg py-3 text-sm font-semibold transition ${
                    role === 'student'
                      ? 'bg-navy-900 text-white'
                      : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Student
                </button>
              </div>
              <p className="mt-2 text-center text-xs text-slate-400">
                {role === 'parent'
                  ? 'You will be able to enroll your students in Digital SAT prep.'
                  : 'You will enroll yourself directly in Digital SAT prep.'}
              </p>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Full Name</label>
            <input
              type="text"
              placeholder="Your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Phone Number <span className="text-slate-400">(optional)</span></label>
            <input
              type="tel"
              placeholder="(555) 123-4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20"
            />
          </div>

          {role === 'student' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Grade Level</label>
              <select
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-700 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20"
              >
                <option value="">Select your grade</option>
                {[6, 7, 8, 9, 10, 11, 12].map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-navy-900 py-3 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </main>
  );
}

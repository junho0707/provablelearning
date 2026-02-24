'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function OnboardingPage() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [role, setRole] = useState<'parent' | 'student'>('student');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [existingRole, setExistingRole] = useState<string | null>(null);

  // On mount, check if user already has a profile (re-entry case)
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
        // Pre-fill from Google metadata
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

    // Use existing role if re-entering (role is immutable)
    const effectiveRole = existingRole || role;

    // Validate phone format (US: 10+ digits)
    if (phone) {
      const digitsOnly = phone.replace(/\D/g, '');
      if (digitsOnly.length < 10) {
        setError('Please enter a valid phone number (at least 10 digits).');
        setLoading(false);
        return;
      }
    }

    // Phone required for parents and independent students
    if (!phone) {
      setError('Phone number is required.');
      setLoading(false);
      return;
    }

    // Grade required for independent students
    if (effectiveRole === 'student' && !gradeLevel) {
      setError('Please select your grade level.');
      setLoading(false);
      return;
    }

    // Update auth user metadata
    await supabase.auth.updateUser({
      data: { role: effectiveRole, full_name: fullName, phone: phone || null },
    });

    // Create/update public.users row via upsert
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
      // Independent student: create students row with email + name + grade
      // Check if a student record already exists for this user
      const { data: existingStudent } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existingStudent) {
        // Try insert with full schema (email, full_name from migration 00046)
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
          // Migration 00046 not applied — insert without email/full_name columns
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
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold text-center">
          {existingRole ? 'Complete Your Profile' : 'Create Your Profile'}
        </h1>
        <p className="text-center text-sm text-gray-600">
          {role === 'parent'
            ? 'Sign up as a parent to enroll your children in SAT prep courses.'
            : 'Sign up as a student to enroll yourself in SAT prep courses.'}
        </p>
        {error && <p className="text-red-600 text-sm text-center">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!existingRole && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRole('parent')}
                className={`flex-1 rounded border py-2 text-sm font-medium ${role === 'parent' ? 'bg-black text-white' : ''}`}
              >
                Parent
              </button>
              <button
                type="button"
                onClick={() => setRole('student')}
                className={`flex-1 rounded border py-2 text-sm font-medium ${role === 'student' ? 'bg-black text-white' : ''}`}
              >
                Student
              </button>
            </div>
          )}

          <input
            type="text"
            placeholder="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="w-full rounded border px-3 py-2"
          />

          <input
            type="tel"
            placeholder="Phone Number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            className="w-full rounded border px-3 py-2"
          />

          {role === 'student' && (
            <select
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              required
              className="w-full rounded border px-3 py-2"
            >
              <option value="">Select your grade</option>
              {[6, 7, 8, 9, 10, 11, 12].map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-black py-2 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </main>
  );
}

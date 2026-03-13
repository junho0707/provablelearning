'use client';

import { useState, Children } from 'react';

interface StudentTabInfo {
  id: string;
  name: string;
  classCount: number;
  gradeLevel: number | null;
}

interface StudentTabsProps {
  students: StudentTabInfo[];
  children: React.ReactNode;
}

export function StudentTabs({ students, children }: StudentTabsProps) {
  const [selected, setSelected] = useState(0);

  if (students.length <= 1) {
    // Single student or no students — no tabs needed
    return <>{children}</>;
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 px-3 sm:px-6">
        {students.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setSelected(i)}
            className={`px-4 py-3 text-sm font-medium transition-colors relative ${
              selected === i
                ? 'text-navy-900'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {s.name}
            {selected === i && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-500 rounded-t" />
            )}
          </button>
        ))}
      </div>

      {/* Selected student subtitle */}
      <div className="px-3 py-2 flex items-center gap-3 text-xs text-slate-400 border-b border-slate-50 sm:px-6">
        <span>Grade {students[selected]?.gradeLevel || 'N/A'}</span>
        <span className="w-1 h-1 rounded-full bg-slate-300" />
        <span>{students[selected]?.classCount} class{students[selected]?.classCount !== 1 ? 'es' : ''}</span>
      </div>

      {/* Student cards — show/hide */}
      {Children.toArray(children).map((child, i) => (
        <div key={students[i]?.id || i} className={selected === i ? '' : 'hidden'}>
          {child}
        </div>
      ))}
    </div>
  );
}

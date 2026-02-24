'use client';

import { useState } from 'react';

export default function AdminExportPage() {
  const [loading, setLoading] = useState(false);

  async function handleExport(type: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/export?type=${type}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Data Export</h1>
      <div className="space-y-3">
        {['enrollments', 'performance_logs', 'credits', 'students'].map((type) => (
          <button
            key={type}
            onClick={() => handleExport(type)}
            disabled={loading}
            className="block w-full max-w-xs rounded border px-4 py-3 text-left hover:bg-gray-50 disabled:opacity-50"
          >
            <p className="font-medium capitalize">{type.replace('_', ' ')}</p>
            <p className="text-sm text-gray-500">Download as CSV</p>
          </button>
        ))}
      </div>
    </div>
  );
}

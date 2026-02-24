'use client';

import { linkStudentToParent } from './actions';

interface Props {
  studentId: string;
  currentParentId: string | null;
  parents: Array<{ id: string; full_name: string }>;
}

export default function LinkStudentForm({ studentId, currentParentId, parents }: Props) {
  async function handleChange(formData: FormData) {
    await linkStudentToParent(formData);
  }

  return (
    <form action={handleChange} className="flex gap-2">
      <input type="hidden" name="student_id" value={studentId} />
      <select
        name="parent_id"
        defaultValue={currentParentId || ''}
        className="rounded border px-2 py-1 text-sm"
      >
        <option value="">None (Independent)</option>
        {parents.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200"
      >
        Save
      </button>
    </form>
  );
}

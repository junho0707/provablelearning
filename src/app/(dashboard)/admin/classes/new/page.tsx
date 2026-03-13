import NewClassForm from './form';

export default async function NewClassPage() {
  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">New Class</h1>
        <p className="text-slate-500">Create a new class with schedule and capacity.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <NewClassForm />
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDiagnostic } from "@/lib/admin/diagnostics";

const inputClass = "rounded-lg border border-navy-200 px-3 py-2 text-sm";

export function CreateDiagnostic() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<"test_prep" | "math_diagnostic">("test_prep");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("sat");
  const [classLevel, setClassLevel] = useState("");

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createDiagnostic({ kind, name, slug, classLevel });
      if (!result.ok) return setError(result.message);
      setName("");
      setClassLevel("");
      router.refresh();
    });
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-bold text-navy-900">New diagnostic</h2>
      <div className="flex flex-wrap gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "test_prep" | "math_diagnostic")}
          className={inputClass}
        >
          <option value="test_prep">Test prep</option>
          <option value="math_diagnostic">Math class level</option>
        </select>

        {kind === "test_prep" ? (
          <select value={slug} onChange={(e) => setSlug(e.target.value)} className={inputClass}>
            <option value="psat">PSAT</option>
            <option value="sat">SAT</option>
            <option value="act">ACT</option>
          </select>
        ) : (
          <input
            value={classLevel}
            onChange={(e) => setClassLevel(e.target.value)}
            placeholder="Class level, e.g. Algebra 1"
            className={inputClass}
          />
        )}

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name students see"
          className={inputClass}
        />
        <button
          disabled={pending || !name.trim()}
          onClick={create}
          className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Create
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-[var(--error)]">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-navy-500">
        A class level is matched loosely against what the student types — case and spacing are
        ignored, nothing else is. A level nobody matches simply never gets served.
      </p>
    </div>
  );
}

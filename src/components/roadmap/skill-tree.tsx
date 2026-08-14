"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import type { LaidOutNode, Layout } from "@/lib/content/layout";

/**
 * The public skill-tree map. Layout is computed at build time (`lib/content/layout.ts`); this
 * component only pans, zooms, selects, and highlights — so the SVG is identical on every load and
 * the first paint needs no measurement pass.
 */

const ZOOM = { min: 0.25, max: 2.2, step: 1.25 };
const DEFAULT_SCALE = 0.62;

/** Greedy two-line wrap. Titles are short and the font is fixed, so character count is close enough. */
function wrap(title: string, perLine: number): string[] {
  const words = title.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > perLine) {
      lines.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(line);
  return lines.length <= 2 ? lines : [lines[0], `${lines.slice(1).join(" ").slice(0, perLine - 1)}…`];
}

/** Lesson route. A literal, not a prop — a function can't cross the server/client boundary. */
const lessonHref = (id: string) => `/courses/${id}`;

export function SkillTree({ layout }: { layout: Layout }) {
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [pan, setPan] = useState({ x: 0, y: 24 });
  const [selected, setSelected] = useState<LaidOutNode | null>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const moved = useRef(false);
  // The canvas centres the map with flexbox and scales from its top centre, so the default view
  // needs no measurement — pan (0,0) already puts the trunk down the middle at the top.

  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout.nodes]);
  const idOfKey = useMemo(() => new Map(layout.nodes.map((n) => [n.key, n.id])), [layout.nodes]);

  /** The selected node plus everything it transitively depends on — lit up, the rest dimmed. */
  const chain = useMemo(() => {
    if (!selected) return null;
    const seen = new Set<string>([selected.id]);
    const queue = [...selected.prereqs];
    while (queue.length) {
      const id = queue.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(...(byId.get(id)?.prereqs ?? []));
    }
    return seen;
  }, [selected, byId]);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    moved.current = false;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;
    setPan({ x: drag.current.panX + dx, y: drag.current.panY + dy });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const zoomBy = useCallback((factor: number) => {
    setScale((s) => Math.min(ZOOM.max, Math.max(ZOOM.min, s * factor)));
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return; // plain scroll still scrolls the page
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  };

  const reset = () => {
    setScale(DEFAULT_SCALE);
    setPan({ x: 0, y: 24 });
    setSelected(null);
  };

  return (
    <div className="relative">
      <div
        className="relative flex h-[640px] w-full cursor-grab justify-center overflow-hidden rounded-2xl border border-navy-800 bg-navy-950 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,_var(--navy-800)_0%,_transparent_60%)]" />

        <svg
          className="shrink-0 touch-none select-none"
          width={layout.width}
          height={layout.height}
          viewBox={`${layout.minX} ${layout.minY} ${layout.width} ${layout.height}`}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: "50% 0",
          }}
          role="img"
          aria-label="Math curriculum map"
        >
          <defs>
            <marker
              id="prereq-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--gold-500)" />
            </marker>
          </defs>

          {/* Regions: each course as its own cluster */}
          <g>
            {layout.islands.map((i) => (
              <g key={i.id} opacity={chain ? 0.4 : 1}>
                <rect
                  x={i.x}
                  y={i.y}
                  width={i.w}
                  height={i.h}
                  rx={20}
                  fill={i.planned ? "rgba(255,255,255,0.012)" : "rgba(255,255,255,0.028)"}
                  stroke={i.planned ? "var(--navy-800)" : "var(--navy-700)"}
                  strokeWidth={1.5}
                  strokeDasharray={i.planned ? "8 7" : undefined}
                />
                <text
                  x={i.x + 22}
                  y={i.y + 27}
                  fontSize={15}
                  fontWeight={800}
                  letterSpacing={1.4}
                  fill={i.planned ? "var(--navy-500)" : "var(--gold-400)"}
                >
                  {i.title.toUpperCase()}
                </text>
                <text
                  x={i.x + i.w - 22}
                  y={i.y + 27}
                  textAnchor="end"
                  fontSize={11}
                  fill="var(--navy-500)"
                >
                  {i.planned ? "COMING SOON" : `${i.lessonCount} lesson${i.lessonCount === 1 ? "" : "s"}`}
                </text>
              </g>
            ))}
          </g>

          {/* Containment: the trunk */}
          <g fill="none" strokeLinecap="round">
            {layout.edges
              .filter((e) => e.kind === "branch")
              .map((e) => (
                <path
                  key={`${e.kind}-${e.from}-${e.to}`}
                  d={e.d}
                  stroke="var(--navy-700)"
                  strokeWidth={2}
                  opacity={chain ? 0.35 : 0.85}
                />
              ))}
          </g>

          {/* Prerequisites: cross-links, drawn on top */}
          <g fill="none" strokeLinecap="round">
            {layout.edges
              .filter((e) => e.kind === "prereq")
              .map((e) => {
                const lit =
                  !chain ||
                  (chain.has(idOfKey.get(e.from) ?? "") && chain.has(idOfKey.get(e.to) ?? ""));
                return (
                  <path
                    key={`${e.kind}-${e.from}-${e.to}`}
                    d={e.d}
                    stroke="var(--gold-500)"
                    strokeWidth={lit ? 2 : 1.5}
                    strokeDasharray="7 6"
                    markerEnd="url(#prereq-arrow)"
                    opacity={lit ? 0.9 : 0.15}
                  />
                );
              })}
          </g>

          {layout.nodes.map((n) => (
            <TreeNodeShape
              key={n.key}
              node={n}
              dimmed={!!chain && !chain.has(n.id)}
              selected={selected?.key === n.key}
              onSelect={() => {
                if (!moved.current) setSelected((cur) => (cur?.key === n.key ? null : n));
              }}
            />
          ))}
        </svg>

        <Controls onZoomIn={() => zoomBy(ZOOM.step)} onZoomOut={() => zoomBy(1 / ZOOM.step)} onReset={reset} />
        <Legend />
      </div>

      {selected && <DetailPanel node={selected} byId={byId} onClose={() => setSelected(null)} />}
    </div>
  );
}

function TreeNodeShape({
  node,
  dimmed,
  selected,
  onSelect,
}: {
  node: LaidOutNode;
  dimmed: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const isLesson = node.kind === "lesson";
  const app = isLesson && node.role === "application";
  const lines = wrap(node.title, isLesson ? 24 : 20);

  const fill = node.planned
    ? "var(--navy-900)"
    : isLesson
      ? app
        ? "#1a1b2e"
        : "var(--navy-800)"
      : "var(--navy-900)";
  const stroke = node.planned
    ? "var(--navy-700)"
    : selected
      ? "var(--gold-400)"
      : isLesson
        ? app
          ? "var(--gold-600)"
          : "var(--navy-500)"
        : "var(--navy-600)";

  return (
    <g
      transform={`translate(${node.x - node.w / 2}, ${node.y - node.h / 2})`}
      opacity={dimmed ? 0.22 : 1}
      onClick={onSelect}
      className="cursor-pointer"
      tabIndex={0}
      role="button"
      aria-label={node.title}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <rect
        width={node.w}
        height={node.h}
        rx={isLesson ? 10 : 24}
        fill={fill}
        stroke={stroke}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeDasharray={node.planned ? "5 5" : undefined}
      />
      {selected && (
        <rect
          width={node.w}
          height={node.h}
          rx={isLesson ? 10 : 24}
          fill="none"
          stroke="var(--gold-400)"
          strokeWidth={7}
          opacity={0.18}
        />
      )}

      {node.number != null && !node.planned && (
        <>
          <circle cx={16} cy={16} r={11} fill="var(--gold-500)" />
          <text x={16} y={20} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--navy-950)">
            {node.number}
          </text>
        </>
      )}

      {node.planned && (
        <text x={node.w - 14} y={19} textAnchor="end" fontSize={11} fill="var(--navy-400)">
          🔒
        </text>
      )}

      <text
        x={node.w / 2}
        y={node.h / 2 - (lines.length > 1 ? 4 : -4)}
        textAnchor="middle"
        fontSize={isLesson ? 13 : 13.5}
        fontWeight={isLesson ? 600 : 700}
        fill={node.planned ? "var(--navy-400)" : isLesson ? "#e8eef7" : "var(--gold-300)"}
        letterSpacing={isLesson ? 0 : 0.4}
      >
        {lines.map((l, i) => (
          <tspan key={l + i} x={node.w / 2} dy={i === 0 ? 0 : 15}>
            {l}
          </tspan>
        ))}
      </text>

      {app && !node.planned && (
        <text x={node.w / 2} y={node.h - 9} textAnchor="middle" fontSize={9.5} fill="var(--gold-400)">
          ▸ APPLIES
        </text>
      )}
    </g>
  );
}

function Controls({
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  const btn =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-navy-700 bg-navy-900/90 text-navy-100 hover:border-gold-500 hover:text-gold-400";
  return (
    <div className="absolute right-4 top-4 flex flex-col gap-2">
      <button type="button" className={btn} onClick={onZoomIn} aria-label="Zoom in">
        +
      </button>
      <button type="button" className={btn} onClick={onZoomOut} aria-label="Zoom out">
        −
      </button>
      <button type="button" className={btn} onClick={onReset} aria-label="Reset view">
        ⤢
      </button>
    </div>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-1.5 rounded-lg border border-navy-800 bg-navy-950/85 px-3 py-2.5 text-[11px] text-navy-300">
      <span className="flex items-center gap-2">
        <svg width="26" height="6">
          <line x1="0" y1="3" x2="26" y2="3" stroke="var(--navy-600)" strokeWidth="2" />
        </svg>
        contains
      </span>
      <span className="flex items-center gap-2">
        <svg width="26" height="6">
          <line x1="0" y1="3" x2="26" y2="3" stroke="var(--gold-500)" strokeWidth="2" strokeDasharray="5 4" />
        </svg>
        learn first
      </span>
      <span className="text-navy-500">drag to pan · ⌘/ctrl + scroll to zoom</span>
    </div>
  );
}

function DetailPanel({
  node,
  byId,
  onClose,
}: {
  node: LaidOutNode;
  byId: Map<string, LaidOutNode>;
  onClose: () => void;
}) {
  const prereqs = node.prereqs.map((p) => byId.get(p)).filter(Boolean) as LaidOutNode[];

  return (
    <aside className="mt-4 rounded-2xl border border-navy-100 bg-white p-5 shadow-[var(--shadow-card)] sm:absolute sm:right-4 sm:top-4 sm:mt-0 sm:w-[320px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          {node.trail.length > 0 && (
            <p className="mb-1 text-[11px] uppercase tracking-wide text-navy-400">
              {node.trail.join(" › ")}
            </p>
          )}
          <h3 className="text-lg font-bold leading-tight text-navy-950">{node.title}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-navy-400 hover:text-navy-700"
        >
          ✕
        </button>
      </div>

      <p className="mt-2 text-sm text-navy-600">
        {node.planned
          ? "Mapped, not built yet — this part of the path is coming."
          : node.kind === "concept"
            ? "A topic that groups the lessons beneath it."
            : node.hasContent
              ? `Lesson ${node.number ?? ""} · ${node.role === "application" ? "applies earlier lessons" : "core lesson"}`
              : "Lesson in progress."}
      </p>

      {prereqs.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-navy-400">Learn first</p>
          <ul className="space-y-1 text-sm text-navy-700">
            {prereqs.map((p) => (
              <li key={p.id}>· {p.title}</li>
            ))}
          </ul>
        </div>
      )}

      {node.kind === "lesson" && node.hasContent && !node.planned && (
        <Link
          href={lessonHref(node.id)}
          className="mt-5 block rounded-lg bg-gold-500 px-4 py-2.5 text-center font-semibold text-navy-950 hover:bg-gold-400"
        >
          Open lesson
        </Link>
      )}
    </aside>
  );
}

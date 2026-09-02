"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LaidOutNode, Layout } from "@/lib/content/layout";

/**
 * The public skill-tree map. Layout is computed at build time (`lib/content/layout.ts`); this
 * component only pans, zooms, and selects — so the SVG is identical on every load and the first
 * paint needs no measurement pass.
 *
 * Three rules hold the visual language together:
 * - **Containment is nesting.** A concept is a box that physically holds its children; nothing is
 *   drawn to say so. Rank is carried by type size and one step of lightness per level.
 * - **Colour means attention.** Everything structural is the navy family, one step lighter per level
 *   of nesting; the two relationship overlays are the only other colours on the map, and only one
 *   of them is ever on at a time.
 * - **One control per job.** Cards are clickable and open a lesson; groups are scenery. The lines on
 *   screen are the legend's business alone, so what is drawn never depends on what is selected.
 */

const ZOOM = { min: 0.14, max: 2.2, step: 1.25 };
/** The view the map opens at, and the one the reset control and the `0` key return to. */
const HOME = { scale: 0.36, x: 0, y: 24 };

/** Which relationship the map is currently drawing. Exclusive — two thickets at once read as none. */
type Overlay = "none" | "prereq" | "order";

/** Lesson route. A literal, not a prop — a function can't cross the server/client boundary. */
const lessonHref = (id: string) => `/courses/${id}`;

/**
 * One step lighter per level of nesting — a blue-tinted lift rather than plain white, so the whole
 * map stays inside the navy family instead of going grey as it deepens.
 */
const containerFill = (depth: number) => `rgba(93,148,214,${0.05 + Math.min(depth, 5) * 0.035})`;
const containerStroke = (depth: number) => `rgba(123,163,212,${0.13 + Math.min(depth, 5) * 0.02})`;

/** Title contrast falls with rank, matching the type scale rather than fighting it. */
const TITLE_INK = ["#eaf2ff", "#cfe0f5", "#aec8e6", "#93b2d4", "#829fc2", "#7794b6"];
const titleInk = (depth: number) => TITLE_INK[Math.min(depth, TITLE_INK.length - 1)];

/** Gold reads as "mind this"; the pale blue reads as a route you follow. */
const OVERLAY_INK = { prereq: "var(--gold-500)", order: "var(--navy-200)" } as const;

export function SkillTree({ layout }: { layout: Layout }) {
  const [view, setView] = useState(HOME);
  const [selected, setSelected] = useState<LaidOutNode | null>(null);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const moved = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout.nodes]);

  /** Position in the teaching sequence, 1-based — the step number shown in course-order mode. */
  const stepOfKey = useMemo(() => new Map(layout.order.map((k, i) => [k, i + 1])), [layout.order]);

  // Left button and middle button both drag the map — middle-drag is the habit people bring from
  // every other pannable canvas. Right button is left to the context menu.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    drag.current = { x: e.clientX, y: e.clientY, panX: view.x, panY: view.y };
    moved.current = false;
    // Capture on the element pressed, not the canvas: capturing on the canvas would retarget the
    // trailing `click` to it as well, and a card would never register a click again.
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    // Read the gesture out of the ref *before* the updater, which React may run after the pointer
    // has already come up and cleared it.
    const from = drag.current;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;
    setView((v) => ({ ...v, x: from.panX + dx, y: from.panY + dy }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  /**
   * Zooms about a fixed point — `at` is in canvas coordinates relative to the transform origin (the
   * canvas's top centre). Solving for the pan that keeps that point still is what makes the map grow
   * *under the pointer* instead of sliding out from under it.
   */
  const zoomAt = useCallback((factor: number, at: { x: number; y: number }) => {
    setView((v) => {
      const scale = Math.min(ZOOM.max, Math.max(ZOOM.min, v.scale * factor));
      const k = scale / v.scale;
      return { scale, x: at.x - k * (at.x - v.x), y: at.y - k * (at.y - v.y) };
    });
  }, []);

  /** The middle of the visible canvas — where the buttons and keyboard zoom from. */
  const viewportCentre = useCallback(() => {
    const r = canvasRef.current?.getBoundingClientRect();
    return { x: 0, y: (r?.height ?? 0) / 2 };
  }, []);

  const zoomBy = useCallback(
    (factor: number) => zoomAt(factor, viewportCentre()),
    [zoomAt, viewportCentre],
  );

  // Wheel and trackpad zoom the map. React attaches `wheel` passively, so `preventDefault` there is
  // ignored and the page would scroll underneath — hence the native listener.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      // Lines and pages come in far coarser than pixels; normalise before scaling.
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1);
      zoomAt(Math.exp(-dy * 0.002), {
        x: e.clientX - r.left - r.width / 2,
        y: e.clientY - r.top,
      });
    };
    // A middle-button press otherwise opens the browser's own autoscroll, which swallows the drag
    // and scrolls the page instead of panning the map. Cancelling the default on mousedown stops it
    // starting; cancelling auxclick stops the click that ends the gesture from doing anything else.
    const swallowMiddle = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("mousedown", swallowMiddle);
    el.addEventListener("auxclick", swallowMiddle);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", swallowMiddle);
      el.removeEventListener("auxclick", swallowMiddle);
    };
  }, [zoomAt]);

  const reset = useCallback(() => {
    setView(HOME);
    setSelected(null);
  }, []);

  /** Everything the wheel and the drag do, reachable from the keyboard. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 160 : 60;
    const pan = (x: number, y: number) => setView((v) => ({ ...v, x: v.x + x, y: v.y + y }));
    switch (e.key) {
      case "+":
      case "=":
        zoomBy(ZOOM.step);
        break;
      case "-":
      case "_":
        zoomBy(1 / ZOOM.step);
        break;
      case "0":
        reset();
        break;
      case "ArrowLeft":
        pan(step, 0);
        break;
      case "ArrowRight":
        pan(-step, 0);
        break;
      case "ArrowUp":
        pan(0, step);
        break;
      case "ArrowDown":
        pan(0, -step);
        break;
      case "Escape":
        setSelected(null);
        break;
      default:
        return; // anything else — including Tab onto the cards — is left alone
    }
    e.preventDefault();
  };

  // Real fullscreen, not just a recentre. The wrapper goes fullscreen rather than the canvas so the
  // controls, legend, and detail panel — all absolutely positioned against it — come along.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current?.requestFullscreen?.();
  }, []);

  const select = (n: LaidOutNode) => {
    if (!moved.current) setSelected((cur) => (cur?.key === n.key ? null : n));
  };

  return (
    <div ref={wrapRef} className="relative">
      <div
        ref={canvasRef}
        className={`relative flex w-full cursor-grab justify-center overflow-hidden border-navy-800 bg-navy-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 active:cursor-grabbing ${
          isFullscreen
            ? "h-screen border-0"
            : "h-[calc(100vh-15rem)] min-h-[560px] rounded-2xl border"
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="group"
        aria-label="Math curriculum map. Scroll to zoom, drag to pan. Arrow keys pan, plus and minus zoom, zero resets."
      >
        <svg
          className="shrink-0 touch-none select-none"
          width={layout.width}
          height={layout.height}
          viewBox={`${layout.minX} ${layout.minY} ${layout.width} ${layout.height}`}
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: "50% 0",
          }}
        >
          <defs>
            {(["prereq", "order"] as const).map((k) => (
              <marker
                key={k}
                id={`${k}-arrow`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={OVERLAY_INK[k]} />
              </marker>
            ))}
          </defs>

          {/* Containment needs no lines: the boxes nest. Parents paint first, children on top. */}
          {layout.nodes.map((n) => (
            <NodeBox
              key={n.key}
              node={n}
              selected={selected?.key === n.key}
              step={overlay === "order" ? (stepOfKey.get(n.key) ?? null) : null}
              onSelect={() => select(n)}
            />
          ))}

          {/* The relationship overlays — the only lines on the map. Which relationship is drawn is
              the legend's business alone: selecting a card opens its details and draws nothing, so
              the lines on screen always match the option that is ticked. */}
          <g fill="none" strokeLinecap="round">
            {layout.edges
              .filter((e) => e.kind === overlay)
              .map((e) => (
                <path
                  key={`${e.kind}:${e.from}->${e.to}`}
                  d={e.d}
                  stroke={OVERLAY_INK[e.kind]}
                  strokeWidth={2.5}
                  strokeDasharray={e.kind === "prereq" ? "8 7" : undefined}
                  markerEnd={`url(#${e.kind}-arrow)`}
                  opacity={e.kind === "order" ? 0.75 : 0.95}
                />
              ))}
          </g>
        </svg>

        <Controls
          onZoomIn={() => zoomBy(ZOOM.step)}
          onZoomOut={() => zoomBy(1 / ZOOM.step)}
          onReset={reset}
          onToggleFullscreen={toggleFullscreen}
          isFullscreen={isFullscreen}
        />
        <Legend overlay={overlay} onChange={setOverlay} />
      </div>

      {selected && <DetailPanel node={selected} byId={byId} onClose={() => setSelected(null)} />}
    </div>
  );
}

/**
 * A group is scenery: it exists to hold its cards, and there is nothing to open behind it. Only
 * cards take a click, so a container is inert — including to the pointer, so a click landing on a
 * group's background doesn't get swallowed on its way to the canvas.
 */
function NodeBox({
  node,
  selected,
  step,
  onSelect,
}: {
  node: LaidOutNode;
  selected: boolean;
  /** 1-based place in the teaching sequence, or null when course order isn't being shown. */
  step: number | null;
  onSelect: () => void;
}) {
  const { isContainer, planned, depth } = node;
  const radius = isContainer ? Math.max(10, 26 - depth * 3) : 9;
  const ink = titleInk(depth); // `planned` is carried by the group's opacity, not by a second colour

  // Nesting is a purely visual cue, so a card spells its place out loud instead: "Fractions ›
  // Arithmetic › Simplifying Fractions, lesson 11".
  const spoken = [
    [...node.trail, node.title].join(", "),
    node.number != null ? `lesson ${node.number}` : null,
    node.planned ? "coming soon" : null,
  ]
    .filter(Boolean)
    .join(", ");

  const interaction = isContainer
    ? ({ className: "pointer-events-none" } as const)
    : ({
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          onSelect();
        },
        className:
          "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400",
        tabIndex: 0,
        role: "button",
        "aria-label": spoken,
        "aria-pressed": selected,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation(); // space would otherwise reach the canvas and scroll it
            onSelect();
          }
        },
      } as const);

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      opacity={planned ? 0.62 : 1}
      {...interaction}
    >
      <rect
        width={node.w}
        height={node.h}
        rx={radius}
        fill={isContainer ? containerFill(depth) : "rgba(93,148,214,0.20)"}
        stroke={selected ? "var(--gold-400)" : containerStroke(isContainer ? depth : depth + 1)}
        strokeWidth={selected ? 2.5 : 1}
        strokeDasharray={planned ? "6 6" : undefined}
      />
      {selected && (
        <rect
          width={node.w}
          height={node.h}
          rx={radius}
          fill="none"
          stroke="var(--gold-400)"
          strokeWidth={8}
          opacity={0.16}
        />
      )}

      {isContainer ? (
        <ContainerHeader node={node} ink={ink} />
      ) : (
        <CardBody node={node} ink={ink} step={step} />
      )}
    </g>
  );
}

/** A container says only what it is and how much it holds — the size of the type says how big it is. */
function ContainerHeader({ node, ink }: { node: LaidOutNode; ink: string }) {
  const pad = Math.max(12, 26 - node.depth * 4);
  return (
    <>
      <text
        x={pad}
        y={node.headerH / 2 + node.titleSize * 0.36}
        fontSize={node.titleSize}
        fontWeight={node.depth === 0 ? 800 : 700}
        letterSpacing={node.tracking}
        fill={ink}
      >
        {node.title}
      </text>
      {node.lessonCount > 0 && (
        <text
          x={node.w - pad}
          y={node.headerH / 2 + 4}
          textAnchor="end"
          fontSize={Math.max(10, node.titleSize * 0.48)}
          fill="rgba(174,200,230,0.50)"
        >
          {node.planned ? "coming soon" : `${node.lessonCount} lessons`}
        </text>
      )}
      {node.planned && node.lessonCount === 0 && (
        <text
          x={node.w - pad}
          y={node.headerH / 2 + 4}
          textAnchor="end"
          fontSize={11}
          fill="rgba(174,200,230,0.50)"
        >
          coming soon
        </text>
      )}
    </>
  );
}

/**
 * A leaf. The lesson number is quiet metadata by default; in course-order mode it becomes the step
 * badge, because then it is the thing being read.
 */
function CardBody({ node, ink, step }: { node: LaidOutNode; ink: string; step: number | null }) {
  const hasNumber = node.number != null;
  const top = 13 + (hasNumber ? 14 : 0);
  return (
    <>
      {hasNumber &&
        (step != null ? (
          <>
            <circle cx={20} cy={17} r={10} fill="var(--navy-200)" />
            <text
              x={20}
              y={21}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill="var(--navy-950)"
            >
              {step}
            </text>
          </>
        ) : (
          <text x={13} y={20} fontSize={10.5} fontWeight={700} fill="rgba(174,200,230,0.55)">
            {node.number}
          </text>
        ))}
      <text
        x={13}
        y={top + node.titleSize * 0.85}
        fontSize={node.titleSize}
        fontWeight={node.kind === "concept" ? 700 : 500}
        fill={ink}
      >
        {node.lines.map((l, i) => (
          <tspan key={l + i} x={13} dy={i === 0 ? 0 : 16}>
            {l}
          </tspan>
        ))}
      </text>
    </>
  );
}

function Controls({
  onZoomIn,
  onZoomOut,
  onReset,
  onToggleFullscreen,
  isFullscreen,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
}) {
  const btn =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-navy-700 bg-navy-900/90 text-navy-100 hover:border-gold-500 hover:text-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500";
  // Icons are decorative: the label is on the button, so a screen reader never reads out "⌖".
  return (
    <div className="absolute right-4 top-4 flex flex-col gap-2">
      <button type="button" className={btn} onClick={onZoomIn} aria-label="Zoom in" title="Zoom in">
        <span aria-hidden="true">+</span>
      </button>
      <button
        type="button"
        className={btn}
        onClick={onZoomOut}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <span aria-hidden="true">−</span>
      </button>
      <button
        type="button"
        className={btn}
        onClick={onReset}
        aria-label="Reset view"
        title="Reset view"
      >
        <span aria-hidden="true">⌖</span>
      </button>
      <button
        type="button"
        className={btn}
        onClick={onToggleFullscreen}
        aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
        title={isFullscreen ? "Exit full screen" : "Full screen"}
      >
        <span aria-hidden="true">{isFullscreen ? "⤡" : "⛶"}</span>
      </button>
    </div>
  );
}

/**
 * Containment needs no legend — a box inside a box reads as "part of" on sight, which is the whole
 * reason it is drawn by nesting. Only the two overlays need naming, and they are exclusive: showing
 * both at once puts two thickets of line over each other and neither can be followed.
 */
function Legend({ overlay, onChange }: { overlay: Overlay; onChange: (o: Overlay) => void }) {
  const options: { value: Overlay; label: string; dash?: string }[] = [
    { value: "none", label: "just the structure" },
    { value: "prereq", label: "prerequisites", dash: "5 4" },
    { value: "order", label: "the order we teach it" },
  ];

  return (
    <fieldset className="absolute bottom-4 left-4 flex flex-col gap-1 rounded-lg border border-navy-800 bg-navy-950/85 px-3 py-2.5 text-[11px] text-navy-300">
      <legend className="sr-only">What to draw between the topics</legend>
      {options.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-center gap-2 select-none">
          <input
            type="radio"
            name="roadmap-overlay"
            checked={overlay === o.value}
            onChange={() => onChange(o.value)}
            className="h-3 w-3 accent-gold-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500"
          />
          <svg width="26" height="6" aria-hidden="true">
            {o.value !== "none" && (
              <line
                x1="0"
                y1="3"
                x2="26"
                y2="3"
                stroke={OVERLAY_INK[o.value]}
                strokeWidth="2"
                strokeDasharray={o.dash}
              />
            )}
          </svg>
          {o.label}
        </label>
      ))}
      <span className="pointer-events-none mt-1 text-navy-500">
        a box inside a box is part of it · click a lesson to open it · scroll to zoom, drag to pan
      </span>
    </fieldset>
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

  // The panel is the answer to a click, so it takes focus — otherwise a keyboard user activates a
  // card and is left standing on the map with the reply somewhere off to the side.
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.focus(), [node.key]);

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label={`${node.title} details`}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="mt-4 rounded-2xl border border-navy-100 bg-white p-5 shadow-[var(--shadow-card)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 sm:absolute sm:right-4 sm:top-4 sm:mt-0 sm:w-[320px]"
    >
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
            ? node.lessonCount > 0
              ? `A topic that contains ${node.lessonCount} lesson${node.lessonCount === 1 ? "" : "s"}.`
              : "A topic on the map — its lessons aren't written yet."
            : node.hasContent
              ? `Lesson ${node.number ?? ""} · ${node.role === "application" ? "applies earlier lessons" : "core lesson"}`
              : "Lesson in progress."}
      </p>

      {prereqs.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-navy-400">
            Prerequisites
          </p>
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

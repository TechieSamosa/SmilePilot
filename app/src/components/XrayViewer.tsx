import { useCallback, useEffect, useRef, useState } from "react";
import { labelInfo } from "../lib/labels";
import type { Box, Finding } from "../types";
import { IconBox, IconContrast, IconEye, IconZoomIn } from "../ui/icons";

interface Props {
  blob: Blob;
  width: number;
  height: number;
  findings: Finding[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  drawMode: boolean;
  onDrawMode: (on: boolean) => void;
  onDrawn: (box: Box) => void;
  showBoxes: boolean;
  onShowBoxes: (on: boolean) => void;
}

/** Pinch-zoom / pan radiograph viewer with finding overlays and box drawing. */
export function XrayViewer(p: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const bmp = useRef<ImageBitmap | null>(null);
  const view = useRef({ s: 1, tx: 0, ty: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startDist?: number; startS?: number; mid?: { x: number; y: number }; moved: number; lastTap?: number; drawStart?: { x: number; y: number } }>({ moved: 0 });
  const [temp, setTemp] = useState<Box | null>(null);
  const [filter, setFilter] = useState<0 | 1 | 2>(0); // normal / high contrast / inverted
  const propsRef = useRef(p);
  propsRef.current = p;

  const dpr = () => window.devicePixelRatio || 1;

  const fit = useCallback(() => {
    const el = wrap.current;
    if (!el) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const s = Math.min(W / p.width, H / p.height);
    view.current = { s, tx: (W - p.width * s) / 2, ty: (H - p.height * s) / 2 };
  }, [p.width, p.height]);

  const drawBase = useCallback(() => {
    const c = base.current;
    const el = wrap.current;
    if (!c || !el || !bmp.current) return;
    const r = dpr();
    c.width = el.clientWidth * r;
    c.height = el.clientHeight * r;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(r, 0, 0, r, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, el.clientWidth, el.clientHeight);
    const { s, tx, ty } = view.current;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp.current, tx, ty, p.width * s, p.height * s);
  }, [p.width, p.height]);

  const drawOverlay = useCallback(() => {
    const c = over.current;
    const el = wrap.current;
    if (!c || !el) return;
    const r = dpr();
    c.width = el.clientWidth * r;
    c.height = el.clientHeight * r;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(r, 0, 0, r, 0, 0);
    ctx.clearRect(0, 0, el.clientWidth, el.clientHeight);
    const { s, tx, ty } = view.current;
    const { findings, selectedId, showBoxes } = propsRef.current;
    ctx.font = "600 12px system-ui, sans-serif";
    if (showBoxes) {
      // boxes first, then labels — selected label always, others only where they don't collide
      const ordered = [...findings].filter((f) => f.box).sort((a, b) => (a.id === selectedId ? 1 : 0) - (b.id === selectedId ? 1 : 0));
      for (const f of ordered) {
        const sel = f.id === selectedId;
        ctx.globalAlpha = selectedId && !sel ? 0.45 : 1;
        ctx.strokeStyle = labelInfo(f.label).color;
        ctx.lineWidth = sel ? 3 : 2;
        ctx.setLineDash(f.status === "pending" ? [6, 4] : []);
        ctx.strokeRect(f.box!.x * s + tx, f.box!.y * s + ty, f.box!.w * s, f.box!.h * s);
      }
      ctx.setLineDash([]);
      const placed: { x: number; y: number; w: number; h: number }[] = [];
      const hit = (r: { x: number; y: number; w: number; h: number }) =>
        placed.some((p) => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y);
      for (const f of [...ordered].reverse()) {
        const sel = f.id === selectedId;
        const info = labelInfo(f.label);
        const x = f.box!.x * s + tx;
        const y = f.box!.y * s + ty;
        const label = `${info.name}${f.tooth ? ` #${f.tooth}` : ""}${f.source === "ai" && f.status === "pending" ? ` ${Math.round(f.confidence * 100)}%` : ""}`;
        const tw = ctx.measureText(label).width + 8;
        const ly = y - 18 < 0 ? y + f.box!.h * s : y - 18;
        const rect = { x, y: ly, w: tw, h: 18 };
        if (!sel && hit(rect)) continue;
        placed.push(rect);
        ctx.globalAlpha = selectedId && !sel ? 0.45 : 1;
        ctx.fillStyle = info.color;
        ctx.fillRect(x, ly, tw, 18);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, x + 4, ly + 13);
      }
      ctx.globalAlpha = 1;
    }
    if (temp) {
      ctx.strokeStyle = "#14b8a6";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(temp.x * s + tx, temp.y * s + ty, temp.w * s, temp.h * s);
      ctx.setLineDash([]);
    }
  }, [temp]);

  const redraw = useCallback(() => {
    drawBase();
    drawOverlay();
  }, [drawBase, drawOverlay]);

  useEffect(() => {
    let alive = true;
    createImageBitmap(p.blob).then((b) => {
      if (!alive) return b.close();
      bmp.current?.close();
      bmp.current = b;
      fit();
      redraw();
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.blob]);

  useEffect(() => () => bmp.current?.close(), []);
  useEffect(() => {
    drawOverlay();
  }, [p.findings, p.selectedId, p.showBoxes, temp, drawOverlay]);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      fit();
      redraw();
    });
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [fit, redraw]);

  const toImage = (sx: number, sy: number) => {
    const { s, tx, ty } = view.current;
    return { x: (sx - tx) / s, y: (sy - ty) / s };
  };

  const local = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const zoomAt = (factor: number, cx: number, cy: number) => {
    const v = view.current;
    const el = wrap.current!;
    const minS = Math.min(el.clientWidth / p.width, el.clientHeight / p.height) * 0.8;
    const ns = Math.max(minS, Math.min(v.s * factor, 12));
    const k = ns / v.s;
    view.current = { s: ns, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
    redraw();
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const pt = local(e);
    pointers.current.set(e.pointerId, pt);
    gesture.current.moved = 0;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.startDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      gesture.current.startS = view.current.s;
      gesture.current.mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      gesture.current.drawStart = undefined;
      setTemp(null);
    } else if (p.drawMode) {
      gesture.current.drawStart = toImage(pt.x, pt.y);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const pt = local(e);
    pointers.current.set(e.pointerId, pt);
    gesture.current.moved += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    if (pointers.current.size === 2 && gesture.current.startDist) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      const target = (gesture.current.startS! * d) / gesture.current.startDist;
      zoomAt(target / view.current.s, mid.x, mid.y);
      view.current.tx += mid.x - gesture.current.mid!.x;
      view.current.ty += mid.y - gesture.current.mid!.y;
      gesture.current.mid = mid;
      redraw();
      return;
    }
    if (gesture.current.drawStart) {
      const cur = toImage(pt.x, pt.y);
      const s0 = gesture.current.drawStart;
      const x = Math.max(0, Math.min(s0.x, cur.x));
      const y = Math.max(0, Math.min(s0.y, cur.y));
      setTemp({ x, y, w: Math.min(p.width, Math.max(s0.x, cur.x)) - x, h: Math.min(p.height, Math.max(s0.y, cur.y)) - y });
      return;
    }
    view.current.tx += pt.x - prev.x;
    view.current.ty += pt.y - prev.y;
    redraw();
  };

  const onUp = (e: React.PointerEvent) => {
    const pt = local(e);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    gesture.current.startDist = undefined;
    if (gesture.current.drawStart) {
      gesture.current.drawStart = undefined;
      if (temp && temp.w * view.current.s > 8 && temp.h * view.current.s > 8) {
        p.onDrawn(temp);
        p.onDrawMode(false);
      }
      setTemp(null);
      return;
    }
    if (gesture.current.moved < 8) {
      const now = Date.now();
      if (gesture.current.lastTap && now - gesture.current.lastTap < 300) {
        const el = wrap.current!;
        const fitS = Math.min(el.clientWidth / p.width, el.clientHeight / p.height);
        if (view.current.s < fitS * 1.5) zoomAt(2.5, pt.x, pt.y);
        else {
          fit();
          redraw();
        }
        gesture.current.lastTap = 0;
        return;
      }
      gesture.current.lastTap = now;
      const ip = toImage(pt.x, pt.y);
      const hits = p.findings
        .filter((f) => f.box && ip.x >= f.box.x && ip.x <= f.box.x + f.box.w && ip.y >= f.box.y && ip.y <= f.box.y + f.box.h)
        .sort((a, b) => a.box!.w * a.box!.h - b.box!.w * b.box!.h);
      p.onSelect(hits[0]?.id ?? null);
    }
  };

  const filterCss = filter === 1 ? "contrast(1.6) brightness(1.1)" : filter === 2 ? "invert(1) contrast(1.2)" : "none";

  return (
    <div
      ref={wrap}
      className="viewer"
      style={{ height: `min(70vh, calc((min(100vw, 760px) - 32px) * ${Math.max(0.6, Math.min(1.6, p.height / p.width)).toFixed(3)} + 24px))` }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onWheel={(e) => {
        const r = wrap.current!.getBoundingClientRect();
        zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
      }}
    >
      <canvas ref={base} style={{ filter: filterCss }} />
      <canvas ref={over} />
      <div className="viewer-tools" onPointerDown={(e) => e.stopPropagation()}>
        <button className={p.drawMode ? "on" : ""} onClick={() => p.onDrawMode(!p.drawMode)} aria-label="Draw a box">
          <IconBox />
        </button>
        <button className={filter ? "on" : ""} onClick={() => setFilter(((filter + 1) % 3) as 0 | 1 | 2)} aria-label="Contrast / invert">
          <IconContrast />
        </button>
        <button className={p.showBoxes ? "on" : ""} onClick={() => p.onShowBoxes(!p.showBoxes)} aria-label="Show boxes">
          <IconEye />
        </button>
        <button
          onClick={() => {
            fit();
            redraw();
          }}
          aria-label="Fit"
        >
          <IconZoomIn />
        </button>
      </div>
      {p.drawMode && <div className="viewer-hint">Drag a box around the finding the AI missed. Pinch to zoom first if needed.</div>}
    </div>
  );
}

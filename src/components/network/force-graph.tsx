'use client';

/* ──────────────────────────────────────────────────────────
 * BubbleMaps v2 — Interactive force-directed graph
 *
 * Canvas-based with:
 *  • Drag-to-move nodes (like BubbleMaps.io)
 *  • Zoom & pan (scroll + drag on empty space)
 *  • Animated glow links per type
 *  • Node halos & type-specific rendering
 *  • Full viewport sizing
 * ────────────────────────────────────────────────────────── */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { GraphData, GraphNode, GraphLink } from '~/lib/sap/discovery';
import type { Simulation } from 'd3-force';

/* ── Simulation types ─────────────────────────────────── */

export type SimNode = GraphNode & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
};

export type SimLink = Omit<GraphLink, 'source' | 'target'> & {
  source: SimNode;
  target: SimNode;
};

/* ── Color palette ────────────────────────────────────── */

const COLORS = {
  agent:      { fill: '#07A4B5', glow: 'rgba(7,  164, 181, 0.4)',   ring: 'rgba(7,  164, 181, 0.55)' },
  protocol:   { fill: '#0891B2', glow: 'rgba(8,  145, 178, 0.35)',  ring: 'rgba(8,  145, 178, 0.45)' },
  capability: { fill: '#22D3EE', glow: 'rgba(34, 211, 238, 0.30)',  ring: 'rgba(34, 211, 238, 0.45)' },
  tool:       { fill: '#0E7490', glow: 'rgba(14, 116, 144, 0.35)',  ring: 'rgba(14, 116, 144, 0.50)' },
} as const;

const LINK_COLORS: Record<string, string> = {
  protocol:          'rgba(8,  145, 178, 0.30)',
  capability:        'rgba(34, 211, 238, 0.26)',
  tool:              'rgba(14, 116, 144, 0.28)',
  'shared-protocol': 'rgba(7,  164, 181, 0.36)',
};

const LINK_GLOW: Record<string, string> = {
  protocol:          'rgba(8,  145, 178, 0.65)',
  capability:        'rgba(34, 211, 238, 0.60)',
  tool:              'rgba(14, 116, 144, 0.62)',
  'shared-protocol': 'rgba(7,  164, 181, 0.70)',
};

/* ── Props ────────────────────────────────────────────── */

export type ForceGraphProps = {
  data: GraphData;
  width: number;
  height: number;
  onNodeClick?: (node: SimNode) => void;
  onNodeHover?: (node: SimNode | null) => void;
};

/* ── Component ────────────────────────────────────────── */

export default function ForceGraph({ data, width, height, onNodeClick, onNodeHover }: ForceGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const animRef = useRef<number | undefined>(undefined);

  // Interaction state
  const [hovered, setHovered] = useState<SimNode | null>(null);
  const dragRef = useRef<SimNode | null>(null);
  const panRef = useRef<{ active: boolean; startX: number; startY: number; origOx: number; origOy: number }>({
    active: false, startX: 0, startY: 0, origOx: 0, origOy: 0,
  });

  // Camera: zoom + offset
  const cameraRef = useRef({ zoom: 1, offsetX: 0, offsetY: 0 });

  // Pulse animation tick
  const tickRef = useRef(0);

  /* ── Init simulation ──────────────────────────────── */
  useEffect(() => {
    if (!data || data.nodes.length === 0) return;

    let cancelled = false;

    (async () => {
      const d3 = await import('d3-force');
      if (cancelled) return;

      const nodes: SimNode[] = data.nodes.map((n) => ({
        ...n,
        x: width / 2 + (Math.random() - 0.5) * Math.min(width, 500),
        y: height / 2 + (Math.random() - 0.5) * Math.min(height, 400),
        vx: 0, vy: 0,
      }));

      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      const links: SimLink[] = data.links
        .filter((l) => nodeMap.has(l.source) && nodeMap.has(l.target))
        .map((l) => ({
          ...l,
          source: nodeMap.get(l.source as string)!,
          target: nodeMap.get(l.target as string)!,
        }));

      nodesRef.current = nodes;
      linksRef.current = links;

      const sim = d3
        .forceSimulation(nodes)
        .force('link', d3.forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(110).strength(0.3))
        .force('charge', d3.forceManyBody().strength(-450).distanceMax(600))
        .force('center', d3.forceCenter(width / 2, height / 2).strength(0.04))
        .force('collision', d3.forceCollide<SimNode>().radius((d) => d.radius + 10).strength(0.85))
        .force('x', d3.forceX(width / 2).strength(0.015))
        .force('y', d3.forceY(height / 2).strength(0.015))
        .alphaDecay(0.006)
        .velocityDecay(0.28);

      simRef.current = sim;

      // Render loop
      const loop = () => {
        if (cancelled) return;
        tickRef.current++;
        draw();
        animRef.current = requestAnimationFrame(loop);
      };
      animRef.current = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      if (simRef.current) simRef.current.stop();
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, width, height]);

  /* ── Draw ──────────────────────────────────────────── */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const cam = cameraRef.current;
    const t = tickRef.current;

    // Transparent — page gradient shows through
    ctx.clearRect(0, 0, width, height);

    // Subtle teal depth gradient overlay
    const bgGrad = ctx.createRadialGradient(width / 2, height * 0.4, 0, width / 2, height * 0.4, Math.max(width, height) * 0.65);
    bgGrad.addColorStop(0,   'rgba(7, 164, 181, 0.05)');
    bgGrad.addColorStop(0.5, 'rgba(6, 182, 212, 0.02)');
    bgGrad.addColorStop(1,   'transparent');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(cam.offsetX, cam.offsetY);
    ctx.scale(cam.zoom, cam.zoom);

    const nodes = nodesRef.current;
    const links = linksRef.current;
    const hovId = hovered?.id;

    // ── Draw links ──
    for (const link of links) {
      const lt = link.type ?? 'protocol';
      const baseColor = LINK_COLORS[lt] ?? LINK_COLORS.protocol;
      const glowColor = LINK_GLOW[lt] ?? LINK_GLOW.protocol;
      const isHighlight = hovId && (link.source.id === hovId || link.target.id === hovId);

      // Glow layer (wider)
      if (isHighlight) {
        ctx.beginPath();
        ctx.moveTo(link.source.x, link.source.y);
        ctx.lineTo(link.target.x, link.target.y);
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 5 / cam.zoom;
        ctx.stroke();
      }

      // Main line
      ctx.beginPath();
      ctx.moveTo(link.source.x, link.source.y);
      ctx.lineTo(link.target.x, link.target.y);
      ctx.strokeStyle = isHighlight ? glowColor : baseColor;
      ctx.lineWidth = (isHighlight ? 2.0 : 1.0) / cam.zoom;
      ctx.stroke();

      // Animated pulse dot along link
      if (isHighlight) {
        const progress = ((t * 2) % 120) / 120;
        const px = link.source.x + (link.target.x - link.source.x) * progress;
        const py = link.source.y + (link.target.y - link.source.y) * progress;
        ctx.beginPath();
        ctx.arc(px, py, 2 / cam.zoom, 0, Math.PI * 2);
        ctx.fillStyle = glowColor;
        ctx.fill();
      }
    }

    // ── Draw nodes ──
    for (const node of nodes) {
      const isHov = node.id === hovId;
      const isDrag = dragRef.current?.id === node.id;
      const palette = COLORS[node.type] ?? COLORS.agent;
      const r = node.radius;

      // Outer glow halo — bigger, brighter, pulsing
      const pulse = 1 + Math.sin(t * 0.025 + (node.type === 'agent' ? 0 : Math.PI * 0.5)) * 0.18;
      const haloR = r * (2.0 + (isHov ? 0.6 : 0)) * pulse;
      const haloGrad = ctx.createRadialGradient(node.x, node.y, r * 0.4, node.x, node.y, haloR);
      haloGrad.addColorStop(0,   palette.glow);
      haloGrad.addColorStop(0.6, palette.glow.replace(/[\d.]+\)$/, '0.15)'));
      haloGrad.addColorStop(1,   'transparent');
      ctx.beginPath();
      ctx.arc(node.x, node.y, haloR, 0, Math.PI * 2);
      ctx.fillStyle = haloGrad;
      ctx.fill();

      // Main circle with rich radial gradient
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      const cGrad = ctx.createRadialGradient(node.x - r * 0.35, node.y - r * 0.35, r * 0.05, node.x, node.y, r);
      cGrad.addColorStop(0,   lighten(palette.fill, 55));
      cGrad.addColorStop(0.5, lighten(palette.fill, 20));
      cGrad.addColorStop(1,   palette.fill);
      ctx.fillStyle = cGrad;
      ctx.globalAlpha = node.isActive ? 1 : 0.45;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Ring border
      ctx.strokeStyle = isHov || isDrag ? 'rgba(255,255,255,0.5)' : palette.ring;
      ctx.lineWidth = (isHov ? 2 : 1) / cam.zoom;
      ctx.stroke();

      // Inner label
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      const fontSize = Math.max(8, Math.min(12, r * 0.5));
      ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const maxLen = Math.floor(r / (fontSize * 0.35));
      const label = node.name.length > maxLen ? node.name.slice(0, maxLen - 1) + '…' : node.name;
      ctx.fillText(label, node.x, node.y);

      // Type badge below node
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = `500 ${Math.max(7, fontSize - 2)}px JetBrains Mono, monospace`;
      const typeLabel = node.type === 'agent'
        ? (node.score > 0 ? `★ ${node.score}` : 'agent')
        : node.type;
      ctx.fillText(typeLabel, node.x, node.y + r + 10 / cam.zoom);
    }

    ctx.restore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, hovered]);

  /* ── Hit-test helper ──────────────────────────────── */
  const hitTest = useCallback((clientX: number, clientY: number): SimNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const mx = (clientX - rect.left - cam.offsetX) / cam.zoom;
    const my = (clientY - rect.top - cam.offsetY) / cam.zoom;

    for (const n of nodesRef.current) {
      const dx = mx - n.x;
      const dy = my - n.y;
      if (dx * dx + dy * dy < (n.radius + 4) * (n.radius + 4)) return n;
    }
    return null;
  }, []);

  /* ── Mouse: hover ─────────────────────────────────── */
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const cam = cameraRef.current;

    // Dragging a node
    if (dragRef.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const newX = (e.clientX - rect.left - cam.offsetX) / cam.zoom;
      const newY = (e.clientY - rect.top - cam.offsetY) / cam.zoom;
      dragRef.current.fx = newX;
      dragRef.current.fy = newY;
      simRef.current?.alpha(0.3).restart();
      return;
    }

    // Panning
    if (panRef.current.active) {
      cam.offsetX = panRef.current.origOx + (e.clientX - panRef.current.startX);
      cam.offsetY = panRef.current.origOy + (e.clientY - panRef.current.startY);
      return;
    }

    // Hover
    const node = hitTest(e.clientX, e.clientY);
    if (node?.id !== hovered?.id) {
      setHovered(node);
      onNodeHover?.(node);
    }
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = node ? 'grab' : 'default';
  }, [hovered, hitTest, onNodeHover]);

  /* ── Mouse: down (start drag or pan) ──────────────── */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const node = hitTest(e.clientX, e.clientY);
    if (node) {
      dragRef.current = node;
      node.fx = node.x;
      node.fy = node.y;
      simRef.current?.alphaTarget(0.3).restart();
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = 'grabbing';
    } else {
      // Start panning
      const cam = cameraRef.current;
      panRef.current = { active: true, startX: e.clientX, startY: e.clientY, origOx: cam.offsetX, origOy: cam.offsetY };
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = 'move';
    }
  }, [hitTest]);

  /* ── Mouse: up (end drag / pan / click) ───────────── */
  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current.fx = null;
      dragRef.current.fy = null;
      simRef.current?.alphaTarget(0);
      const node = dragRef.current;
      dragRef.current = null;
      // If barely moved, treat as click
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = 'grab';
      onNodeClick?.(node);
    } else if (panRef.current.active) {
      panRef.current.active = false;
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = 'default';
    }
  }, [onNodeClick]);

  /* ── Mouse: leave ─────────────────────────────────── */
  const handleMouseLeave = useCallback(() => {
    if (dragRef.current) {
      dragRef.current.fx = null;
      dragRef.current.fy = null;
      dragRef.current = null;
      simRef.current?.alphaTarget(0);
    }
    panRef.current.active = false;
    setHovered(null);
    onNodeHover?.(null);
  }, [onNodeHover]);

  /* ── Wheel: zoom ──────────────────────────────────── */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const cam = cameraRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const newZoom = Math.max(0.15, Math.min(5, cam.zoom * factor));

    // Zoom towards cursor position
    cam.offsetX = mx - (mx - cam.offsetX) * (newZoom / cam.zoom);
    cam.offsetY = my - (my - cam.offsetY) * (newZoom / cam.zoom);
    cam.zoom = newZoom;
  }, []);

  /* ── Touch (mobile) ──────────────────────────────── */
  const pinchRef = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touches = e.touches;
    if (touches.length === 1) {
      const t = touches[0];
      const node = hitTest(t.clientX, t.clientY);
      if (node) {
        dragRef.current = node;
        node.fx = node.x; node.fy = node.y;
        simRef.current?.alphaTarget(0.3).restart();
      } else {
        const cam = cameraRef.current;
        panRef.current = { active: true, startX: t.clientX, startY: t.clientY, origOx: cam.offsetX, origOy: cam.offsetY };
      }
    } else if (touches.length === 2) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      pinchRef.current = Math.hypot(dx, dy);
      panRef.current.active = false;
    }
  }, [hitTest]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touches = e.touches;

    if (touches.length === 1) {
      const t = touches[0];
      if (dragRef.current) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cam = cameraRef.current;
        dragRef.current.fx = (t.clientX - rect.left - cam.offsetX) / cam.zoom;
        dragRef.current.fy = (t.clientY - rect.top - cam.offsetY) / cam.zoom;
        simRef.current?.alpha(0.3).restart();
      } else if (panRef.current.active) {
        const cam = cameraRef.current;
        cam.offsetX = panRef.current.origOx + (t.clientX - panRef.current.startX);
        cam.offsetY = panRef.current.origOy + (t.clientY - panRef.current.startY);
      }
    } else if (touches.length === 2 && pinchRef.current !== null) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / pinchRef.current;
      pinchRef.current = dist;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = (touches[0].clientX + touches[1].clientX) / 2 - rect.left;
      const cy = (touches[0].clientY + touches[1].clientY) / 2 - rect.top;
      const cam = cameraRef.current;
      const newZoom = Math.max(0.15, Math.min(5, cam.zoom * factor));
      cam.offsetX = cx - (cx - cam.offsetX) * (newZoom / cam.zoom);
      cam.offsetY = cy - (cy - cam.offsetY) * (newZoom / cam.zoom);
      cam.zoom = newZoom;
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      if (dragRef.current) {
        const node = dragRef.current;
        dragRef.current = null;
        node.fx = null; node.fy = null;
        simRef.current?.alphaTarget(0);
        // Treat short tap as click
        onNodeClick?.(node);
      }
      panRef.current.active = false;
      pinchRef.current = null;
    }
  }, [onNodeClick]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    />
  );
}

/* ── Utility ──────────────────────────────────────────── */

function lighten(hex: string, pct: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + pct);
  const g = Math.min(255, ((num >> 8) & 0xff) + pct);
  const b = Math.min(255, (num & 0xff) + pct);
  return `rgb(${r},${g},${b})`;
}

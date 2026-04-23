'use client';

import { useState, useEffect, useRef, useMemo } from 'react';


export type StreamEvent = {
  type: 'sap_event' | 'escrow_event' | 'transaction' | 'connected' | 'close';
  payload: Record<string, unknown>;
};

/* ── useEventStream ─────────────────────────── */

export function useEventStream(opts?: {
  types?: string[];
  address?: string;
  maxEvents?: number;
}) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const max = opts?.maxEvents ?? 100;

  const typesKey = opts?.types?.join(',') ?? '';
  const address = opts?.address;

  useEffect(() => {
    const params = new URLSearchParams();
    if (typesKey) params.set('types', typesKey);
    if (address) params.set('address', address);

    const url = `/api/sap/stream${params.toString() ? '?' + params.toString() : ''}`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as StreamEvent;
        if (parsed.type === 'connected') {
          setConnected(true);
          return;
        }
        if (parsed.type === 'close') {
          es.close();
          setConnected(false);
          return;
        }
        setEvents((prev) => [parsed, ...prev].slice(0, max));
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [typesKey, address, max]);

  return { events, connected };
}


export function useAllEvents() {
  const [historyEvents, setHistoryEvents] = useState<StreamEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const cursorsRef = useRef({ lastSapId: 0, lastEscrowId: 0 });
  const { events: liveEvents, connected } = useEventStream({ maxEvents: 500 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/sap/events/history');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const reversed = (data.events as StreamEvent[]).reverse();
        setHistoryEvents(reversed);
        cursorsRef.current = data.cursors ?? { lastSapId: 0, lastEscrowId: 0 };
      } catch (e) {
        console.warn('[useAllEvents] History fetch failed:', e);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const allEvents = useMemo(() => {
    if (liveEvents.length === 0) return historyEvents;
    const historyKeys = new Set(
      historyEvents.slice(0, 200).map(e => {
        const p = e.payload;
        return `${e.type}:${(p.id as string | number) ?? (p.tx_signature as string) ?? (p.signature as string) ?? ''}`;
      }),
    );
    const newLive = liveEvents.filter(e => {
      const p = e.payload;
      const key = `${e.type}:${(p.id as string | number) ?? (p.tx_signature as string) ?? (p.signature as string) ?? ''}`;
      return !historyKeys.has(key);
    });
    return [...newLive, ...historyEvents];
  }, [liveEvents, historyEvents]);

  return { events: allEvents, connected, loading: historyLoading };
}

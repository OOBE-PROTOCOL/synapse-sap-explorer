export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { isDbDown, markDbDown } from '~/db';
import {
  selectAgentActivity,
  selectNetworkActivity,
  selectToolActivity,
} from '~/lib/db/queries';
import { withTimeout } from '~/lib/async-timeout';
import { asPublicKeyText } from '~/lib/format';

type ActivityScope = 'network' | 'agent' | 'tool';
const ACTIVITY_DB_TIMEOUT_MS = 1_500;

export async function GET(req: NextRequest) {
  const scope = parseScope(req.nextUrl.searchParams.get('scope'));
  const limit = clamp(Number(req.nextUrl.searchParams.get('limit') ?? 96), 1, 500);
  const ids = parseIds(req.nextUrl.searchParams.get('ids'));

  if (isDbDown()) {
    return NextResponse.json({
      scope,
      points: [],
      total: 0,
      source: 'db-unavailable',
    });
  }

  try {
    if (scope === 'agent') {
      const points = await withTimeout(
        selectAgentActivity(ids, limit),
        ACTIVITY_DB_TIMEOUT_MS,
        'agent activity db read',
      );
      return NextResponse.json({
        scope,
        points: points.map((point) => ({
          ...point,
          capturedAt: point.capturedAt.toISOString(),
        })),
        total: points.length,
        source: 'agent_snapshots_v2',
      });
    }

    if (scope === 'tool') {
      const points = await withTimeout(
        selectToolActivity(ids, limit),
        ACTIVITY_DB_TIMEOUT_MS,
        'tool activity db read',
      );
      return NextResponse.json({
        scope,
        points: points.map((point) => ({
          ...point,
          capturedAt: point.capturedAt.toISOString(),
        })),
        total: points.length,
        source: 'tool_snapshots_v2',
      });
    }

    const points = await withTimeout(
      selectNetworkActivity(limit),
      ACTIVITY_DB_TIMEOUT_MS,
      'network activity db read',
    );
    return NextResponse.json({
      scope,
      points: points.map((point) => ({
        ...point,
        capturedAt: point.capturedAt.toISOString(),
      })),
      total: points.length,
      source: 'account_snapshots_v2',
    });
  } catch (error) {
    console.warn('[activity]', (error as Error).message);
    markDbDown();
    return NextResponse.json({
      scope,
      points: [],
      total: 0,
      source: 'error',
      error: (error as Error).message,
    }, { status: 200 });
  }
}

function parseScope(value: string | null): ActivityScope {
  return value === 'agent' || value === 'tool' || value === 'network' ? value : 'network';
}

function parseIds(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => asPublicKeyText(item.trim()))
    .filter((item): item is string => Boolean(item));
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

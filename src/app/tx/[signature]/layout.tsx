import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';
const API_BASE = process.env.NEXT_PUBLIC_BASE_URL || SITE_URL;

type Props = {
  params: Promise<{ signature: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { signature: sig } = await params;
  const shortSig = sig.length > 20 ? `${sig.slice(0, 8)}...${sig.slice(-6)}` : sig;

  try {
    const res = await fetch(`${API_BASE}/api/sap/tx/${sig}`, {
      next: { revalidate: 120 },
    });

    if (!res.ok) {
      return {
        title: `TX ${shortSig}`,
        description: `Transaction ${shortSig} on Synapse SAP Explorer`,
      };
    }

    const data = await res.json();
    const status = data.status ?? (data.err === false ? 'success' : 'failed');
    const block = data.slot?.toLocaleString() ?? '--';
    const fee = data.fee != null ? `${(data.fee / 1e9).toFixed(6)} SOL` : '--';
    const timestamp = data.blockTime
      ? new Date(data.blockTime * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
      : '--';
    const programs = (data.instructions ?? [])
      .map((ix: { program?: string; programId?: string }) => ix.program ?? ix.programId)
      .filter(Boolean)
      .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
      .join(', ') || '--';
    const programCount = programs === '--' ? '0' : String(programs.split(',').length);

    const ogUrl = new URL(`${SITE_URL}/synapse-metadata-logo.png`);
    ogUrl.searchParams.set('type', 'tx');
    ogUrl.searchParams.set('sig', sig);
    ogUrl.searchParams.set('status', status);
    ogUrl.searchParams.set('block', block);
    ogUrl.searchParams.set('time', timestamp);
    ogUrl.searchParams.set('fee', fee);
    ogUrl.searchParams.set('programs', programCount);

    const description = `${status === 'success' ? 'Confirmed' : 'Failed'} | Block ${block} | ${timestamp} | Fee: ${fee}`;

    return {
      title: `TX ${shortSig}`,
      description,
      openGraph: {
        type: 'article',
        title: `Transaction ${shortSig} | Synapse Explorer`,
        description,
        url: `${SITE_URL}/tx/${sig}`,
        siteName: 'Synapse Explorer',
        images: [{ url: ogUrl.toString(), width: 1200, height: 630, alt: `Transaction ${shortSig}` }],
      },
      twitter: {
        card: 'summary_large_image',
        title: `TX ${shortSig} | Synapse Explorer`,
        description,
        images: [ogUrl.toString()],
      },
    };
  } catch {
    return {
      title: `TX ${shortSig}`,
      description: `Transaction ${shortSig} on Synapse SAP Explorer`,
    };
  }
}

export default function TxLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

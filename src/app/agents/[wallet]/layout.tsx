import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';
const API_BASE = process.env.NEXT_PUBLIC_BASE_URL || SITE_URL;

type Props = {
  params: Promise<{ wallet: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet: walletOrId } = await params;
  const shortWallet = walletOrId.length > 12 ? `${walletOrId.slice(0, 6)}...${walletOrId.slice(-4)}` : walletOrId;

  try {
    const resolved = await fetch(`${API_BASE}/api/sap/agents/resolve/${walletOrId}`, {
      next: { revalidate: 60 },
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { wallet?: string | null } | null;

    const canonicalWallet = resolved?.wallet ?? walletOrId;

    const res = await fetch(`${API_BASE}/api/sap/agents/${canonicalWallet}`, {
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return {
        title: `Agent ${shortWallet}`,
        description: `Agent ${shortWallet} on Synapse SAP Explorer`,
      };
    }

    const data = await res.json();
    const profile = data.profile ?? data;
    const identity = profile.identity;

    if (!identity) {
      return {
        title: `Agent ${shortWallet}`,
        description: `Agent ${shortWallet} on Synapse SAP Explorer`,
      };
    }

    const computed = profile.computed ?? null;
    const name = identity.name || shortWallet;
    const score = Number(computed?.reputationScore ?? identity.reputationScore ?? 0);
    const calls = Number(computed?.totalCalls ?? identity.totalCallsServed ?? 0).toLocaleString();
    const toolCount = String(computed?.capabilityCount ?? identity.capabilities?.length ?? 0);
    const isActive = identity.isActive ? 'active' : 'inactive';

    const ogUrl = new URL(`${SITE_URL}/api/og`);
    ogUrl.searchParams.set('type', 'agent');
    ogUrl.searchParams.set('name', name);
    ogUrl.searchParams.set('wallet', canonicalWallet);
    ogUrl.searchParams.set('score', String(score));
    ogUrl.searchParams.set('calls', calls);
    ogUrl.searchParams.set('tools', toolCount);
    ogUrl.searchParams.set('status', isActive);

    const description = `${isActive === 'active' ? 'Active' : 'Inactive'} SAP Agent | Score: ${score}/100 | Calls: ${calls} | ${toolCount} capabilities`;

    return {
      title: name,
      description,
      openGraph: {
        type: 'profile',
        title: `${name} | Synapse Explorer`,
        description,
        url: `${SITE_URL}/agents/${canonicalWallet}`,
        siteName: 'Synapse Explorer',
        images: [{ url: ogUrl.toString(), width: 1200, height: 630, alt: `Agent ${name}` }],
      },
      twitter: {
        card: 'summary_large_image',
        title: `${name} | Synapse Explorer`,
        description,
        images: [ogUrl.toString()],
      },
    };
  } catch {
    return {
      title: `Agent ${shortWallet}`,
      description: `Agent ${shortWallet} on Synapse SAP Explorer`,
    };
  }
}

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

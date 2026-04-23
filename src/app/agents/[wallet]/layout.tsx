import type { Metadata } from 'next';

const SITE_URL = 'https://explorer.oobeprotocol.ai';
const API_BASE = process.env.NEXT_PUBLIC_BASE_URL || SITE_URL;

type Props = {
  params: Promise<{ wallet: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  const shortWallet = wallet.length > 12 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : wallet;

  try {
    const res = await fetch(`${API_BASE}/api/sap/agents/${wallet}`, {
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

    const name = identity.name || shortWallet;
    const score = identity.reputationScore ?? 0;
    const calls = Number(identity.totalCallsServed ?? 0).toLocaleString();
    const toolCount = String(identity.capabilities?.length ?? 0);
    const isActive = identity.isActive ? 'active' : 'inactive';

    const ogUrl = new URL(`${SITE_URL}/api/og`);
    ogUrl.searchParams.set('type', 'agent');
    ogUrl.searchParams.set('name', name);
    ogUrl.searchParams.set('wallet', wallet);
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
        url: `${SITE_URL}/agents/${wallet}`,
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

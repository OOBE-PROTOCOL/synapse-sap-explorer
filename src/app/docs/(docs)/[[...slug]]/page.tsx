// app/docs/[[...slug]]/page.tsx
import { source } from "@/lib/source";
import { notFound } from "next/navigation";
import { getMDXComponents } from "@/mdx-components";
import {
  DocsPage,
  DocsBody,
  DocsTitle,
  DocsDescription,
} from "fumadocs-ui/page";
import type { Metadata } from "next";

type PageProps = { params: Promise<{ slug?: string[] }> };
const SITE_URL = 'https://explorer.oobeprotocol.ai';

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const slugs = slug ?? [];
  const page = source.getPage(slugs);

  if (!page) return notFound();

  const MDXContent = (page.data as Record<string, unknown>).body as React.ComponentType<{ components: ReturnType<typeof getMDXComponents> }>;

  return (
    <DocsPage
      toc={(page.data as Record<string, unknown>).toc as Parameters<typeof DocsPage>[0]['toc']}
      tableOfContent={{
        style: "clerk",
        single: false,
      }}
    >
      <DocsTitle>{(page.data as Record<string, unknown>).title as string}</DocsTitle>
      <DocsDescription>{(page.data as Record<string, unknown>).description as string}</DocsDescription>
      <DocsBody>
        <MDXContent components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug ?? []);
  if (!page) return {};

  const title = (page.data as Record<string, unknown>).title as string;
  const description = (page.data as Record<string, unknown>).description as string;
  const section = slug?.[0] ?? 'Overview';
  const canonicalPath = slug && slug.length > 0 ? `/docs/${slug.join('/')}` : '/docs';

  const ogUrl = new URL(`${SITE_URL}/api/og`);
  ogUrl.searchParams.set('type', 'docs');
  ogUrl.searchParams.set('title', title);
  ogUrl.searchParams.set('desc', description);
  ogUrl.searchParams.set('section', section.charAt(0).toUpperCase() + section.slice(1));

  return {
    title,
    description,
    openGraph: {
      type: 'article',
      title: `${title} | Synapse Docs`,
      description,
      url: `${SITE_URL}${canonicalPath}`,
      siteName: 'Synapse Explorer',
      images: [{ url: ogUrl.toString(), width: 1200, height: 630, alt: `${title} | Synapse Docs` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Synapse Docs`,
      description,
      images: [ogUrl.toString()],
    },
  };
}

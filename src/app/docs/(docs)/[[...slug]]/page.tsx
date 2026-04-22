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

  return {
    title: (page.data as Record<string, unknown>).title as string,
    description: (page.data as Record<string, unknown>).description as string,
  };
}

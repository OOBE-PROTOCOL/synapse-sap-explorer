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

  const MDXContent = (page.data as any).body;

  return (
    <DocsPage
      toc={(page.data as any).toc}
      tableOfContent={{
        style: "clerk",
        single: false,
      }}
    >
      <DocsTitle>{(page.data as any).title}</DocsTitle>
      <DocsDescription>{(page.data as any).description}</DocsDescription>
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
    title: (page.data as any).title,
    description: (page.data as any).description,
  };
}

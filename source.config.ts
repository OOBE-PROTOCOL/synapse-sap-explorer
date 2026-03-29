import { defineDocs, defineConfig } from 'fumadocs-mdx/config';

export const docs = defineDocs({
  dir: 'docs/docs',
});

export default defineConfig({
  mdxOptions: {
    // Add remark/rehype plugins here if needed
  },
});

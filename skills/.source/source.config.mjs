// source.config.ts
import { defineDocs, defineConfig } from "fumadocs-mdx/config";
var docs = defineDocs({
  dir: "docs/docs"
});
var source_config_default = defineConfig({
  mdxOptions: {
    // Add remark/rehype plugins here if needed
  }
});
export {
  source_config_default as default,
  docs
};

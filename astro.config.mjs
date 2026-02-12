import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://www.copywriting-blog.pl",
  integrations: [
    sitemap({
      filter: (page) => 
        !page.includes('/polityka-prywatnosci'),
    }),
  ],
});

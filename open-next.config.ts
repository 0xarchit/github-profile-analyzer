// OpenNext Cloudflare adapter configuration.
//
// No incremental cache is configured: this app uses no ISR and no on-demand
// revalidation (verified — no revalidate/revalidatePath/revalidateTag anywhere
// in src/), so the default behaviour is enough.
//
// If ISR is introduced later, add the R2 binding to wrangler.jsonc and wire it up:
//   import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
//   export default defineCloudflareConfig({ incrementalCache: r2IncrementalCache });
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();

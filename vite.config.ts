import { defineConfig } from "vite";

// FLAG CATCH dev server. Port 5181 so it never collides with Super Star Party (5177).
export default defineConfig({
  base: "./",
  server: { host: true, port: 5181, strictPort: true },
  preview: { host: true, port: 5181, strictPort: true },
});

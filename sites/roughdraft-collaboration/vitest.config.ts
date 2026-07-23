import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: [
      "app/roughdraft-ui/**/*.test.ts",
      "app/roughdraft-ui/**/*.test.tsx",
      "db/**/*.test.ts",
      "lib/**/*.test.ts",
    ],
  },
});

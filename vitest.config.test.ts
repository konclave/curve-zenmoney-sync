import { describe, expect, it } from "vitest";

import config from "./vitest.config";

describe("vitest config", () => {
  it("excludes compiled test artifacts", () => {
    expect(config.test?.exclude).toEqual(
      expect.arrayContaining(["dist/**", ".serverless-package/**"]),
    );
  });
});

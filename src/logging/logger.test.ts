import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppLogger } from "./logger";

describe("createAppLogger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("writes JSON info logs to stdout", () => {
    const write = vi.fn();
    const logger = createAppLogger({ write });

    logger.info({ event: "transaction.created", merchant: "Starbucks" }, "Transaction created");

    expect(write).toHaveBeenCalledOnce();

    const payload = JSON.parse(write.mock.calls[0][0]);
    expect(payload.level).toBe(30);
    expect(payload.service).toBe("curve-zenmoney-sync");
    expect(payload.event).toBe("transaction.created");
    expect(payload.merchant).toBe("Starbucks");
    expect(payload.msg).toBe("Transaction created");
  });
});

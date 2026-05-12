# Yandex Serverless Event Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the serverless event interfaces and parser match the documented Yandex Cloud trigger payload.

**Architecture:** Keep `ParsedEmail` unchanged while replacing the serverless event contract with the strict Yandex shape. Cover the change with focused parser and handler tests so the real trigger payload is exercised end-to-end through the serverless entry point.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Lock the Yandex payload shape in tests

**Files:**
- Modify: `src/serverless/event.test.ts`
- Modify: `src/serverless/handler.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("extracts headers from Yandex values arrays", () => {
  const event = {
    messages: [
      {
        headers: [
          { name: "From", values: ["Curve Support <support@imaginecurve.com>"] },
          { name: "Subject", values: ["Your Curve receipt"] },
        ],
        message: "<p>Hello</p>",
      },
    ],
  };

  expect(parseEmailTriggerEvent(event)).toMatchObject({
    from: "support@imaginecurve.com",
    subject: "Your Curve receipt",
    html: "<p>Hello</p>",
    plain: "",
  });
});
```

```ts
const validEvent = {
  messages: [
    {
      received_at: "2026-04-23T10:02:18Z",
      headers: [
        { name: "From", values: ["support@imaginecurve.com"] },
        { name: "Subject", values: ["Curve Receipt: Purchase at Starbucks on 23 April 2026 for €8.09"] },
      ],
      message: curveHtml,
    },
  ],
};
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/serverless/event.test.ts src/serverless/handler.test.ts`  
Expected: FAIL because the parser still reads `header.value` instead of `header.values[0]`.

### Task 2: Implement strict Yandex event parsing

**Files:**
- Modify: `src/serverless/event.ts`

- [ ] **Step 1: Write minimal implementation**

```ts
interface EmailTriggerHeader {
  name: string;
  values: string[];
}

function getHeaderValue(headers: EmailTriggerHeader[], name: string): string {
  const header = headers.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  return Array.isArray(header?.values) && typeof header.values[0] === "string" ? header.values[0] : "";
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- src/serverless/event.test.ts src/serverless/handler.test.ts`  
Expected: PASS

### Task 3: Verify the parser behavior remains stable

**Files:**
- Verify only

- [ ] **Step 1: Run focused verification**

Run: `npm test -- src/serverless/event.test.ts src/serverless/handler.test.ts`  
Expected: PASS

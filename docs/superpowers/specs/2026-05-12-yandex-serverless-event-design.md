# Yandex Serverless Event Parser Alignment — Design

**Date:** 2026-05-12  
**Status:** Approved

---

## Overview

Align the serverless email trigger contract with the documented Yandex Cloud payload format so the parser reads real trigger events without relying on a legacy header shape.

---

## Goals

- Make the TypeScript interface match the Yandex trigger event shape
- Parse headers from `values: string[]` instead of `value: string`
- Keep the existing normalized `ParsedEmail` output unchanged
- Fail cleanly when the event shape is malformed

---

## Scope

The change is limited to the serverless event model, its parser, and tests/fixtures that construct serverless trigger payloads. No webhook code or downstream transaction processing changes are required.

---

## Event Contract

The parser should accept this shape:

```ts
interface YandexEmailTriggerHeader {
  name: string;
  values: string[];
}

interface YandexEmailTriggerAttachments {
  bucket_id?: string;
  keys?: string[];
}

interface YandexEmailTriggerMessage {
  received_at?: string;
  headers?: YandexEmailTriggerHeader[];
  attachments?: YandexEmailTriggerAttachments;
  message?: string;
}

interface YandexEmailTriggerEvent {
  messages: YandexEmailTriggerMessage[];
}
```

---

## Parsing Rules

- Use only the first message in `messages`
- Look up headers case-insensitively by `name`
- Read the first string from `values` for `From` and `Subject`
- Extract the email address from angle brackets in the `From` header when present
- Use `message` as the normalized HTML body
- Return `plain: ""` to preserve the current downstream contract

---

## Error Handling

- Reject non-object payloads
- Reject missing or empty `messages`
- Reject a first message that is not an object
- Treat missing headers or empty header value arrays as absent data and normalize them to empty strings

---

## Testing

- Update parser tests to use the Yandex `values[]` header shape
- Add a regression test proving display-name extraction still works with `values[]`
- Add a validation test for malformed `values` entries so parser behavior is explicit

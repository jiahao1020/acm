import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readProviderGateway,
  alwaysUsable,
  enabledOnly,
} from "../key/provider-gateway";

function provider(baseURL: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return { options: { baseURL }, ...extra };
}

test("the named provider wins over the first usable one", () => {
  const raw = {
    provider: {
      first: provider("http://first/v1"),
      named: provider("http://named/v1"),
    },
  };
  assert.equal(
    readProviderGateway(raw, "named", alwaysUsable)?.baseUrl,
    "http://named/v1"
  );
});

test("a named provider without a baseURL falls through to the fallback scan", () => {
  const raw = {
    provider: {
      broken: { options: {} },
      good: provider("http://good/v1"),
    },
  };
  assert.equal(readProviderGateway(raw, "broken", alwaysUsable)?.baseUrl, "http://good/v1");
});

test("without a name, the first provider that has a baseURL wins", () => {
  const raw = {
    provider: {
      empty: { options: {} },
      good: { options: { baseURL: "http://good/v1", apiKey: "k" } },
    },
  };
  const found = readProviderGateway(raw, undefined, alwaysUsable);
  assert.equal(found?.baseUrl, "http://good/v1");
  assert.equal(found?.apiKey, "k");
});

test("enabledOnly skips a provider the user turned off", () => {
  const raw = {
    provider: {
      off: provider("http://off/v1", { enabled: false }),
      on: provider("http://on/v1", { enabled: true }),
    },
  };
  assert.equal(readProviderGateway(raw, undefined, enabledOnly)?.baseUrl, "http://on/v1");
});

test("enabledOnly reports nothing when every provider is disabled", () => {
  const raw = { provider: { off: provider("http://off/v1", { enabled: false }) } };
  assert.equal(readProviderGateway(raw, undefined, enabledOnly), null);
});

test("a named disabled provider is still honoured, because the name is explicit", () => {
  const raw = { provider: { off: provider("http://off/v1", { enabled: false }) } };
  assert.equal(readProviderGateway(raw, "off", enabledOnly)?.baseUrl, "http://off/v1");
});

test("a missing or malformed provider map reads as null, not a crash", () => {
  assert.equal(readProviderGateway(null, undefined, alwaysUsable), null);
  assert.equal(readProviderGateway({}, undefined, alwaysUsable), null);
  assert.equal(readProviderGateway({ provider: [] }, undefined, alwaysUsable), null);
  assert.equal(readProviderGateway({ provider: "nope" }, undefined, alwaysUsable), null);
  assert.equal(readProviderGateway({ provider: { a: null } }, undefined, alwaysUsable), null);
});

test("a provider whose options is not an object is ignored", () => {
  const raw = { provider: { bad: { options: "nope" }, good: provider("http://good/v1") } };
  assert.equal(readProviderGateway(raw, undefined, alwaysUsable)?.baseUrl, "http://good/v1");
});

test("a non-string baseURL does not count as configured", () => {
  const raw = { provider: { a: { options: { baseURL: 42 } } } };
  assert.equal(readProviderGateway(raw, undefined, alwaysUsable), null);
});

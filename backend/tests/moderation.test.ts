import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { moderate } from "../src/services/moderation.service.js";

type Mode =
  "reset" | "allow" | "block" | "forbidden" | "invalid" | "timeout" | "quota";
function setup(t: TestContext, modes: Mode[]) {
  const key = process.env.GEMINI_API_KEY,
    model = process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL = "gemini-2.5-flash";
  t.after(() => {
    if (key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = key;
    if (model === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = model;
  });
  const requests: { options: https.RequestOptions; body?: string }[] = [];
  t.mock.method(
    https,
    "request",
    (options: https.RequestOptions, callback: (res: Readable) => void) => {
      const current = { options, body: "" };
      requests.push(current);
      const mode = modes.shift() || "allow";
      const req = Object.assign(new EventEmitter(), {
        end(body: string) {
          current.body = body;
          if (mode === "timeout") return;
          process.nextTick(() => {
            if (mode === "reset") {
              req.emit(
                "error",
                Object.assign(new Error("reset"), { code: "ECONNRESET" }),
              );
              req.emit("close");
              return;
            }
            const text =
              mode === "invalid"
                ? "not JSON"
                : JSON.stringify({
                    candidates: [
                      {
                        content: {
                          parts: [
                            {
                              text: JSON.stringify({
                                blocked: mode === "block",
                              }),
                            },
                          ],
                        },
                        finishReason: "STOP",
                      },
                    ],
                  });
            const res = Object.assign(Readable.from([Buffer.from(text)]), {
              statusCode:
                mode === "forbidden" ? 403 : mode === "quota" ? 429 : 200,
            });
            res.on("end", () => req.emit("close"));
            callback(res);
          });
        },
        destroy(error: Error) {
          req.emit("error", error);
          req.emit("close");
        },
      });
      return req;
    },
  );
  return requests;
}

test("reset retries once on a fresh IPv4 connection and returns a valid decision", async (t) => {
  const requests = setup(t, ["reset", "allow"]);
  assert.equal(await moderate("Hello"), false);
  assert.equal(requests.length, 2);
  for (const { options, body } of requests) {
    assert.equal(options.family, 4);
    assert.equal(options.agent, false);
    assert.notEqual(options.rejectUnauthorized, false);
    const payload = JSON.parse(body!);
    assert.equal(payload.generationConfig.thinkingConfig.thinkingBudget, 0);
    assert.ok(payload.generationConfig.responseSchema);
    assert.equal(body!.includes("replyTo"), false);
  }
});
test("two resets reject delivery; next message succeeds without restarting the process", async (t) => {
  const requests = setup(t, ["reset", "reset", "allow"]);
  await assert.rejects(moderate("First message"), { status: 503 });
  assert.equal(await moderate("Next normal message"), false);
  assert.equal(requests.length, 3);
});
test("HTTP access errors are not retried or allowed", async (t) => {
  const requests = setup(t, ["forbidden"]);
  await assert.rejects(moderate("Hello"), { status: 503 });
  assert.equal(requests.length, 1);
});
test("invalid responses are not silently allowed", async (t) => {
  const requests = setup(t, ["invalid"]);
  await assert.rejects(moderate("Hello"), { status: 503 });
  assert.equal(requests.length, 1);
});
test("local and AI profanity decisions still block content", async (t) => {
  const requests = setup(t, ["block"]);
  assert.equal(await moderate("shit"), true);
  assert.equal(requests.length, 0);
  assert.equal(await moderate("Other content"), true);
});
test("deadline aborts the connection and does not leave the next request stuck", async (t) => {
  setup(t, ["timeout", "allow"]);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = moderate("Hello");
  t.mock.timers.tick(12000);
  await assert.rejects(pending, { status: 503 });
  assert.equal(await moderate("Next message"), false);
});

test("quota fallback warns, keeps local blocking, pauses requests and resumes AI after cooldown", async (t) => {
  const requests = setup(t, ["quota", "allow"]);
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  let warnings = 0;
  const warn = () => {
    warnings++;
  };
  assert.equal(await moderate("Hello", undefined, undefined, warn), false);
  assert.equal(requests.length, 1);
  assert.equal(warnings, 1);
  assert.equal(
    await moderate("Next message", undefined, undefined, warn),
    false,
  );
  assert.equal(requests.length, 1);
  assert.equal(warnings, 2);
  assert.equal(await moderate("shit", undefined, undefined, warn), true);
  assert.equal(warnings, 2);
  assert.equal(requests.length, 1);
  t.mock.timers.tick(60001);
  assert.equal(
    await moderate("Quota recovered", undefined, undefined, warn),
    false,
  );
  assert.equal(requests.length, 2);
  assert.equal(warnings, 2);
});

import https from "node:https";

export interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
}

// A fresh, verified IPv4 connection per attempt; no shared fetch connection pool.
export async function requestGemini(body: unknown): Promise<GeminiResponse> {
  const model = (process.env.GEMINI_MODEL || "gemini-2.5-flash").replace(
    /^models\//,
    "",
  );
  const payload = JSON.stringify(body);
  const deadline = Date.now() + 12000;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await new Promise<GeminiResponse>((resolve, reject) => {
        const req = https.request(
          {
            hostname: "generativelanguage.googleapis.com",
            path: `/v1beta/models/${encodeURIComponent(model)}:generateContent`,
            method: "POST",
            family: 4,
            agent: false,
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": process.env.GEMINI_API_KEY || "",
              "Content-Length": Buffer.byteLength(payload),
            },
          },
          (res) => {
            const chunks: Buffer[] = [];
            let size = 0;
            res.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size > 256 * 1024)
                req.destroy(new Error("Gemini response is too large"));
              else chunks.push(Buffer.from(chunk));
            });
            res.on("error", reject);
            res.on("end", () => {
              if (
                !res.statusCode ||
                res.statusCode < 200 ||
                res.statusCode >= 300
              ) {
                reject(
                  Object.assign(new Error(`Gemini HTTP ${res.statusCode}`), {
                    code: `GEMINI_HTTP_${res.statusCode}`,
                  }),
                );
                return;
              }
              try {
                resolve(
                  JSON.parse(
                    Buffer.concat(chunks).toString("utf8"),
                  ) as GeminiResponse,
                );
              } catch {
                reject(new Error("Gemini returned invalid JSON"));
              }
            });
          },
        );
        const timer = setTimeout(
          () =>
            req.destroy(
              Object.assign(new Error("Gemini moderation timed out"), {
                code: "ETIMEDOUT",
              }),
            ),
          Math.max(1, deadline - Date.now()),
        );
        req.on("error", reject);
        req.on("close", () => clearTimeout(timer));
        req.end(payload);
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // Retry only transient connection failures, once, within the same deadline.
      if (
        attempt === 0 &&
        ["ECONNRESET", "EPIPE"].includes(code || "") &&
        Date.now() < deadline - 250
      )
        continue;
      throw error;
    }
  }
  throw new Error("Gemini request failed");
}

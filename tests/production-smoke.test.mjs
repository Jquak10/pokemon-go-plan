import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import {
  runProductionSmoke
} from "./production-smoke.mjs";

const indexHtml =
  await readFile(
    new URL(
      "../public/index.html",
      import.meta.url
    ),
    "utf8"
  );
const landingApp =
  await readFile(
    new URL(
      "../public/landing-app.js",
      import.meta.url
    ),
    "utf8"
  );
const sourcesHtml =
  await readFile(
    new URL(
      "../public/sources.html",
      import.meta.url
    ),
    "utf8"
  );

const requests = [];

const server =
  http.createServer(
    (request, response) => {
      requests.push({
        method:
          request.method,
        url:
          request.url,
        authorization:
          request.headers
            .authorization ||
          null
      });

      if (
        request.method === "GET" &&
        request.url === "/"
      ) {
        response.writeHead(
          200,
          {
            "content-type":
              "text/html; charset=utf-8"
          }
        );
        response.end(indexHtml);
        return;
      }

      if (
        request.method === "GET" &&
        request.url?.startsWith(
          "/landing-app.js?v="
        )
      ) {
        response.writeHead(
          200,
          {
            "content-type":
              "text/javascript; charset=utf-8"
          }
        );
        response.end(
          landingApp
        );
        return;
      }

      if (
        request.method === "GET" &&
        request.url === "/sources"
      ) {
        response.writeHead(
          200,
          {
            "content-type":
              "text/html; charset=utf-8"
          }
        );
        response.end(
          sourcesHtml
        );
        return;
      }

      if (
        request.method === "GET" &&
        request.url === "/api/me"
      ) {
        response.writeHead(
          401,
          {
            "content-type":
              "application/json; charset=utf-8",
            "cache-control":
              "private, no-store"
          }
        );
        response.end(
          JSON.stringify({
            error:
              "Invalid management link."
          })
        );
        return;
      }

      response.writeHead(404);
      response.end();
    }
  );

await new Promise(
  (resolve, reject) => {
    server.once(
      "error",
      reject
    );
    server.listen(
      0,
      "127.0.0.1",
      resolve
    );
  }
);

try {
  const address =
    server.address();

  assert.ok(
    address &&
      typeof address ===
        "object"
  );

  await runProductionSmoke({
    baseUrl:
      `http://127.0.0.1:${address.port}`,
    attempts: 1,
    timeoutMs: 1000
  });

  assert.deepEqual(
    requests.map(
      request =>
        request.url
    ),
    [
      "/",
      "/landing-app.js?v=4",
      "/sources",
      "/api/me"
    ]
  );

  const apiRequest =
    requests.at(-1);

  assert.equal(
    apiRequest.method,
    "GET"
  );
  assert.equal(
    apiRequest.authorization,
    "Bearer bl-031-production-smoke-invalid"
  );

  assert.equal(
    requests.some(
      request =>
        request.method !==
        "GET"
    ),
    false,
    "Production smoke checks must remain read-only"
  );
} finally {
  await new Promise(
    resolve =>
      server.close(
        resolve
      )
  );
}

console.log(
  "production smoke fixture tests passed"
);

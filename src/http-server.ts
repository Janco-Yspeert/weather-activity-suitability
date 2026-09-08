import { createServer, type IncomingMessage, type Server } from "node:http";
import { graphql, type GraphQLSchema } from "graphql";

interface GraphqlRequest {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

export function createGraphqlServer(schema: GraphQLSchema): Server {
  return createServer(async (request, response) => {
    if (request.url !== "/graphql") {
      sendJson(response, 404, { error: "Not found" });
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    try {
      const body = await readGraphqlRequest(request);
      const result = await graphql({
        schema,
        source: body.query,
        ...(body.variables === undefined ? {} : { variableValues: body.variables }),
        ...(body.operationName === undefined ? {} : { operationName: body.operationName }),
      });
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 400, {
        errors: [{ message: error instanceof Error ? error.message : "Invalid request" }],
      });
    }
  });
}

async function readGraphqlRequest(request: IncomingMessage): Promise<GraphqlRequest> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    length += buffer.length;
    if (length > 1_000_000) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (typeof value !== "object" || value === null || !("query" in value) || typeof value.query !== "string") {
    throw new Error("Request body must contain a GraphQL query");
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.variables !== undefined && (typeof candidate.variables !== "object" || candidate.variables === null || Array.isArray(candidate.variables))) {
    throw new Error("GraphQL variables must be an object");
  }
  if (candidate.operationName !== undefined && typeof candidate.operationName !== "string") {
    throw new Error("GraphQL operationName must be a string");
  }
  return {
    query: value.query,
    ...(candidate.variables === undefined ? {} : { variables: candidate.variables as Record<string, unknown> }),
    ...(candidate.operationName === undefined ? {} : { operationName: candidate.operationName as string }),
  };
}

function sendJson(response: import("node:http").ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    connection: "close",
  });
  response.end(JSON.stringify(value));
}

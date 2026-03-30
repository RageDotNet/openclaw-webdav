import type { HandlerResult, ParsedRequest } from "../../types.js";

/**
 * WebDAV OPTIONS handler.
 * Returns DAV compliance class headers and allowed methods.
 * MS-Author-Via is required for Windows WebDAV client compatibility.
 */
export function handleOptions(_req: ParsedRequest): HandlerResult {
  return {
    status: 200,
    headers: {
      DAV: "1, 2",
      Allow:
        "OPTIONS, GET, HEAD, PUT, DELETE, MKCOL, COPY, MOVE, PROPFIND, PROPPATCH, LOCK, UNLOCK",
      "MS-Author-Via": "DAV",
      "Content-Length": "0",
    },
    body: undefined,
  };
}

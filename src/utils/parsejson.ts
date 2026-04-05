import {
  ERROR_MESSAGES,
  TIKTOK_CONSTANTS,
} from "../constants";

/**
 * Default interface for return
 */
export interface SocketIoEvent<T = any> {
  eventName: string;
  data: T;
}

/**
 * Parsing result with error information
 */
export interface ParseResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Parses a Socket.io 42 message with optional key mapping.
 * @param message - The raw socket string (e.g., '42["chat", {}]')
 * @param keys - (Optional) Dictionary to rename output keys
 */
export function parseSocketIo42Message<
  T = any,
  E extends string = "eventName",
  D extends string = "data"
>(
  message: string,
  keys?: { event: E; data: D }
): ({ [K in E]: string } & { [K in D]: T }) | null {
  if (!message || !message.startsWith(TIKTOK_CONSTANTS.SOCKET_IO_DATA_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      message.substring(TIKTOK_CONSTANTS.SOCKET_IO_DATA_PREFIX.length)
    );

    if (Array.isArray(parsed) && parsed.length >= 1) {
      const eventKey = keys?.event ?? ("eventName" as E);
      const dataKey = keys?.data ?? ("data" as D);

      return {
        [eventKey]: parsed[0],
        [dataKey]: parsed.length > 1 ? parsed[1] : null,
      } as { [K in E]: string } & { [K in D]: T };
    }
  } catch (error) {
    console.error("Error parsing Socket.io message:", error);
  }

  return null;
}

export enum SocketIoPacketType {
  OPEN = "0",
  CLOSE = "1",
  PING = "2",
  PONG = "3",
  MESSAGE = "4",
  UPGRADE = "5",
  NOOP = "6",
}

export enum SocketIoMessageType {
  CONNECT = "0",
  DISCONNECT = "1",
  EVENT = "2",
  ACK = "3",
  ERROR = "4",
  BINARY_EVENT = "5",
  BINARY_ACK = "6",
}

export function SocketIoMessage(message: string) {
  if (!message || message.length < 1) return null;

  const engineType = message[0];
  const socketType = engineType === SocketIoPacketType.MESSAGE ? message[1] : undefined;

  const payloadOffset = engineType === SocketIoPacketType.MESSAGE ? 2 : 1;
  const payloadRaw = message.substring(payloadOffset);

  return {
    engineType,
    socketType,
    isData: message.startsWith(TIKTOK_CONSTANTS.SOCKET_IO_DATA_PREFIX),
    payloadRaw,
  };
}

/**
 * Parses a generic JSON string with error handling
 * @param jsonString - JSON string to parse
 * @returns ParseResult with the parse result
 */
export function parseJson<T = any>(jsonString: string): ParseResult<T> {
  if (!jsonString || typeof jsonString !== "string") {
    return {
      success: false,
      error: ERROR_MESSAGES.PARSE.EMPTY_INPUT,
    };
  }

  try {
    const parsed = JSON.parse(jsonString);
    return {
      success: true,
      data: parsed as T,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : ERROR_MESSAGES.PARSE.UNKNOWN_ERROR,
    };
  }
}

/**
 * Parses a JSON string that must be an array
 * @param jsonString - JSON string to parse
 * @returns ParseResult with the parsed array
 */
export function parseJsonArray<T = any>(jsonString: string): ParseResult<T[]> {
  const parseResult = parseJson<T[]>(jsonString);

  if (!parseResult.success) {
    return parseResult;
  }

  if (!Array.isArray(parseResult.data)) {
    return {
      success: false,
      error: ERROR_MESSAGES.PARSE.NOT_AN_ARRAY,
    };
  }

  return {
    success: true,
    data: parseResult.data,
  };
}

/**
 * Parses a JSON string that must be an object
 * @param jsonString - JSON string to parse
 * @returns ParseResult with the parsed object
 */
export function parseJsonObject<T = Record<string, any>>(
  jsonString: string
): ParseResult<T> {
  const parseResult = parseJson<T>(jsonString);

  if (!parseResult.success) {
    return parseResult;
  }

  if (
    typeof parseResult.data !== "object" ||
    parseResult.data === null ||
    Array.isArray(parseResult.data)
  ) {
    return {
      success: false,
      error: ERROR_MESSAGES.PARSE.NOT_AN_OBJECT,
    };
  }

  return {
    success: true,
    data: parseResult.data,
  };
}

/**
 * Parses a JSON string that must be a primitive value (string, number, boolean, null)
 * @param jsonString - JSON string to parse
 * @returns ParseResult with the parsed primitive value
 */
export function parseJsonPrimitive(
  jsonString: string
): ParseResult<string | number | boolean | null> {
  const parseResult = parseJson<string | number | boolean | null>(jsonString);

  if (!parseResult.success) {
    return parseResult;
  }

  const value = parseResult.data;

  if (typeof value === "object" && value !== null) {
    return {
      success: false,
      error: ERROR_MESSAGES.PARSE.NOT_PRIMITIVE,
    };
  }

  return {
    success: true,
    data: value,
  };
}

/**
 * Safely parses a JSON string with configuration options
 * @param jsonString - JSON string to parse
 * @param options - Configuration options
 * @returns ParseResult with the parse result
 */
export function parseJsonSafe<T = any>(
  jsonString: string,
  options: {
    reviver?: (key: string, value: any) => any;
    strict?: boolean;
    maxDepth?: number;
  } = {}
): ParseResult<T> {
  if (!jsonString || typeof jsonString !== "string") {
    return {
      success: false,
      error: ERROR_MESSAGES.PARSE.EMPTY_INPUT,
    };
  }

  try {
    if (options.strict && options.maxDepth !== undefined) {
      const depth = calculateJsonDepth(jsonString);
      if (depth > options.maxDepth) {
        return {
          success: false,
          error: ERROR_MESSAGES.PARSE.DEPTH_EXCEEDED(options.maxDepth),
        };
      }
    }

    const parsed = JSON.parse(jsonString, options.reviver);
    return {
      success: true,
      data: parsed as T,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : ERROR_MESSAGES.PARSE.UNKNOWN_ERROR,
    };
  }
}

/**
 * Calculates the depth of a JSON string
 * @param jsonString - JSON string to analyze
 * @returns JSON depth
 */
function calculateJsonDepth(jsonString: string): number {
  let maxDepth = 0;
  let currentDepth = 0;

  for (const char of jsonString) {
    if (char === "{" || char === "[") {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    } else if (char === "}" || char === "]") {
      currentDepth--;
    }
  }

  return maxDepth;
}

/**
 * Parses multiple JSON strings at once
 * @param jsonStrings - Array of JSON strings to parse
 * @returns Array of ParseResult
 */
export function parseMultipleJson<T = any>(
  jsonStrings: string[]
): ParseResult<T>[] {
  return jsonStrings.map((str) => parseJson<T>(str));
}

/**
 * Parses a JSON string and formats it nicely
 * @param jsonString - JSON string to parse and format
 * @param indent - Number of spaces for indentation (default: 2)
 * @returns ParseResult with the formatted JSON
 */
export function parseAndFormatJson(
  jsonString: string,
  indent: number = 2
): ParseResult<string> {
  const parseResult = parseJson(jsonString);

  if (!parseResult.success) {
    return parseResult;
  }

  try {
    const formatted = JSON.stringify(parseResult.data, null, indent);
    return {
      success: true,
      data: formatted,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : ERROR_MESSAGES.PARSE.FORMATTING_ERROR,
    };
  }
}

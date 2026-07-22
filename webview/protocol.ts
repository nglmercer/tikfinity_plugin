export const PAYLOAD_PREFIX = "TikFinity_PAYLOAD:";
export const EVENT_PREFIX = "TikFinity_EVENT:";
export const EVENT_CUSTOM_PREFIX = "tikfinity-";
export const SET_UNIQUE_ID = "setUniqueId";
export const EXIT_COMMAND = "TikFinity_EXIT";

export interface TikFinityEvent {
  eventName: string;
  data: unknown;
}

export function stringifyEvent(event: TikFinityEvent): string {
  return JSON.stringify(event);
}

export function parseEvent(raw: string): TikFinityEvent | null {
  try {
    return JSON.parse(raw) as TikFinityEvent;
  } catch {
    return null;
  }
}

export function wrapPayload(payload: string): string {
  return `${PAYLOAD_PREFIX}${payload}`;
}

export function unwrapPayload(raw: string): string {
  return raw.replace(PAYLOAD_PREFIX, "").trim();
}

export function wrapEvent(event: TikFinityEvent): string {
  return `${EVENT_PREFIX}${stringifyEvent(event)}`;
}

export function unwrapEvent(raw: string): TikFinityEvent | null {
  const json = raw.replace(EVENT_PREFIX, "").trim();
  return parseEvent(json);
}

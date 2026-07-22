import {
  SET_UNIQUE_ID,
  EVENT_CUSTOM_PREFIX,
} from "./protocol.ts";

export function buildInjectionScript(): string {
  return `
    (function () {
        // Debug logging: sends messages back to the parent process via IPC
        window.__tikfinity_log__ = function(level, label, data) {
            try {
                var msg = '[TikFinity:' + level + '] ' + label;
                if (data !== undefined) {
                    msg += ' ' + (typeof data === 'object' ? JSON.stringify(data) : String(data));
                }
                if (window.ipc && window.ipc.postMessage) {
                    window.ipc.postMessage('__TIKFIVITY_LOG__:' + msg);
                }
            } catch(e) {}
        };

        try {
            window.__tikfinity_log__('INFO', 'injection script starting');

            window.TiktokPayload = window.TiktokPayload || "";
            window.pendingEvents = window.pendingEvents || [];

            window.getPayload = function () {
                return window.TiktokPayload;
            };

            window.getPendingEvents = function () {
                const events = window.pendingEvents.slice();
                window.pendingEvents = [];
                return events;
            };

            window.checkForEvents = function () {
                if (window.pendingEvents.length > 0) {
                    return window.pendingEvents.shift();
                }
                return null;
            };

            window.sendToBackend = function(data) {
                window.__tikfinity_log__('INFO', 'sendToBackend called', { dataLen: data ? data.length : 0 });
                window.ipc.postMessage(data);
            };

            window.__webview_on_message__ = function(message) {
                try {
                    const event = JSON.parse(message);
                    window.pendingEvents.push(event);
                    window.dispatchEvent(new MessageEvent('message', {
                        data: event,
                        origin: 'tikfinity-backend',
                        bubbles: true
                    }));
                    if (event.eventName) {
                        window.dispatchEvent(new CustomEvent('${EVENT_CUSTOM_PREFIX}' + event.eventName, {
                            detail: event
                        }));
                    }
                    window.__tikfinity_log__('INFO', 'event received from backend', { eventName: event.eventName });
                } catch (e) {
                    window.__tikfinity_log__('ERROR', 'failed to parse event from backend', { error: e.message, message: message });
                }
            };

            // Intercept WebSocket at the prototype level
            function interceptWebSocketPrototype() {
                if (typeof WebSocket === 'undefined') {
                    window.__tikfinity_log__('WARN', 'WebSocket not available');
                    return;
                }
                if (!WebSocket.prototype || !WebSocket.prototype.send) {
                    window.__tikfinity_log__('WARN', 'WebSocket.prototype.send not available');
                    return;
                }
                if (WebSocket.prototype.send.__tikfinityIntercepted) {
                    return;
                }

                try {
                    const originalSend = WebSocket.prototype.send;
                    WebSocket.prototype.send = function (data) {
                        if (typeof data === 'string' && data.includes("${SET_UNIQUE_ID}")) {
                            if (window.TiktokPayload !== data) {
                                window.__tikfinity_log__('INFO', 'prototype interceptor captured payload', { dataLen: data.length });
                                window.TiktokPayload = data;
                                window.ipc.postMessage(data);
                            }
                        }
                        return originalSend.apply(this, arguments);
                    };
                    WebSocket.prototype.send.__tikfinityIntercepted = true;
                    window.__tikfinity_log__('INFO', 'WebSocket prototype interceptor installed');
                } catch(e) {
                    window.__tikfinity_log__('ERROR', 'prototype interceptor failed', { error: e.message });
                }
            }

            // Intercept WebSocket at the constructor level (catches page replacements)
            function interceptWebSocketConstructor() {
                if (typeof WebSocket === 'undefined') {
                    window.__tikfinity_log__('WARN', 'WebSocket constructor not available');
                    return;
                }
                if (window.WebSocket.__tikfinityIntercepted) {
                    return;
                }

                try {
                    var OriginalWebSocket = WebSocket;
                    var wrappedWebSocket = function(url, protocols) {
                        window.__tikfinity_log__('INFO', 'WebSocket constructed', { url: String(url) });
                        var instance = new OriginalWebSocket(url, protocols);

                        // Wrap the instance's send method directly
                        if (instance && instance.send) {
                            var originalInstanceSend = instance.send.bind(instance);
                            instance.send = function(data) {
                                if (typeof data === 'string' && data.includes("${SET_UNIQUE_ID}")) {
                                    if (window.TiktokPayload !== data) {
                                        window.__tikfinity_log__('INFO', 'constructor interceptor captured payload', { dataLen: data.length });
                                        window.TiktokPayload = data;
                                        window.ipc.postMessage(data);
                                    }
                                }
                                return originalInstanceSend(data);
                            };
                        }

                        return instance;
                    };

                    // Copy static properties
                    wrappedWebSocket.prototype = OriginalWebSocket.prototype;
                    wrappedWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
                    wrappedWebSocket.OPEN = OriginalWebSocket.OPEN;
                    wrappedWebSocket.CLOSING = OriginalWebSocket.CLOSING;
                    wrappedWebSocket.CLOSED = OriginalWebSocket.CLOSED;
                    wrappedWebSocket.__tikfinityIntercepted = true;

                    window.WebSocket = wrappedWebSocket;
                    // Also try to set on globalThis for pages that use the global directly
                    try { this.WebSocket = wrappedWebSocket; } catch(e) {}

                    window.__tikfinity_log__('INFO', 'WebSocket constructor interceptor installed');
                } catch(e) {
                    window.__tikfinity_log__('ERROR', 'constructor interceptor failed', { error: e.message });
                }
            }

            // Install both interceptors
            interceptWebSocketPrototype();
            interceptWebSocketConstructor();

            // Re-install on page load (handles reconnect/reload)
            window.addEventListener('load', function() {
                window.__tikfinity_log__('INFO', 'page load event, re-installing interceptors');
                interceptWebSocketPrototype();
                interceptWebSocketConstructor();
            });

            // Also retry after a short delay (catches late WebSocket definitions)
            setTimeout(function() {
                window.__tikfinity_log__('INFO', 'delayed retry, re-installing interceptors');
                interceptWebSocketPrototype();
                interceptWebSocketConstructor();
            }, 500);

            window.__tikfinity_log__('INFO', 'injection script completed');
        } catch(e) {
            window.__tikfinity_log__('ERROR', 'injection script crashed', { error: e.message, stack: e.stack });
        }
    })();
  `;
}


function sanitizeEndpoint(endpoint: string): string {
    try {
        const url = new URL(endpoint);
        return url.hostname;
    } catch {
        return endpoint;
    }
}

/**
 * Returns a favicon URL for the given endpoint using Google's favicon service.
 * The URL can be used directly as an `<img src>` — the browser handles the fetch.
 * Returns null if the endpoint is empty or not a valid URL.
 */
export function resolveEndpointMetadataAsImage(endpoint: string): string | null {
    if (!endpoint) return null;
    try {
        const url = new URL(endpoint); // validate
        const hostname = url.hostname.toLowerCase();
        if (
            hostname === 'localhost' ||
            hostname.endsWith('.local') ||
            hostname.startsWith('127.') ||
            hostname === '::1' ||
            hostname.startsWith('10.') ||
            hostname.startsWith('192.168.')
        ) {
            return null;
        }
        const domain = encodeURIComponent(sanitizeEndpoint(endpoint));
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch {
        return null;
    }
}
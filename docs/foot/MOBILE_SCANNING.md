# Mobile scanning

## Capture page
`/ai-demos/ai-shoe-foot-measurement-fitting/app/scan` – mobile-first, installable (manifest `/foot.webmanifest`, service worker `/api/foot/sw` with widened scope; caches only the scanner page shell and static assets, never photos or API calls).

## Camera
`getUserMedia` with `facingMode: environment` (ideal 1920×1440), camera switch via `enumerateDevices`, tracks stopped on close/unmount. States handled: starting, permission denied, no device, unsupported/insecure context (non-https), generic error – each with a **photo-picker fallback** (`<input type=file accept=image/* capture=environment>`).

## Live guidance (real, on-device)
Every ~650 ms a 480 px frame goes through `detectPaper` – the same detector the server uses. Hints are shown only for what is actually computed: sheet found, all four corners inside the frame, tilt ratio, paper coverage, brightness/glare, focus (variance of Laplacian-style sharpness). The capture button works regardless; the server re-checks every photo.

## Desktop → phone link
1. Desktop creates a session (owner key kept in browser localStorage).
2. "Create QR code" mints a 30-minute **capture-only** token; the QR encodes `…/app/scan#s=<sessionId>&t=<token>`.
3. The phone page reads the fragment, stores it in `sessionStorage`, strips it from the URL, and uploads with `x-foot-phone`.
4. The desktop polls the capture list every 4 s while on the Method/Photos steps and shows arriving photos.
Tokens can be revoked; an expired/invalid token shows "create a new QR code". The token cannot read results, view images, delete, or change the session.

## Upload
Phone photos are downscaled client-side to ≤2200 px (JPEG 0.9) before upload; progress via XHR, retry on failure. Server limit 8 MB, types sniffed by magic bytes (not the extension).

## Limits
HEIC/HEIF is not accepted (convert to JPEG first; iOS Safari usually converts for you when you pick from the library). No offline queue: photos need a connection to send.

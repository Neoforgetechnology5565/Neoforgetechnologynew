# Visitor analytics

First-party, cookie-less, consent-based. **Admin → Analytics** shows where visitors come from, where they are (approximately), what they look at and click, how they move through the site, and which visits ended in an enquiry.

## What is collected, and only after the visitor accepts
Nothing is sent until the visitor presses Accept in the privacy notice, never when the browser sends Do-Not-Track, and never from `/admin`.

| Data | How | Stored |
|---|---|---|
| Random visitor id | made in the browser (`localStorage`) | yes, with the visit record |
| Visit id | `sessionStorage`; a visit ends after 30 min idle | yes |
| Page path, order of pages | the tracker | counters, and the last 40 pages of a visitor |
| Referring site | host name only (the browser sends the origin; paths and queries are never kept) | yes |
| Campaign | `utm_source`, `utm_medium`, `utm_campaign` | yes |
| **Approximate location**: country, region (state/province), city | the hosting platform's IP lookup, passed in request headers (`x-vercel-ip-*`) | yes; coordinates rounded to 0.1° (~11 km) |
| Time zone, language | the browser | yes |
| Device type, browser, operating system | coarse categories derived from the User-Agent | yes (the raw User-Agent is not) |
| Clicks | label, kind (link/button) and destination **path** of clicked buttons and links | counters and the last 30 clicks of a visitor |
| Online now | a heartbeat from each open page: random id, page path, country; kept ~1 hour, shown as visitors in the last 90 s (no consent needed, nothing stored on the visitor's device) | yes |
| Contact link | when a visitor sends the contact form while statistics are on, the form sends their visitor id so the message is tied to the visit | yes, with a snapshot on the inquiry |

**Never collected:** the IP address (we never see or log it), precise/GPS location (the site never requests it), anything typed into a field, email addresses or phone numbers (removed from click labels; `mailto:`/`tel:` links keep only the scheme), full referrer URLs, the raw User-Agent. Demo workspaces (`…/app`) count the visit but their buttons are not click-tracked.

## Location is approximate
IP-derived location is a city-level estimate and can be wrong (VPNs, mobile networks, corporate networks). The dashboard labels it approximate everywhere and shows **Unknown** when the host sent no location. There is no third-party geolocation service: the hosting platform already resolves the IP; where the site is not on Vercel (or locally) location is simply Unknown.

## Retention and deletion
Individual visitor records are deleted after **180 days** without a visit (done whenever the dashboard loads). **Visitors → open a visitor → Erase** deletes one record immediately. The daily counters are anonymous aggregates and are kept.

## Dashboard
Range 7/30/90 days. Tabs: Overview, Locations (countries, states/regions, cities, time zones), Sources & devices, Pages & interest (services, portfolio projects, demos, blog), Clicks, Navigation (page-to-page flows, entry pages), Visitors (table and per-visitor detail), Contacts (visitors who enquired). The Inquiries inbox shows the visit context of an enquiry when there is one.

## Data model (Firestore)
`analytics_daily/{YYYY-MM-DD}`: nested counters (`views`, `sessions`, `pages`, `countries`, `visitsByCountry`, `regions`, `cities`, `timezones`, `channels`, `sources`, `referrers`, `campaigns`, `devices`, `browsers`, `os`, `entries`, `flows`, `services`, `projects`, `demos`, `blogs`, `clicks`, `inquiries`…). `analytics_visitors/{id}`: the visitor profile. `analytics_totals/all`. Counters from before this upgrade (`views`, `visits`, `visitors`, `countries`, `pages`, `projects`) keep their meaning; `visits` in the report is the number of visits (sessions) from the upgrade onward.

## Privacy policy
The default privacy text (`lib/legal-defaults.ts`) and the privacy notice describe the above. If the privacy page text was edited in Admin → Site content, update that copy too.

## Tests
`npm run test:analytics` (parsing, location headers, source classification, the tracking code against an in-memory store, privacy checks) and `npm run test:analytics:ui` (dashboard on a realistic dataset, the tracker in a real browser, access control; needs a running production build).

## Visitor alerts (get notified when someone arrives)
**Admin → Analytics → Alerts.** When a visit starts, the server can email you and/or push a notification to your phone or computer. It is sent by the server, so it works when you are logged out, offline, or have the admin closed.

- **Email** uses the SMTP settings the site already uses for enquiries (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, optional `NOTIFY_TO`). It works on every device.
- **Push** needs VAPID keys (generate them in Admin → Maintenance; set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`; redeploy), then **Enable on this device** on each phone/computer. iPhones only deliver web push to sites added to the Home Screen.
- **Throttle:** at most one alert per 1 min – 4 h (default 10 min). Visits in between are counted and reported in the next alert ("+3 more visits since the last alert"). Optional "first-time visitors only".
- **Content:** title, approximate place, where they came from, the page they opened, device type. Nothing that identifies a person.
- **Limit:** alerts come from the same consent-based statistics, so visitors who declined or send Do-Not-Track do not trigger them.
- **Test:** "Send a test alert" sends through the channels you switched on and reports what happened (for example "email: not configured").
- Storage: settings in `content/visitorAlerts`, your push devices in `content/adminPush` (up to 5; expired ones are removed automatically).

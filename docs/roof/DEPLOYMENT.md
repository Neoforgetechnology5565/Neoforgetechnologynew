# Deployment

* The static Next.js site works without the service (stored sample result, labelled). Live analysis needs the service.
* Service: `docker build -f services/roof-analyzer/Dockerfile -t neoforge-roof .` then run on port 8040 with a 2+ GB memory limit and 1–2 CPUs. Set `ROOF_ALLOWED_ORIGINS` to the site origin.
* Site: set `ROOF_API_URL` (server-side only; the API origin is not exposed to the browser) in the hosting environment. See `.env.example`.
* Vercel serverless functions are unsuitable for the service (model size, duration); host it on a container platform. Nothing here deploys or changes DNS.
* No secrets are used. Uploaded files live only in a temp directory and are deleted after the TTL.

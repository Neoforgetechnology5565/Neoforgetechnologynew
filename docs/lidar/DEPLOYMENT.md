# Deployment

```bash
cd services/lidar-wires
docker build -t neoforge-lidar . && docker run -p 8070:8070 neoforge-lidar
```
Set `LIDAR_API_URL` for the Next.js site (see `.env.example`). Without it the page explains that the service is not connected. Memory scales with point count. Limits are environment variables: `LIDAR_MAX_FILE_MB` (200), `LIDAR_MAX_POINTS` (6,000,000), `LIDAR_MAX_CLOUDS` (4), `LIDAR_MAX_VERSIONS` (4), `LIDAR_TTL_SECONDS` (3600), `LIDAR_VIEW_POINTS` (1,500,000), `LIDAR_MAX_CONCURRENT` (2), `LIDAR_ALLOWED_ORIGINS`.

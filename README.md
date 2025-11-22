# Weather API Proxy

Simple Node.js backend that proxies Visual Crossing Weather API with Redis caching to reduce API calls by 80-90%.

## Features

- ✅ Single endpoint for weather data
- ✅ Redis caching (10-minute TTL per location)
- ✅ Location rounding (nearby users share cache)
- ✅ Clean JSON responses ready for iOS app
- ✅ Error handling and fallbacks
- ✅ Health check endpoint

## Quick Start

### Prerequisites

- Node.js 18+ installed
- Visual Crossing API key ([get one here](https://www.visualcrossing.com/sign-up))
- Redis instance (local or Railway)

### Local Development

1. **Clone and install:**
   ```bash
   git clone https://github.com/JoyalJJoyan/weather-api-proxy.git
   cd weather-api-proxy
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Visual Crossing API key:
   ```
   VISUAL_CROSSING_API_KEY=your_actual_key_here
   REDIS_URL=redis://localhost:6379
   PORT=3000
   CACHE_TTL=600
   ```

3. **Start Redis** (if running locally):
   ```bash
   # Mac (with Homebrew)
   brew services start redis
   
   # Linux
   sudo systemctl start redis
   
   # Docker
   docker run -d -p 6379:6379 redis:alpine
   ```

4. **Run the server:**
   ```bash
   npm start
   ```

5. **Test it:**
   ```bash
   curl "http://localhost:3000/weather?lat=35.68&lon=139.65"
   ```

## API Endpoints

### `GET /weather`

Get weather data for a location.

**Parameters:**
- `lat` (required): Latitude (-90 to 90)
- `lon` (required): Longitude (-180 to 180)

**Example:**
```bash
GET /weather?lat=35.6762&lon=139.6503
```

**Response:**
```json
{
  "location": {
    "lat": 35.68,
    "lon": 139.65,
    "address": "Tokyo, Japan",
    "timezone": "Asia/Tokyo"
  },
  "current": {
    "temp": 18.5,
    "feelsLike": 17.2,
    "humidity": 65,
    "windSpeed": 12.5,
    "condition": "Partly cloudy",
    "icon": "partly-cloudy-day",
    "precipProb": 10
  },
  "hourly": [...], // Next 48 hours
  "daily": [...],  // Next 7 days
  "cached": false,
  "timestamp": "2025-11-22T12:50:16Z"
}
```

### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "redis": "connected",
  "timestamp": "2025-11-22T12:50:16Z"
}
```

## Deploy to Railway

1. **Sign up for Railway:**
   - Go to [railway.app](https://railway.app)
   - Sign in with GitHub

2. **Create new project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose `weather-api-proxy`

3. **Add Redis:**
   - Click "+ New"
   - Select "Database" → "Redis"
   - Railway auto-creates `REDIS_URL` variable

4. **Add environment variables:**
   - Go to your service → "Variables"
   - Add: `VISUAL_CROSSING_API_KEY` = your API key
   - `PORT` and `REDIS_URL` are auto-provided by Railway

5. **Deploy:**
   - Railway auto-deploys on every push
   - Get your URL: `https://your-app.up.railway.app`

6. **Test deployment:**
   ```bash
   curl "https://your-app.up.railway.app/health"
   curl "https://your-app.up.railway.app/weather?lat=35.68&lon=139.65"
   ```

## How Caching Works

1. Request comes in with lat/lon
2. Coordinates rounded to 2 decimals (~1km precision)
3. Cache key created: `weather:35.68:139.65`
4. Redis checked for cached data
5. If found (< 10 min old) → return cached (fast!)
6. If not found → call Visual Crossing API → cache → return

**Result:** 80-90% reduction in API calls

## Caching Example

```
User A: lat=35.6812, lon=139.6545 → rounds to 35.68, 139.65 → API call → cache
User B: lat=35.6789, lon=139.6523 → rounds to 35.68, 139.65 → cache HIT (no API call)
User C: lat=35.7123, lon=139.7001 → rounds to 35.71, 139.70 → API call → cache

After 10 minutes, cache expires and next request calls API again.
```

## Cost Estimate

- **Visual Crossing:** 1,000 calls/day free
- **With caching:** 100 users = ~100-200 calls/day
- **Railway:** $5/month (includes Redis)
- **Total:** ~$5/month for 100+ users

## Troubleshooting

### "Invalid API key"
- Check `.env` has correct `VISUAL_CROSSING_API_KEY`
- Test your key at [Visual Crossing account page](https://www.visualcrossing.com/account)

### "Redis connection failed"
- Server runs without cache (degraded mode)
- Check `REDIS_URL` is correct
- On Railway, ensure Redis service is running

### "Request timeout"
- Visual Crossing API slow or down
- Server has 10-second timeout built-in

### High API usage
- Check Redis is connected (should see "Redis connected" in logs)
- Verify cache hits in logs: "Cache HIT" vs "Cache MISS"
- If mostly misses, check Redis connection

## Monitoring

**Check logs for:**
- ✅ Cache HIT: request served from cache (fast, no API call)
- ❌ Cache MISS: request called Visual Crossing API
- 💾 Cached: data stored in Redis for 10 minutes

**Good ratio:** 70-90% cache hits for 100+ users

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VISUAL_CROSSING_API_KEY` | Yes | - | Your Visual Crossing API key |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection URL |
| `PORT` | No | `3000` | Server port |
| `CACHE_TTL` | No | `600` | Cache duration in seconds |

## Tech Stack

- **Node.js** - Runtime
- **Express** - Web framework
- **Redis** - Caching layer
- **Axios** - HTTP client
- **Visual Crossing** - Weather data provider

## License

MIT

## Author

Joyal J Joy

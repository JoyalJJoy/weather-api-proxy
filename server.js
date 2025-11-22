require('dotenv').config();
const express = require('express');
const axios = require('axios');
const redis = require('redis');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_TTL = parseInt(process.env.CACHE_TTL) || 600; // 10 minutes

// Redis client setup
let redisClient;
let redisConnected = false;

 (async () => {
  if (process.env.REDIS_URL) {
    try {
      redisClient = redis.createClient({
        url: process.env.REDIS_URL,
        socket: {
          reconnectStrategy: false // Don't keep retrying
        }
      });

      redisClient.on('error', (err) => {
        console.error('⚠️  Redis error:', err.message);
        redisConnected = false;
      });

      redisClient.on('connect', () => {
        console.log('✅ Redis connected');
        redisConnected = true;
      });

      await redisClient.connect();
    } catch (err) {
      console.error('⚠️  Redis connection failed, running without cache:', err.message);
      redisConnected = false;
      redisClient = null;
    }
  } else {
    console.log('⚠️  No REDIS_URL provided, running without cache');
    redisConnected = false;
  }

    redisClient.on('connect', () => {
      console.log('✅ Redis connected');
      redisConnected = true;
    });

    await redisClient.connect();
  } catch (err) {
    console.error('⚠️  Redis connection failed, running without cache:', err.message);
    redisConnected = false;
  }
})();

// Middleware
app.use(express.json());

// Helper: Round coordinates to 2 decimals (~1km precision)
function roundCoordinate(coord) {
  return Math.round(coord * 100) / 100;
}

// Helper: Validate lat/lon
function validateCoordinates(lat, lon) {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);
  
  if (isNaN(latitude) || isNaN(longitude)) {
    return { valid: false, error: 'Invalid coordinates format' };
  }
  
  if (latitude < -90 || latitude > 90) {
    return { valid: false, error: 'Latitude must be between -90 and 90' };
  }
  
  if (longitude < -180 || longitude > 180) {
    return { valid: false, error: 'Longitude must be between -180 and 180' };
  }
  
  return { valid: true, latitude, longitude };
}

// Helper: Transform Visual Crossing response to clean format
function transformWeatherData(data, lat, lon, cached = false) {
  const current = data.currentConditions;
  const days = data.days || [];
  
  // Get next 48 hours
  const hourly = [];
  let hoursCollected = 0;
  
  for (const day of days) {
    if (hoursCollected >= 48) break;
    if (!day.hours) continue;
    
    for (const hour of day.hours) {
      if (hoursCollected >= 48) break;
      hourly.push({
        time: `${day.datetime}T${hour.datetime}`,
        temp: hour.temp,
        precipProb: hour.precipprob || 0,
        condition: hour.conditions,
        icon: hour.icon,
        humidity: hour.humidity,
        windSpeed: hour.windspeed
      });
      hoursCollected++;
    }
  }
  
  // Get next 7 days
  const daily = days.slice(0, 7).map(day => ({
    date: day.datetime,
    tempMax: day.tempmax,
    tempMin: day.tempmin,
    precipProb: day.precipprob || 0,
    condition: day.conditions,
    icon: day.icon,
    humidity: day.humidity,
    windSpeed: day.windspeed
  }));
  
  return {
    location: {
      lat: roundCoordinate(lat),
      lon: roundCoordinate(lon),
      address: data.resolvedAddress,
      timezone: data.timezone
    },
    current: {
      temp: current.temp,
      feelsLike: current.feelslike,
      humidity: current.humidity,
      windSpeed: current.windspeed,
      condition: current.conditions,
      icon: current.icon,
      precipProb: current.precipprob || 0
    },
    hourly,
    daily,
    cached,
    timestamp: new Date().toISOString()
  };
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    redis: redisConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Main weather endpoint
app.get('/weather', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    
    // Validate coordinates
    const validation = validateCoordinates(lat, lon);
    if (!validation.valid) {
      return res.status(400).json({
        error: validation.error,
        message: 'Please provide valid lat and lon parameters'
      });
    }
    
    const { latitude, longitude } = validation;
    const roundedLat = roundCoordinate(latitude);
    const roundedLon = roundCoordinate(longitude);
    
    // Create cache key
    const cacheKey = `weather:${roundedLat}:${roundedLon}`;
    
    // Try to get from cache
    if (redisConnected) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          console.log(`✅ Cache HIT: ${cacheKey}`);
          const data = JSON.parse(cached);
          data.cached = true;
          data.timestamp = new Date().toISOString();
          return res.json(data);
        }
        console.log(`❌ Cache MISS: ${cacheKey}`);
      } catch (cacheError) {
        console.error('Cache read error:', cacheError.message);
      }
    }
    
    // Check if API key is configured
    if (!process.env.VISUAL_CROSSING_API_KEY) {
      return res.status(500).json({
        error: 'API key not configured',
        message: 'VISUAL_CROSSING_API_KEY environment variable is missing'
      });
    }
    
    // Fetch from Visual Crossing API
    const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${roundedLat},${roundedLon}`;
    const params = {
      unitGroup: 'metric',
      key: process.env.VISUAL_CROSSING_API_KEY,
      include: 'hours,current,days',
      elements: 'datetime,temp,tempmax,tempmin,feelslike,humidity,precip,precipprob,windspeed,conditions,icon'
    };
    
    console.log(`🌐 Fetching weather for ${roundedLat},${roundedLon}...`);
    const response = await axios.get(url, { params, timeout: 10000 });
    
    // Transform and return data
    const weatherData = transformWeatherData(response.data, roundedLat, roundedLon, false);
    
    // Cache the result
    if (redisConnected) {
      try {
        await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(weatherData));
        console.log(`💾 Cached for ${CACHE_TTL}s: ${cacheKey}`);
      } catch (cacheError) {
        console.error('Cache write error:', cacheError.message);
      }
    }
    
    res.json(weatherData);
    
  } catch (error) {
    console.error('Error:', error.message);
    
    if (error.response) {
      // Visual Crossing API error
      return res.status(error.response.status).json({
        error: 'Weather API error',
        message: error.response.data?.message || error.message,
        details: error.response.data
      });
    }
    
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        error: 'Request timeout',
        message: 'Weather API took too long to respond'
      });
    }
    
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'Endpoint not found. Use GET /weather?lat={lat}&lon={lon}'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Weather API Proxy running on port ${PORT}`);
  console.log(`📍 Endpoint: http://localhost:${PORT}/weather?lat=35.68&lon=139.65`);
  console.log(`💚 Health: http://localhost:${PORT}/health`);
});

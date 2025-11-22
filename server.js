 require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Weather endpoint
app.get('/weather', async (req, res) => {
  try {
    const lat = req.query.lat;
    const lon = req.query.lon;
    
    if (!lat || !lon) {
      return res.status(400).json({
        error: 'Missing parameters',
        message: 'Please provide lat and lon parameters'
      });
    }
    
    if (!process.env.VISUAL_CROSSING_API_KEY) {
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'API key not configured'
      });
    }
    
    const url = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/' + lat + ',' + lon;
    
    console.log('Fetching weather for ' + lat + ',' + lon);
    
    const response = await axios.get(url, {
      params: {
        unitGroup: 'metric',
        key: process.env.VISUAL_CROSSING_API_KEY,
        include: 'hours,current,days'
      },
      timeout: 10000
    });
    
    const data = response.data;
    
    res.json({
      location: {
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        address: data.resolvedAddress,
        timezone: data.timezone
      },
      current: data.currentConditions,
      hourly: data.days && data.days[0] && data.days[0].hours ? data.days[0].hours.slice(0, 48) : [],
      daily: data.days ? data.days.slice(0, 7) : [],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching weather:', error.message);
    
    res.status(500).json({
      error: 'Failed to fetch weather data',
      message: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('Weather API server running on port ' + PORT);
});

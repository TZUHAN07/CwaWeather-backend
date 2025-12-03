require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

// 台灣六都配置
const CITIES = {
  taipei: { id: "taipei", name: "臺北市", displayName: "台北市" },
  newtaipei: { id: "newtaipei", name: "新北市", displayName: "新北市" },
  taoyuan: { id: "taoyuan", name: "桃園市", displayName: "桃園市" },
  taichung: { id: "taichung", name: "臺中市", displayName: "台中市" },
  tainan: { id: "tainan", name: "臺南市", displayName: "台南市" },
  kaohsiung: { id: "kaohsiung", name: "高雄市", displayName: "高雄市" },
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 取得指定都市的天氣預報
 * 使用 CWA 「一般天氣預報-今明 36 小時天氣預報」資料集
 */
const getCityWeather = async (req, res) => {
  try {
    const { city } = req.params;

    // 驗證城市是否有效
    if (!CITIES[city]) {
      return res.status(400).json({
        error: "無效的城市代碼",
        message: `城市代碼必須是: ${Object.keys(CITIES).join(", ")}`,
        validCities: Object.values(CITIES).map((c) => ({
          id: c.id,
          name: c.displayName,
        })),
      });
    }

    // 檢查 API Key
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    const cityName = CITIES[city].name;

    // 呼叫 CWA API
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: cityName,
        },
      }
    );

    // 檢查回應資料
    if (
      !response.data.records ||
      !response.data.records.location ||
      response.data.records.location.length === 0
    ) {
      return res.status(404).json({
        error: "查無資料",
        message: `無法取得 ${CITIES[city].displayName} 的天氣資料`,
      });
    }

    const locationData = response.data.records.location[0];

    // 整理天氣資料
    const weatherData = {
      city: CITIES[city].displayName,
      cityId: city,
      updateTime: response.data.records.datasetDescription,
      forecastTime:
        locationData.weatherElement[0]?.time?.[0]?.startTime || null,
      forecasts: [],
    };

    // 解析天氣要素
    const weatherElements = locationData.weatherElement;
    const timeCount = weatherElements[0].time.length;

    for (let i = 0; i < timeCount; i++) {
      const forecast = {
        startTime: weatherElements[0].time[i].startTime,
        endTime: weatherElements[0].time[i].endTime,
        weather: "不明",
        rain: "0%",
        minTemp: "N/A",
        maxTemp: "N/A",
        comfort: "不明",
        windSpeed: "0",
      };

      weatherElements.forEach((element) => {
        const value = element.time[i].parameter;
        if (value) {
          switch (element.elementName) {
            case "Wx":
              forecast.weather = value.parameterName || "不明";
              break;
            case "PoP":
              forecast.rain = (value.parameterName || "0") + "%";
              break;
            case "MinT":
              forecast.minTemp = (value.parameterName || "N/A") + "°C";
              break;
            case "MaxT":
              forecast.maxTemp = (value.parameterName || "N/A") + "°C";
              break;
            case "CI":
              forecast.comfort = value.parameterName || "不明";
              break;
            case "WS":
              forecast.windSpeed = value.parameterName || "0";
              break;
          }
        }
      });

      weatherData.forecasts.push(forecast);
    }

    res.json({
      success: true,
      data: weatherData,
    });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
        details: error.response.data,
      });
    }

    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
    });
  }
};

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "歡迎使用台灣六都天氣預報 API",
    description: "提供台北市、新北市、桃園市、台中市、台南市和高雄市的天氣預報",
    endpoint: "/api/weather/:city",
    availableCities: Object.values(CITIES).map((c) => ({
      id: c.id,
      name: c.displayName,
      apiName: c.name,
    })),
    example: "/api/weather/taipei",
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 取得都市列表
app.get("/api/cities", (req, res) => {
  res.json({
    success: true,
    cities: Object.values(CITIES).map((c) => ({
      id: c.id,
      name: c.displayName,
      apiName: c.name,
    })),
  });
});

// 取得指定都市天氣預報
app.get("/api/weather/:city", getCityWeather);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "伺服器錯誤",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "找不到此路徑",
    message: "請使用正確的 API 端點",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器運行中`);
  console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
  console.log(
    `🌐 支援城市: ${Object.values(CITIES)
      .map((c) => c.displayName)
      .join(", ")}`
  );
});

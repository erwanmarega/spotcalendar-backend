const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cookieParser = require("cookie-parser");
require("dotenv").config({
  path: `.env.${process.env.NODE_ENV || "development"}`,
});

const app = express();

app.use(cors({
  origin: "https://spotcalendar.vercel.app",
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.options("*", cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

if (!redirectUri) {
  throw new Error("REDIRECT_URI is not defined in .env file");
}
if (!clientId) {
  throw new Error("SPOTIFY_CLIENT_ID is not defined in .env file");
}
if (!clientSecret) {
  throw new Error("SPOTIFY_CLIENT_SECRET is not defined in .env file");
}

app.get("/", (req, res) => {
  res.json({ message: "Bienvenue sur l'API de l'application Spotify !" });
});

app.post("/api/token", async (req, res) => {
  console.log("Requête reçue sur /api/token");
  console.log("Méthode HTTP :", req.method);
  console.log("En-têtes :", req.headers);
  console.log("Corps de la requête :", req.body);

  const { code } = req.body;

  if (!code) {
    console.log("Erreur : Aucun code fourni");
    return res.status(400).json({ error: "Aucun code fourni dans la requête" });
  }

  try {
    const response = await axios({
      method: "post",
      url: "https://accounts.spotify.com/api/token",
      data: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    res.cookie("access_token", response.data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: response.data.expires_in * 1000
    });
    res.cookie("refresh_token", response.data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
    res.cookie("expires_at", (Date.now() + response.data.expires_in * 1000).toString(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: response.data.expires_in * 1000
    });
    res.cookie("token_type", response.data.token_type || "Bearer", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: response.data.expires_in * 1000
    });

    res.json({ message: "Tokens stockés dans les cookies" });
  } catch (error) {
    console.error("Erreur lors de l'échange du code :", error);
    console.error("Données de l'erreur :", error.response?.data);
    console.error("Statut HTTP :", error.response?.status);
    res.status(500).json({ error: "Échec de l'échange du code contre le jeton", details: error.response?.data });
  }
});

app.post("/api/refresh-token", async (req, res) => {
  const refreshToken = req.cookies.refresh_token;

  if (!refreshToken) {
    return res.status(400).json({ error: "Aucun refresh_token fourni" });
  }

  try {
    const response = await axios({
      method: "post",
      url: "https://accounts.spotify.com/api/token",
      data: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    res.cookie("access_token", response.data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: response.data.expires_in * 1000
    });
    res.cookie("expires_at", (Date.now() + response.data.expires_in * 1000).toString(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: response.data.expires_in * 1000
    });
    res.cookie("token_type", response.data.token_type || "Bearer", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: response.data.expires_in * 1000
    });
    if (response.data.refresh_token) {
      res.cookie("refresh_token", response.data.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 30 * 24 * 60 * 60 * 1000
      });
    }

    res.json({ message: "Tokens rafraîchis" });
  } catch (error) {
    console.error("Erreur lors du rafraîchissement du jeton :", error);
    console.error("Données de l'erreur :", error.response?.data);
    console.error("Statut HTTP :", error.response?.status);
    res.status(500).json({ error: "Échec du rafraîchissement du jeton", details: error.response?.data });
  }
});

app.get("/api/check-tokens", (req, res) => {
  res.json({
    access_token_exists: !!req.cookies.access_token,
    refresh_token_exists: !!req.cookies.refresh_token,
    expires_at: req.cookies.expires_at || null,
    token_type: req.cookies.token_type || null,
  });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
  res.clearCookie("expires_at");
  res.clearCookie("token_type");
  res.json({ message: "Déconnexion réussie, cookies supprimés" });
});

app.get("/api/spotify/:path(*)", async (req, res) => {
  const accessToken = req.cookies.access_token;
  console.log("Access Token:", accessToken);
  if (!accessToken) {
    return res.status(401).json({ error: "Aucun token d'accès" });
  }

  try {
    const queryString = req.url.includes("?") ? `?${req.url.split("?")[1]}` : "";
    const spotifyUrl = `https://api.spotify.com/v1/${req.params.path}${queryString}`;
    console.log("Spotify URL:", spotifyUrl);
    const response = await axios({
      method: "get",
      url: spotifyUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error("Erreur lors de la requête Spotify :", error);
    console.error("Données de l'erreur :", error.response?.data);
    console.error("Statut HTTP :", error.response?.status);
    res.status(error.response?.status || 500).json({ error: "Échec de la requête Spotify", details: error.response?.data });
  }
});

const port = process.env.PORT || 3000;
try {
  app.listen(port, () => {
    console.log(`Serveur démarré sur le port ${port}`);
  });
} catch (error) {
  console.error("Erreur lors du démarrage du serveur :", error);
  process.exit(1);
}

module.exports = app;
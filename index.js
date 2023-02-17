import express from "express";
import dotenv from "dotenv";
import "@shopify/shopify-api/adapters/node";
import { shopifyApi, LATEST_API_VERSION } from "@shopify/shopify-api";

dotenv.config();

const host = "localhost";
const port = process.env.PORT || 9000;

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SHOPIFY_API_SCOPES,
  HOST,
  X_SHOPIFY_ACCESS_TOKEN,
} = process.env;

const shops = {};
const shopify = shopifyApi({
  // The next 4 values are typically read from environment variables for added security
  apiKey: SHOPIFY_API_KEY,
  apiSecretKey: SHOPIFY_API_SECRET,
  scopes: SHOPIFY_API_SCOPES,
  hostName: HOST.replace(/https:\/\//, ""),
  IS_EMBEDDED_APP: false,
});

const app = express();

app.get("/", async (req, res) => {
  //res.send('Hello World !');
  if (typeof shops[req.query.shop] !== "undefined") {
    // const sessionToken = await getSessionToken(bridgeApp);
    // console.log(sessionToken);
    res.send("Hello World");
  } else {
    console.log(req.query["shop"]);
    res.redirect(`/auth?shop=${req.query["shop"]}`);
  }
});

app.get("/auth", async (req, res) => {
  // The library will automatically redirect the user
  await shopify.auth.begin({
    shop: shopify.utils.sanitizeShop(req.query.shop, true),
    callbackPath: "/auth/callback",
    isOnline: false,
    rawRequest: req,
    rawResponse: res,
  });
});

app.get("/auth/callback", async (req, res) => {
  // The library will automatically set the appropriate HTTP headers
  const callback = await shopify.auth.callback({
    rawRequest: req,
    rawResponse: res,
  });
  console.log(callback);
  // res.redirect(`/?shop=${callback['session'].shop}&host=${req.query.host}`);
  // You can now use callback.session to make API requests
  res.redirect("/appinstalled");
});

// Test Route
app.get("/test", (req, res) => {
  res.send("Test ssss");
});

app.get("/appinstalled", (req, res) => {
  res.send("app installed success");
});

app.listen(port, () => {
  console.log("App is running on port " + port);
});
 
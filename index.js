import express from "express";
import { z } from "zod";
import dotenv from "dotenv";
import "@shopify/shopify-api/adapters/node";
import { shopifyApi, LATEST_API_VERSION } from "@shopify/shopify-api";
import crypto from "crypto";
import bodyParser from "body-parser";
import cors from "cors";
import axios from "axios";

dotenv.config();

const host = "localhost";
const port = process.env.PORT || 9000;

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SHOPIFY_API_SCOPES,
  HOST,
  X_SHOPIFY_ACCESS_TOKEN,
  X_APP_ACCESS_TOKEN,
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

// var urlencodedParser = bodyParser.urlencoded({ extended: false });
app.use(cors());

app.use(express.json());

// Function to calculate HEX Digest
function calculateHexDigest(result) {
  var hmac = crypto.createHmac("sha256", X_APP_ACCESS_TOKEN);
  //passing the data to be hashed
  const data = hmac.update(result);

  //Creating the hmac in the required format
  const gen_hmac = data.digest("hex");

  //Printing the output on the console
  // console.log('hmac : ' + gen_hmac);
  return gen_hmac;
}

app.get("/", async (req, res) => {
  //res.send('Hello World !');
  console.log(shops);
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
  console.log(callback["session"].shop);
  // shops[shopSession.shop] = shopSession
  shops[callback["session"].shop] = callback;

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

app.post("/get-results", (req, res) => {
  // console.log(req.get("X_APP_ACCESS_TOKEN"));
  // if (req.get("X_APP_ACCESS_TOKEN") == X_APP_ACCESS_TOKEN) {
  //   console.log("Authorized");
  //   res.status(200).send("Authorized");
  // } else {
  //   console.log("Not authorized");
  //   res.status(400).send("Not authorized");
  // }
  // res.send("app installed success");

  // console.log(req.body);
  let dataJson = JSON.stringify(req.body.data);
  let receivedSignature = req.body.signature;
  console.log(dataJson);
  console.log(receivedSignature);
  let calculatedSignature = calculateHexDigest(dataJson);
  console.log(calculatedSignature);
  calculatedSignature == receivedSignature
    ? console.log("Match values")
    : console.log("Not matched");
  res.status(200).send("Got data");
});

//Get data from quiz test
const schema = z.object({
  name: z.string(),
  age: z.number(),
});

function validateData(req, res, next) {
  try {
    schema.parse(req.body);
    next();
  } catch (error) {
    res.status(400).send("Authorization failed");
  }
}

app.post("/api/data", validateData, (req, res) => {
  const data = req.body;
  console.log(data);
  res.send(data);
});

app.get("/axiostest", async (req, res) => {
  try {
    const query = ``;
    //console.log(query);

    const response = await axios({
      method: "get",
      url: "https://appstetest.myshopify.com/admin/api/2023-01/customers/6482888524086/metafields.json",
      headers: {
        "X-Shopify-Access-Token": X_SHOPIFY_ACCESS_TOKEN,
      },
    });
 
    // console.log(response.data.data.subscriptions.nodes);
    res.json(response.data);
  } catch (error) {
    console.log(error);
    res.status(500).send("Oops ! Some error occurred");
  }
});

app.listen(port, () => {
  console.log("App is running on port " + port);
});

import express from "express";
import { custom, z } from "zod";
import dotenv from "dotenv";
import "@shopify/shopify-api/adapters/node";
import { shopifyApi, LATEST_API_VERSION } from "@shopify/shopify-api";
import crypto from "crypto";
import bodyParser from "body-parser";
import cors from "cors";
import axios from "axios";

dotenv.config();

const port = process.env.PORT || 9000;
const shopName = "appstetest";

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

app.use(cors());

app.use(express.json());

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

app.post("/quiz-results", async (req, res) => {
  let dataJson = JSON.stringify(req.body);
  console.log("Got the following data ->");
  console.log(dataJson);

  let customer = {
    email: req.body.email,
    results: req.body.results,
  };

  // check if a user exists with the provided email
  const customer_data_edges = await getCustomerData(customer.email);

  if (customer_data_edges.length > 0) {
    /*
      if the user exists, 
      take the graphql id of that customer eg. "gid://shopify/Customer/6848262570294"
      and the metafield id of that customer eg. "gid://shopify/Metafield/28659379601718"
      and store it in the customer object
    */
    customer.id = customer_data_edges[0].node.id;
    customer.metafield_id = customer_data_edges[0].node.metafield.id;

    // update the customer's metafield
    const customer_updated_data = await updateCustomerData(
      customer.id,
      customer.metafield_id,
      customer.results
    );
    res.send(customer_updated_data);
  } else {
    // create a customer if an account doesn't exist, and add the results to the metafield.
    console.log("No existing customer found");
    const customer_data = await createCustomerWithMetafield(
      customer.email,
      customer.results
    );
    let userErrors = customer_data.customerCreate.userErrors;
    if (userErrors.length > 0) {
      console.log(JSON.stringify(userErrors[0].message));
      res.status(422).send(userErrors[0].message);
    } else {
      console.log(JSON.stringify(customer_data));
      res.send(customer_data);
    }
  }
  // console.log(customer_data.length);
});

// Get the customer
async function getCustomerData(customer_email) {
  console.log("Getting customer data...");
  let data = JSON.stringify({
    query: `query {
      customers(first: 10, query: "email:'${customer_email}'") {
        edges {
          node {
            id
            state
            email
            metafield(key: "quiz_results", namespace: "custom") {
              id
              key 
              value 
            }   
          }
        }
      }
    }`,
    variables: {},
  });

  let config = {
    method: "post",
    url: `https://${shopName}.myshopify.com/admin/api/2023-01/graphql.json`,
    headers: {
      "X-Shopify-Access-Token": X_SHOPIFY_ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
    data: data,
  };

  try {
    const response = await axios(config);
    // console.log(JSON.stringify(response.data));
    return response.data.data.customers.edges;
  } catch (error) {
    console.log(error);
    return error;
  }
}

// Update the customer metafield
async function updateCustomerData(custId, metafieldId, metafieldValue) {
  console.log("Updating customer data...");
  metafieldValue = JSON.stringify(metafieldValue);
  const data = JSON.stringify({
    query: `mutation customerUpdate($input: CustomerInput!) {
            customerUpdate(input: $input) {
              customer {
                id 
                metafields(first: 5) {
                  edges {
                    node {
                      id
                      namespace
                      key
                      value
                    }
                  }
                }
              } 
              userErrors {
                field
                message
              }
            }
          }`,

    variables: {
      input: {
        id: `${custId}`,
        metafields: [
          {
            id: `${metafieldId}`,
            key: "quiz_results",
            namespace: "custom",
            type: "json",
            value: `${metafieldValue}`,
          },
        ],
        note: "nice nice guyyyyy",
      },
    },
  });

  const config = {
    method: "post",
    url: `https://${shopName}.myshopify.com/admin/api/2023-01/graphql.json`,
    headers: {
      "X-Shopify-Access-Token": X_SHOPIFY_ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
    data: data,
  };

  try {
    const response = await axios(config);
    // console.log(JSON.stringify(response.data));
    return response.data.data;
  } catch (error) {
    console.log(error);
    return error;
  }
}

// create a customer with metafield values
async function createCustomerWithMetafield(customer_email, metafieldValue) {
  console.log("Creating a new customer...");
  metafieldValue = JSON.stringify(metafieldValue);
  const data = JSON.stringify({
    query: `mutation customerCreate($input: CustomerInput!) {
              customerCreate(input: $input) {
                customer {
                  id 
                  metafields(first: 5) {
                    edges {
                      node {
                        id
                        namespace
                        key
                        value
                      }
                    }
                  }
                } 
                userErrors {
                  field
                  message
                }
              }
            }`,
    variables: {
      input: {
        email: `${customer_email}`,
        metafields: [
          {
            key: "quiz_results",
            namespace: "custom",
            type: "json",
            value: `${metafieldValue}`,
          },
        ],
        note: "nice nice guy",
      },
    },
  });

  const config = {
    method: "post",
    url: `https://${shopName}.myshopify.com/admin/api/2023-01/graphql.json`,
    headers: {
      "X-Shopify-Access-Token": X_SHOPIFY_ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
    data: data,
  };

  try {
    const response = await axios(config);
    // console.log(JSON.stringify(response.data));
    return response.data.data;
  } catch (error) {
    console.log(error);
    return error;
  }
}

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

import express from "express";
import { custom, z } from "zod";
import dotenv from "dotenv";
import { Shopify } from "@shopify/shopify-api";
import crypto from "crypto";
import bodyParser from "body-parser";
import cors from "cors";
import axios from "axios";

dotenv.config();

const port = process.env.PORT || 9000;
const GRAPHQL_ENDPOINT =
  "https://appstetest.myshopify.com/admin/api/2023-01/graphql.json";
const METAFIELD_KEY = "quiz_results";

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SHOPIFY_API_SCOPES,
  HOST,
  X_SHOPIFY_ACCESS_TOKEN,
  X_APP_ACCESS_TOKEN,
} = process.env;

const shops = {};

Shopify.Context.initialize({
  API_KEY: SHOPIFY_API_KEY,
  API_SECRET_KEY: SHOPIFY_API_SECRET,
  SCOPES: SHOPIFY_API_SCOPES,
  HOST_NAME: HOST.replace(/https:\/\//, ""),
  IS_EMBEDDED_APP: true,
});

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", async (req, res) => {
  if (typeof shops[req.query.shop] !== "undefined") {
    res.send("Hello World");
  } else {
    console.log(req.query["shop"]);
    res.redirect(`/auth?shop=${req.query["shop"]}`);
  }
});

app.get("/auth", async (req, res) => {
  const authRoute = await Shopify.Auth.beginAuth(
    req,
    res,
    req.query.shop,
    "/auth/callback",
    false
  );
  res.redirect(authRoute);
});

app.get("/auth/callback", async (req, res) => {
  try {
    const shopSession = await Shopify.Auth.validateAuthCallback(
      req,
      res,
      req.query
    );
    console.log(shopSession);
    shops[shopSession.shop] = shopSession;
    res.redirect(`/?shop=${shopSession.shop}&host=${req.query.host}`);
  } catch (error) {
    console.log("\x1b[31m%s\x1b[0m", "Got an error:");
    console.log(error);

    console.log("\x1b[33m%s\x1b[0m", "Redirecting...");
    res.redirect("/auth-error");
  }
});

// Test Route
app.get("/test", (req, res) => {
  res.send("Endpoint working!!");
});

// Auth error Route
app.get("/auth-error", (req, res) => {
  res.send("Oops!! Something went wrong while authenticating...");
});

// API for getting the customer quiz results and storing them in customer metafields
app.post("/quiz-results", async (req, res) => {
  let dataJson = JSON.stringify(req.body);
  console.log("\x1b[36m%s\x1b[0m", "Got the following data ->");
  console.log(dataJson);

  //creating a customer object for better accessibility
  let customer = {
    email: req.body.email,
    results: req.body.results,
    locale: req.body.locale,
  };

  // check if a user exists with the provided email
  const customer_response = await getCustomerData(customer);

  if (customer_response?.response?.data?.errors) {
    // check for network errors
    console.error(
      "\x1b[31m%s\x1b[0m",
      JSON.stringify(customer_response.response.data)
    );
    res
      .status(customer_response.response.status)
      .send(customer_response.response.data);
  } else {
    const customer_data_edges = customer_response;
    if (customer_data_edges.length > 0) {
      console.log("\x1b[32m%s\x1b[0m", "Customer found ✅");
      /*
        if the user exists, 
        take the graphql id of that customer eg. "gid://shopify/Customer/6848262570294"
        and the metafield id of that customer eg. "gid://shopify/Metafield/28659379601718"
        (metafield can be null if it is empty) and store it in the customer object.
      */
      customer.id = customer_data_edges[0].node.id;
      customer.metafield_id = customer_data_edges[0].node?.metafield?.id;

      // update the customer's metafield
      const customer_updated_data = await updateCustomerData(customer);
      let userErrors = customer_updated_data.customerUpdate.userErrors;
      if (userErrors.length > 0) {
        console.log(JSON.stringify(userErrors[0].message));
        res.status(422).send(userErrors[0].message);
      } else {
        console.log(JSON.stringify(customer_updated_data));
        console.log("\x1b[32m%s\x1b[0m", "Customer updated ✅");
        res.send(customer_updated_data);
      }
    } else {
      // create a customer if an account doesn't exist, and add the results to the metafield.
      console.log("No existing customer found");
      const customer_data = await createCustomerWithMetafield(customer);
      let userErrors = customer_data.customerCreate.userErrors;

      // check for any errors returned by graphql
      if (userErrors.length > 0) {
        console.log(JSON.stringify(userErrors[0].message));
        res.status(422).send(userErrors[0].message);
      } else {
        console.log(JSON.stringify(customer_data));
        console.log("\x1b[32m%s\x1b[0m", "Customer created with values ✅");
        res.send(customer_data);
      }
    }
  }
});

// Get the customer from the provided email
async function getCustomerData({ email }) {
  console.log(
    "\x1b[33m%s\x1b[0m",
    `Getting customer data for email - ${email}...⏳`
  );
  let data = JSON.stringify({
    query: `query {
      customers(first: 10, query: "email:'${email}'") {
        edges {
          node {
            id
            state
            email
            locale
            metafield(key: "${METAFIELD_KEY}", namespace: "custom") {
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
    url: GRAPHQL_ENDPOINT,
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
    console.log(JSON.stringify(error));
    return error;
  }
}

// Update the customer metafield
async function updateCustomerData({ id, metafield_id, results }) {
  console.log("\x1b[33m%s\x1b[0m", "Updating customer data...⏳");
  results = JSON.stringify(results);

  // CHECK IF METAFIELD ID IS PROVIDED, IF NOT THEN IT'S BECAUSE
  // THE METAFIELD WAS EMPTY. SO METAFIELD ID IS NOT REQUIRED
  // WHILE UPDATING IT.
  let variable = {};
  if (metafield_id) {
    variable = {
      input: {
        id: `${id}`,
        metafields: [
          {
            id: `${metafield_id}`,
            key: `${METAFIELD_KEY}`,
            namespace: "custom",
            type: "json",
            value: `${results}`,
          },
        ],
      },
    };
  } else {
    variable = {
      input: {
        id: `${id}`,
        metafields: [
          {
            key: `${METAFIELD_KEY}`,
            namespace: "custom",
            type: "json",
            value: `${results}`,
          },
        ],
      },
    };
  }

  const data = JSON.stringify({
    query: `mutation customerUpdate($input: CustomerInput!) {
            customerUpdate(input: $input) {
              customer {
                id
                locale 
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

    variables: variable,
  });

  const config = {
    method: "post",
    url: GRAPHQL_ENDPOINT,
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
async function createCustomerWithMetafield({ email, results, locale }) {
  console.log("\x1b[33m%s\x1b[0m", "Creating a new customer...⏳");
  results = JSON.stringify(results);
  const data = JSON.stringify({
    query: `mutation customerCreate($input: CustomerInput!) {
              customerCreate(input: $input) {
                customer {
                  id
                  locale 
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
        email: `${email}`,
        locale: `${locale}`,
        metafields: [
          {
            key: `${METAFIELD_KEY}`,
            namespace: "custom",
            type: "json",
            value: `${results}`,
          },
        ],
      },
    },
  });

  const config = {
    method: "post",
    url: GRAPHQL_ENDPOINT,
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

app.listen(port, () => {
  console.log(`App is running on port ${port}`);
});

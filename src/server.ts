import * as yaml from "js-yaml";
import app from "./app";
import dotenv from "dotenv";
import fetchRoutes from "express-list-endpoints";
import fs from "fs";
import http from "http";
import serverlessExpress from "@codegenie/serverless-express";
import { APIGatewayProxyEvent, Context } from "aws-lambda";
import { Express } from "express";
import { myMongo } from "./models/mongodb";

let serverlessExpressInstance: any = null;
let dbConnectionExist: boolean = false;

const PORT = process.env.PORT || 8000;
const server = http.createServer(app); //using our app instance to create a server

//produce iac
function populateApiEvents(app: Express) {
  const routes = fetchRoutes(app);
  const yamlData = routes.flatMap((route) =>
    route.methods.map((method) => ({
      httpApi: {
        path: route.path,
        method: method.toLowerCase(),
      },
    }))
  );
  fs.writeFileSync("events.yaml", yaml.dump(yamlData));
}

//start server
async function startServer() {
  //load dev environment variables using dotenv
  dotenv.config();

  //connect to database
  try {
    await myMongo.connect();
  } catch (err) {
    throw new Error((err as Error).message);
  }

  //start server
  server.listen(PORT, () => {
    console.log("listening to port :", PORT);
  });
}

//check if not in aws
if (!process.env.LAMBDA_TASK_ROOT) {
  if (process.argv.includes("gen")) {
    console.log("Generating events.yaml");
    populateApiEvents(app);
  } else if (process.env.NODE_ENV === "development") {
    startServer();
  }
}

// Connect to the database
async function connectToDatabase() {
  if (!dbConnectionExist) {
    try {
      await myMongo.connect();
      dbConnectionExist = true;
    } catch (err) {
      dbConnectionExist = false;
      throw new Error((err as Error).message);
    }
  }
}

// AWS Lambda handler function
async function setup(event: APIGatewayProxyEvent, context: Context) {
  await connectToDatabase();
  serverlessExpressInstance = serverlessExpress({ app });
  return serverlessExpressInstance(event, context);
}

export async function handler(event: APIGatewayProxyEvent, context: Context) {
  if (serverlessExpressInstance)
    return serverlessExpressInstance(event, context);
  return await setup(event, context);
}

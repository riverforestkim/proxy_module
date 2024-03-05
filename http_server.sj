import express from "express";
import cors from "cors";
import https from "https";
import bodyParser from "body-parser";

import proxyApi from "../app/proxy_server/proxyServer.controller.js";
import { ProxyService } from "../app/proxy_server/proxyServer.service.js";
import oneUtilApi from "../app/one/oneUtil.controller.js";

import * as log from '../app/utils/log.js';

import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const app = express();


const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Proxy Worker',
      version: '1.0.0',
      description: 'API documentation with Swagger',
    },
  },
  apis: ['/home1/TMS41/www/web_proxy/src/app/proxy_server/proxyServer.controller.js'], // Express 애플리케이션에서 사용되는 라우트 파일들의 경로
};



// http 서버 생성
export default function createHttpsServer(port, httpsOptions) {
  const app = express();

  app.use(cors());
  app.use(bodyParser.json());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  //TODO - help 출력
  app.get("/", (req, res) => {
    res.send("test");
  });
  
  const specs = swaggerJsdoc(options);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

  // router
  app.use("/api/proxy", proxyApi);
  app.use("/api/one", oneUtilApi);

  var httpsServer = https.createServer(httpsOptions, app);
  httpsServer.listen(port);

  log.write('INFO', `Open Https Server : https://localhost:${port}`);

}

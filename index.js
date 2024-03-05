import fs from "fs";
import createHttpsServer from "./src/server/http_server.js";
import { ConfigService } from "./src/app/proxy_server/config.service.js";
import { PATH } from "./src/app/utils/path.js";
import express from "express";

// config 파일 읽어오기
export const configService = new ConfigService(PATH.CONFIG_FILE);
const proxyFileData = configService.getProxyConfig();


const configFileObj = JSON.parse(fs.readFileSync(PATH.WEB_CONFIG_FILE_PATH, 'utf8'));


// ssl 옵션
const httpsOptions = {
  key: fs.readFileSync("config/cert/new_private_key.pem"),
  cert: fs.readFileSync("config/cert/new_certificate.pem"),
};

// 사용 가능한 포트 시작
export const USABLE_PORT_START = process.env.USABLE_PORT_START || 60000;

const CONFIG_PORT = configFileObj["proxy_port"]; 

// http 서버 생성
// config.json 값을 우선시하여 확인, 만일 값이 없다
export const DEFAULT_PORT = CONFIG_PORT || proxyFileData.SERVER.PORT;
createHttpsServer(DEFAULT_PORT, httpsOptions);

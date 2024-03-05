import fs from "fs";
import express from "express";
import { ProxyService } from "./proxyServer.service.js";
const app = express();
import * as log from '../utils/log.js';

import { PATH } from "../utils/path.js";

const proxyService = new ProxyService();


// 프록시 서버를 생성하는 api
app.get("/create", (req, res) => {
  log.write('INFO', `[/create] Start Create Proxy`);
  const ip = req.query.ip;
  const port = req.query.port;
  const deviceName = req.query.deviceName;
  const deviceCode = req.query.deviceCode;
  const devicetype = req.query.deviceType;

  const createProxyServerResult = proxyService.createProxyServer(ip, port, deviceName, deviceCode, devicetype);
  log.write('INFO', `[/create] Finish Create Proxy`);
  res.send(createProxyServerResult);

});

/**
 * @swagger
 * /create:
 *   post:
 *     summary: Create Proxy
 *     description: Create proxy server(s) based on provided data.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               proxy_data:
 *                 type: array
 *                 items:
 *                   # Define the schema for proxy_data object here
 *     responses:
 *       200:
 *         description: Proxy server(s) created successfully.
 *       500:
 *         description: Internal server error.
 */
app.post("/create", (req, res) => {
  log.write('INFO', `[/create] Start Create Proxy`);
  const body = req.body;
  const proxyInfos = body.proxy_data;

  const createProxyServerResult = proxyService.createProxyServerMany(proxyInfos);
  log.write('INFO', `[/create] Finish Create Proxy`);
  res.send(createProxyServerResult);

});

/**
 * @swagger
 * /delete:
 *   post:
 *     summary: Delete Proxy
 *     description: Delete proxy server(s) based on provided data.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               proxy_data:
 *                 type: array
 *                 items:
 *                   # Define the schema for proxy_data object here
 *     responses:
 *       200:
 *         description: Proxy server(s) deleted successfully.
 *       500:
 *         description: Internal server error.
 */
app.post("/delete", (req, res) => {
  log.write('INFO', `[/delete] Start Delete Proxy`);
  const body = req.body;
  const proxyInfos = body.proxy_data;

  const deleteProxyServerResult = proxyService.deleteProxyServerMany(proxyInfos);
  log.write('INFO', `[/delete] Finish Delete Proxy`);
  res.send(deleteProxyServerResult);

});

/**
 * @swagger
 * /create-proxy-all:
 *   post:
 *     summary: Create All Proxy
 *     description: Create proxy server(s) for all devices.
 *     responses:
 *       200:
 *         description: Proxy server(s) created successfully for all devices.
 *       500:
 *         description: Internal server error.
 */
app.post("/create-proxy-all", async (req, res) => {
  try {
    log.write('INFO', `[/create-proxy-all] Start Create All Proxy`);
    const query = "SELECT NDEVICECODE, SIP, NMANAGEPORT, SNAME FROM ASSETS_DEVICE";

    const createProxySensorResult = await proxyService.createProxyAll(query);
    log.write('INFO', `[/create-proxy-all] Finish Create All Proxy`);
    res.send(createProxySensorResult);
    
  } catch (error) {
    res.status(500).send(`Internal Server Error: ${error.message}`);
  }
});

/**
 * @swagger
 * /close:
 *   post:
 *     summary: Close Proxy
 *     description: Close proxy server(s) based on provided data.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               proxy_data:
 *                 type: array
 *                 items:
 *                   # Define the schema for proxy_data object here
 *     responses:
 *       200:
 *         description: Proxy server(s) closed successfully.
 *       500:
 *         description: Internal server error.
 */
app.post("/close", (req, res) => {
  log.write('INFO', `[/close] Start Close Proxy`);
  const body = req.body;
  const proxyInfos = body.proxy_data;

  const closeProxyServerResult = proxyService.closeProxyServerMany(proxyInfos);

  log.write('INFO', `[/close] Finish Close Proxy`);
  res.send(closeProxyServerResult);
});

// 대상 서버 헬스체크 api - TODO: 현재 deviceType, aliveReturn 미사용 - 반영 필요
app.post("/health-check", async (req, res) => {

  log.write('INFO', `[/health-check] Start Check Proxy`);

  const serverUrl = req.body.url;
  const healthCheckURL = req.body.check_url;
  const requestMethod = req.body.method;
  const deviceType = req.body.device_type;
  const aliveReturn = req.body.alive_return;

  const healthCheckResult = await proxyService.serverHealthCheck(
    serverUrl
    // healthCheckURL,
    // requestMethod,
    // deviceType,
    // aliveReturn
  );

  log.write('INFO', `[/health-check] Finish Check Proxy`);

  res.send(healthCheckResult);
});

// 현재 생성된 프록시 서버 목록 반환
app.get("/all", (req, res) => {
  log.write('INFO', `[/all] Start Show All Proxy`);

  const allProxyServerResult = proxyService.allProxyServer();

  log.write('INFO', `[/all] Finish Show All Proxy`);

  res.send(allProxyServerResult);
});

// config 파일 내용 반환
app.get("/config", (req, res) => {
  res.send(proxyService.getProxyConfig());
});

// config 파일의 PROXY_SERVER 전부 생성
app.get("/create-config", (req, res) => {
  const createConfigResult = proxyService.createProxyWithConfig();
  res.send(createConfigResult);
});

// config 파일에서 PROXY_SERVER 값 추가 (URL, PROXY_PORT 우선 진행)
app.get("/config/add", (req, res) => {
  const targetUrl = req.query.url;
  const proxyPort = req.query.port;
  const deviceType = req.query.devicetype || "default";

  const proxyConfigAddResult = proxyService.proxyConfigAdd(
    targetUrl,
    proxyPort,
    deviceType
  );
  res.send(proxyConfigAddResult);
});

// config 파일에서 PROXY_SERVER 값 제거 (URL로 찾기)
app.get("/config/delete", (req, res) => {
  const targetUrl = req.query.url;
  const proxyPort = req.query.port;

  const proxyConfigAddResult = proxyService.proxyConfigDelete(
    targetUrl,
    proxyPort
  );
  res.send(proxyConfigAddResult);
});

// config 파일에서 proxy 서버 내용 초기화
app.get("/config/clear", (req, res) => {
  const proxyConfigClearResult = proxyService.proxyConfigClear();
  res.send(proxyConfigClearResult);
});

export default app;

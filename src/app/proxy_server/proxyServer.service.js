import express from "express";
import https from "https";
import fs from "fs";
import axios from "axios";
import { createProxyMiddleware } from "http-proxy-middleware";
import { PATH } from "../utils/path.js";
import { RESULT } from "../utils/resultForm.js";
import { ConfigService } from "./config.service.js";
import * as log from '../utils/log.js';

const configService = new ConfigService(PATH.CONFIG_FILE);
const configFileObj = JSON.parse(fs.readFileSync(PATH.WEB_CONFIG_FILE_PATH, 'utf8'));


import {DBUtil} from '../utils/db.js';
const dbUtil = new DBUtil();

import { DEFAULT_PORT, USABLE_PORT_START } from "../../../index.js";

export class ProxyService {
  
  localInfo = {
    "IP" : "127.0.0.1",
    "Port" : configFileObj["https_port"]
  }
  PROXY_PORT_URL = {}; // 형식: {port: 대상 url}
  PROXY_SERVER = {}; // 형식: {port: Server{}}

  constructor()
  {
    this.init();
  }

  //최초 가동시 init, db 를 읽어 기존 프록시 가동
  async init()
  { 
    try {
      log.write('INFO', `[init] Start Initialize Proxy Server`);

      //최초 설치, 패치시 proxy_config 가 없는 경우. 새로 생성한다
      //있다면, 기존 것을 유지한다
      if (!fs.existsSync(PATH.CONFIG_FILE)) {
        log.write('INFO', `[init] Proxy Config Not Exist. Create A New One.`);
        configService.initProxyConfig();
      }

      const query = "SELECT NPROXY_CODE, SIP, NMANAGE_PORT, NPROXY_PORT, SNAME, NUSE_FLAG FROM PROXY_ASSETS";
      const bInit = true;

      const createProxySensorResult = await this.createProxyAll(query, bInit);
      
      //db 읽기를 실패했으면, 없는 환경이니 Config에서 데이터를 가져온다
      // db 와 config 가 둘 다 존재하는 형상에서, config 는 db가 실패하면 사용하는 스페어 처리
      if(!createProxySensorResult.status)
      {
        log.write('INFO', `[init] Fail to Read DB`);
        log.write('INFO', `[init] Start Initialize Proxy Server With Config`);

        const configData = configService.getProxyConfig();
        const proxyServerInfos = configData.PROXY_SERVER;

        
        for (const proxyInfo of proxyServerInfos) {
          const url = proxyInfo.URL;
          const proxyPort = proxyInfo.NPROXY_PORT;
          const deviceName = proxyInfo.DEVICE_NAME;
          const deviceType = proxyInfo.DEVICE_TYPE;
          const deviceCode = proxyInfo.DEVICE_CODE;
          const useFlag = proxyInfo.NUSE_FLAG;

          // 동일한 프록시 포트를 점유하고 있으면 닫는다
          this.closeProxyServer(proxyPort);
          const createResult = this.createProxy(url, deviceName, Number(proxyPort), deviceType, deviceCode, useFlag, "");

          log.write('INFO', `[init] Success Initialize Proxy With config.`);
          log.write('DEBUG', `[init] Success Initialize Proxy With config. url=${url}, proxy port=${proxyPort}, result=${createResult}`);
        }
      }
      else
      {
        log.write('INFO', `[init] Success Initialize Proxy With DB.`);
        log.write('DEBUG', `[init] Success Initialize Proxy With DB. query=${query}, result=${createProxySensorResult}`);
      }
    } catch(err){
      log.write('ERROR', `[init] Fail Initialize`);
      log.write('DEBUG', `[init] Fail Initialize, err=${err}`);
    }
    
    log.write('INFO', `[init] Finish Initialize Proxy Server`);
  }

  // 프록시 서버 생성 api 처리
  createProxyServer(targetIP, targetPort, deviceName, deviceCode, deviceType = "default") {
    try {
      const url = `https://${targetIP}:${targetPort}`;
      const proxyPort = Number(DEFAULT_PORT) + Number(deviceCode);

      log.write('INFO', `[createProxyServer] Start Create Proxy, url=${url}, proxy port=${proxyPort}`);
      log.write('DEBUG', `[createProxyServer] Start Create Proxy, url=${url}, proxy port=${proxyPort}`);

      // 동일한 프록시 포트를 점유하고 있으면 닫는다
      this.closeProxyServer(proxyPort);

      // 프록시 서버 생성
      const createResult = this.createProxy(url, deviceName, Number(proxyPort), deviceType, deviceCode);

      // DB에 데이터 추가
      this.addProxyIntoDB(targetIP, targetPort, deviceCode, deviceName, proxyPort);

      log.write('INFO', `[createProxyServer] Finish Create Proxy`);
      log.write('DEBUG', `[createProxyServer] Finish Create Proxy`);

      return RESULT.form(RESULT.SUCCESS, createResult);
    } catch (err) {
      log.write('ERROR', `[createProxyServer] Fail Create Proxy`);
      log.write('DEBUG', `[createProxyServer] Fail Create Proxy, err=${err}`);

      return RESULT.form(RESULT.FAIL, `Create Proxy Server Fail - ${err.message}`);
    }
  }

  // 모든 프록시 서버 생성 api 
  async createProxyAll(query, bInit = false) {
    try {  
      log.write('INFO', `[createProxyAll] Start Create Proxy With DB`);

      const datas = await dbUtil.pExecute('select', query, this.localInfo);

      //이니셜라이즈 기점으로 config를 비우고 다시 구축하는 식으로 개발한다
      //DB가 정상적으로 읽혔을 경우, config를 초기화한다.
      const bIterable = this.isIterable(datas.datas)

      if (bIterable)
      {
        configService.deleteAllProxyConfig();
      }

      const createProxyServerResult = this.createProxyServerMany(datas.datas, bInit);

      log.write('INFO', `[createProxyAll] Finish Create Proxy With DB`);

      return createProxyServerResult;
    } catch (err) {
      log.write('ERROR', `[createProxyAll] Create Proxy Server Fail`);
      log.write('DEBUG', `[createProxyAll] Create Proxy Server Fail, err=${err.message}`);
      return RESULT.form(RESULT.FAIL, `[createProxyAll] Create Proxy Server Fail - ${err.message}`);
    }
  }

  // 프록시 서버 삭제 api 처리
  deleteProxyServer(proxyPort) {
    try {
      log.write('INFO', `[deleteProxyServer] Start Delete Proxy, proxy port=${proxyPort}`);
      const result = [];
    
      // 동일한 프록시 포트 닫기
      const deleteConfigResult = this.closeProxyServer(proxyPort);
            
      // config에서 해당 포트 번호 삭제
      configService.deleteProxyConfig(proxyPort);
      
      // DB에서 데이터 삭제
      const deleteDBResult = this.delProxyFromDB(proxyPort);

      result.push(deleteConfigResult);
      result.push(deleteDBResult);

      log.write('INFO', `[deleteProxyServer]  Finish Delete Proxy`);

      return RESULT.form(RESULT.SUCCESS, result);
    } catch (err) {
      log.write('ERROR', `[deleteProxyServer]  Fail Delete Proxy`);
      log.write('DEBUG', `[deleteProxyServer]  Fail Delete Proxy, proxy port=${proxyPort}, err=${err.message}`);
      return RESULT.form(RESULT.FAIL,`Delete Proxy Server Fail - ${err.message}`);
    }
  }

  deleteProxyServerMany(proxyInfos) {
    const resultList = [];
    log.write('INFO', `[deleteProxyServerMany] Start Delete Many Proxies`);

    try {
      //포트 전부 닫고, config 초기화
      //const deleteProxyResult = this.closeAllPort();
      //configService.deleteAllProxyConfig();

      for (const proxyInfo of proxyInfos) {
        const proxyPort = proxyInfo.proxy_port;

        //프록시 서버 삭제, config 내에서 삭제, DB 내 삭제
        const deleteResult = this.deleteProxyServer(proxyPort);
        resultList.push(deleteResult)
      }

      log.write('INFO', `[deleteProxyServerMany] Finish Delete Many Proxies`);

      return RESULT.form(RESULT.SUCCESS, resultList);
    } catch (err) {
      log.write('ERROR', `[deleteProxyServerMany] Fail Delete Many Proxies`);
      log.write('DEBUG', `[deleteProxyServerMany] Fail Delete Many Proxies, err=${err.message}`);
      return RESULT.form(RESULT.FAIL, `Create Proxy Server Fail - ${err.message}`);
    }
  }

  createProxyServerMany(proxyInfos, bInit = false) {
    const resultList = [];

    try {
      //포트 전부 닫고, config 초기화
      //this.closeAllPort();
      //configService.deleteAllProxyConfig();

      log.write('INFO', `[createProxyServerMany] Start Create Many Proxies`);

      const dataArray = [];


      for (const proxyInfo of proxyInfos) {
        const ip = proxyInfo.ip || proxyInfo.SIP;
        const port = proxyInfo.port || proxyInfo.NMANAGE_PORT || proxyInfo.NMANAGEPORT;
        const deviceName = proxyInfo.deviceName || proxyInfo.SNAME;
        const deviceCode = proxyInfo.deviceCode || proxyInfo.NPROXY_CODE ||  proxyInfo.NDEVICECODE;
        const useFlag = proxyInfo.NUSE_FLAG == undefined ? proxyInfo.useFlag : proxyInfo.NUSE_FLAG;
        const desc = proxyInfo.desc || proxyInfo.SDESC;

        let proxyPort;
        const url = `https://${ip}:${port}`;

        
        if (!proxyInfo.NPROXY_PORT && !proxyInfo.proxy_port)
        {
          proxyPort = Number(DEFAULT_PORT) + Number(deviceCode);
        }
        else 
        {
          proxyPort = proxyInfo.proxy_port || proxyInfo.NPROXY_PORT;
        }
        

        const deviceType = proxyInfo.deviceType || "default";

        // 동일한 프록시 포트를 점유하고 있으면 닫는다
        this.closeProxyServer(proxyPort);
        // 잔존 데이터도 삭제

        // 이니셜라이즈 시점에서는 지울 필요가 없다
        if (!bInit)
        {
          // config에서 해당 포트 번호 삭제
          configService.deleteProxyConfig(proxyPort);
          
          // DB에서 데이터 삭제
          const deleteDBResult = this.delProxyFromDB(proxyPort);
        }

        // 프록시 서버 생성
        const createResult = this.createProxy(url, deviceName, Number(proxyPort), deviceType, deviceCode, useFlag, desc);
        resultList.push(createResult);
        dataArray.push({ ip, port, deviceCode, deviceName, proxyPort, useFlag, desc });

      }

      if (!bInit)
      {
        //완료 후 db 에 입력, init 시점에서는 필요없음
        this.addProxyIntoDB(dataArray);
      }

      log.write('INFO', `[createProxyServerMany] Finish Create Many Proxies`);
      
      return RESULT.form(RESULT.SUCCESS, resultList);
    } catch (err) {
      log.write('ERROR', `[createProxyServerMany] Fail Create Many Proxies`);
      log.write('DEBUG', `[createProxyServerMany] Fail Create Many Proxies, err=${err.message}`);
      return RESULT.form(RESULT.FAIL, `Create Proxy Server Fail - ${err.message}`);
    }
  }


  async addProxyIntoDB(dataArray)
  {
    //Proxy 포트가 중복되면 replace 한다
    let query = `[ \"INSERT OR REPLACE INTO PROXY_ASSETS (NPROXY_CODE, SIP, NMANAGE_PORT, NPROXY_PORT, SNAME, NUSE_FLAG, SDESC) VALUES `;
    let valueStrings = [];
    
    for (let i = 0; i < dataArray.length; i++) {
        const { ip, port, deviceCode, deviceName, proxyPort, useFlag, desc } = dataArray[i];
        valueStrings.push(`('${deviceCode}', '${ip}', '${port}', '${proxyPort}', '${deviceName}', ${useFlag}, '${desc}')`);
    }
    
    query += valueStrings.join(", ");
    query += ` \"]`;
    const datas = await dbUtil.pExecute('execute', query, this.localInfo);
    console.log(datas)
  }

  async delProxyFromDB(proxyPort)
  {
    //Proxy가 같으면 db에서 삭제한다
    const query = `[ \"DELETE FROM PROXY_ASSETS WHERE NPROXY_PORT = '${proxyPort}'\"]`;
    
    const datas = await dbUtil.pExecute('execute', query, this.localInfo);
    console.log(datas)
  }


  async disableProxyFromDB(proxyPort)
  {
    //proxy 비활성화
    const query = `[ \"UPDATE PROXY_ASSETS SET NUSE_FLAG = 0 WHERE NPROXY_PORT = '${proxyPort}'\"]`;
    
    const datas = await dbUtil.pExecute('execute', query, this.localInfo);
    console.log(datas)
  }

  // 현재 열린 모든 포트 닫음
  closeAllPort() {
    for (const port in this.PROXY_SERVER) {
      this.closeProxyServer(port);
    }
  }

  // 현재 시각을 yyyymmddhhmmss 형식으로 반환하는 함수
  getCurrentTimeFormatted() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    const formattedTime = `${year}${month}${day}${hours}${minutes}${seconds}`;

    return formattedTime;
  }

  // 프록시 서버 닫음 - 시간 조금 지난 다음에 닫힘
  closeProxyServer(proxyPort) {
    log.write('INFO', `[closeProxyServer] Start Close Proxy Port, proxy port=${proxyPort}`);

    try {

      //열려있는 서버 중 포트 존재하는지 확인
      if (!this.PROXY_PORT_URL.hasOwnProperty(proxyPort)) {
        throw new Error("Not Using Port");
      }
      
      //TODO - 설정과 db에서 useflag 비활성화.
      // config에서 해당 포트 번호 삭제
      configService.disableProxyConfig(proxyPort);

      // DB에서 데이터 삭제
      const disableDBResult = this.disableProxyFromDB(proxyPort);
      //여기에 추가하면 결합도가 생기는데..

      this.closeOneServer(proxyPort);

      log.write('INFO', `[closeProxyServer] Finish Close Proxy Port`);
      return RESULT.form(RESULT.SUCCESS, `Proxy Server Closed : ${proxyPort}`);
    } catch (err) {
      log.write('ERROR', `[closeProxyServer] Fail Close Proxy Port`);
      log.write('DEBUG', `[closeProxyServer] Fail Close Proxy Port, err=${err.message}`);
      return RESULT.form(RESULT.FAIL, `Close Proxy Server Fail - ${err.message}`);
    }
  }

  closeProxyServerMany(proxyInfos, bInit = false) {

    try {
      log.write('INFO', `[closeProxyServerMany] Start Close Many Proxies`);

      for (const proxyInfo of proxyInfos) {
    
        const proxyPort = proxyInfo.proxy_port;

        // 동일한 프록시 포트를 점유하고 있으면 닫는다
        this.closeProxyServer(proxyPort);

      }

      log.write('INFO', `[closeProxyServerMany] Finish Close Many Proxies`);
      
      return RESULT.form(RESULT.SUCCESS, "Success Close Many Proxies");
    } catch (err) {
      log.write('ERROR', `[createProxyServerMany] Fail Create Many Proxies`);
      log.write('DEBUG', `[createProxyServerMany] Fail Create Many Proxies, err=${err.message}`);
      return RESULT.form(RESULT.FAIL, `Create Proxy Server Fail - ${err.message}`);
    }
  }

  // config 삭제 없이 서버만 닫고, 현재 열린 서버 목록에 반영
  closeAllServer() {
    try {
      for (const port in this.PROXY_SERVER) {
        this.closeOneServer(port);
      }
    } catch (err) {
      throw new Error(err.message);
    }
  }

  closeOneServer(port) {
    const server = this.PROXY_SERVER[port];
    server.close();

    delete this.PROXY_SERVER[port];
  }

  // 대상 서버 헬스체크 - TODO: 다른 장비 타입에 대해서도 추가 (현재 ONE 기준)
  async serverHealthCheck(
    serverUrl
    // healthCheckURL,
    // requestMethod,
    // deviceType,
    // aliveReturn
  ) {
    try {
      // serverURL + healthCHeckURL 로 requestMethod 요청을 보내서
      // 값이 aliveReturn 이면 true 반환, deadReturn 이면 false 반환
      const returnData = await axios({
        method: "get",
        url: serverUrl + "/activex/login/sniper_info.js", // ONE 기준
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
          keepAlive: true,
        }), // keepalive는 ONE 사양
      })
        .then((res) => {
          return true;
        })
        .catch((err) => {
          return false;
        });
      return RESULT.form(returnData, `Server Health Check`); // 일단 정상 반환되면 true 반환
    } catch (err) {
      return RESULT.form(returnData, `Server Health Fail : ${err.message}`);
    }
  }

  // 현재 생성되어 있는 모든 프록시 서버 목록 반환
  allProxyServer() {
    const configData = configService.getProxyConfig();
    return RESULT.form(RESULT.SUCCESS, configData.PROXY_SERVER);
  }

  // config 파일 읽어오기
  getProxyConfig() {
    const configFile = fs.readFileSync(PATH.CONFIG_FILE, "utf8");
    const proxyConfigData = JSON.parse(configFile);
    return proxyConfigData;
  }

  // config 참조해서 모든 프록시 서버 생성
  createProxyWithConfig() {
    const resultList = [];

    try {
      //포트 전부 닫고, config 초기화
      this.closeAllServer();

      const proxyConfigData = configService.getProxyConfig();
      const proxyInfos = proxyConfigData.PROXY_SERVER;

      for (const proxyInfo of proxyInfos) {
        let targetUrl = proxyInfo.URL;
        let proxyPort = proxyInfo.NPROXY_PORT;
        let deviceName = proxyInfo.DEVICE_NAME;
        let deviceType = proxyInfo.DEVICE_TYPE;
        let deviceCode = proxyInfo.DEVICE_CODE;

        let createResult = this.createProxy(
          targetUrl,
          deviceName,
          Number(proxyPort),
          deviceType,
          deviceCode
        );

        resultList.push(createResult);
      }
      return RESULT.form(RESULT.SUCCESS, resultList);
    } catch (err) {
      return RESULT.form(RESULT.FAIL,`Create Config Proxy Server Fail - ${err.message}` );
    }
  }

  // config(JSON) 파일에 들어온 값을 추가 (URL, PROXY_PORT)
  proxyConfigAdd(targetUrl, proxyPort, deviceType = "default") {
    try {
      // device 타입 체크
      deviceType = deviceType.toLowerCase();
      const checkSupportedType = this.isSupportedType(deviceType);
      if (checkSupportedType.state !== true) {
        throw new Error(checkSupportedType.message);
      }

      // 포트 번호 체크
      if (configService.isUsedPortConfig(proxyPort, targetUrl)) {
        throw new Error(`The proxy port (${proxyPort}) is already allocated.`);
      }

      const configData = configService.getProxyConfig();
      const newServerData = {
        URL: targetUrl,
        IP: targetUrl.match(/\/\/(.*?)(:|\/|$)/)[1],
        NPROXY_PORT: Number(proxyPort),
        DEVICE_TYPE: deviceType,
      };

      configData.PROXY_SERVER.push(newServerData);

      configService.proxyConfigUpdate(configData);
      return RESULT.form(RESULT.SUCCESS, "Add new Config");
    } catch (err) {
      return RESULT.form(RESULT.FAIL, `Fail Add new Config - ${err.message} - ${targetUrl}, ${Number(proxyPort)}, ${deviceType}`);
    }
  }

  // config(JSON) 파일에서 해당 URL, Port 항목 삭제
  proxyConfigDelete(targetUrl, proxyPort, deviceType) {
    try {
      const configData = configService.getProxyConfig();
      const proxyServerInfos = configData.PROXY_SERVER;

      // URL, Port 와 동일한 항목 제거
      const newConfigData = proxyServerInfos.filter(
        (item) =>
          !(
            item.URL === targetUrl &&
            item.NPROXY_PORT === proxyPort &&
            item.DEVICE_TYPE === deviceType
          )
      );

      // config 파일 저장
      configData.PROXY_SERVER = newConfigData;
      configService.proxyConfigUpdate(configData);

      return RESULT.form(RESULT.SUCCESS, "Delete new Config");
    } catch (err) {
      return RESULT.form(
        RESULT.FAIL,
        `Fail Delete new Config - ${err.message}`
      );
    }
  }

  // config 파일에서 proxy 서버 내용 초기화
  proxyConfigClear() {
    try {
      const configData = configService.getProxyConfig();

      // config 파일 저장
      configData.PROXY_SERVER = [];
      configService.proxyConfigUpdate(configData);

      return RESULT.form(RESULT.SUCCESS, "Clear config - proxy_server ");
    } catch (err) {
      return RESULT.form(RESULT.FAIL, `Fail Clear Config - ${err.message}`);
    }
  }

  // 지원 장비인지 확인
  isSupportedType(deviceType) {
    if (["default"].includes(deviceType)) {
      return { state: true };
    } else {
      return {
        state: false,
        message: `The device's type (${deviceType}) is not supported. (Supported: DEFAULT)`,
      };
      // throw new Error(
      //   `The device's type (${deviceType}) is not supported. (Supported: DEFAULT)`
      // );
    }
  }
  
  isIterable(obj) {
    return obj != null && typeof obj[Symbol.iterator] === 'function';
  }

  // 프록시 서버 생성
  createProxy(targetUrl, deviceName, proxyPort, deviceType, deviceCode, useFlag, desc) {

    log.write('INFO', `[createProxy] Start Create Proxy`);

    // 반환 형식
    let newProxyResult = {
      port: proxyPort,
      url: targetUrl,
      deviceCode: deviceCode,
      result: false,
      createdTime: this.getCurrentTimeFormatted(),
      resultMessage: "",
    };

    try {
      // 값이 부족하면 반환
      if (!deviceName || !targetUrl || !deviceType || !deviceCode ) {
        const failMassage = `Information is insufficient. - url: ${targetUrl}, port?: ${proxyPort}, devicetype: ${deviceType}, deviceCode: ${deviceCode}`;
        newProxyResult.resultMessage = failMassage;
        return newProxyResult;
      }

      // config 에서 값 확인
      const isPortAble = configService.isAblePort(
        proxyPort,
        targetUrl
        // PROXY_PORT_URL
      );
      if (isPortAble.state === 0) {
        //  에러 발생 시 반환
        newProxyResult.resultMessage = isPortAble.message;
        return newProxyResult;
      } else if (isPortAble.state === 2) {
        // 포트 번호 업데이트 필요 시
        proxyPort = isPortAble.recommendPort;
        newProxyResult.port = isPortAble.recommendPort;
      } else if (isPortAble.state === 3) {
        // 기존과 동일한 데이터일 시
        // 열려있는지 확인하고, 열려있으면 return
        if (this.PROXY_PORT_URL.hasOwnProperty(proxyPort)) {
          newProxyResult.result = true;
          newProxyResult.resultMessage = "Alread Created";
          return newProxyResult;
        }
      }

      // 장비 타입 확인 후 반환
      deviceType = deviceType.toLowerCase();
      const checkSupportedType = this.isSupportedType(deviceType);
      if (checkSupportedType.state !== true) {
        newProxyResult.resultMessage = checkSupportedType.message;
        return newProxyResult;
      }

   
      // 동작하지 않는 서버면 반환 - 추후 사용 예정
      // const isAlive = await this.serverHealthCheck(targetUrl);
      // if (!isAlive.status) {
      //   throw new Error("Target Device is not Accesible");
      // }

      // 활성화 프록시면 생성
      if (useFlag)
      {

        // 프록시 서버 생성
        const proxyApp = express();

        const httpsOptions = {
          key: fs.readFileSync("config/cert/new_private_key.pem"),
          cert: fs.readFileSync("config/cert/new_certificate.pem"),
        };

        proxyApp.use(
          "/",
          createProxyMiddleware({
            target: targetUrl,
            agent : new https.Agent(),
            changeOrigin: true,
            secure: false, //일단 ssl 무시
            headers: { Connection: "keep-alive" }, // ONE 사양
          })
        );

        var httpProxyServer = https.createServer(httpsOptions, proxyApp);

        
        //동기처리 필요..
        //이벤트 발생, 이미 포트가 점유 중이라면 listen 을 진행하지 않는다.
        httpProxyServer.on('error', function (error) {
          if (error.code === 'EADDRINUSE') {
              log.write('ERROR', `[createProxy] Fail Create Proxy, Port ${proxyPort} is already in use`);
              // if (isPortAble.state == 1 || isPortAble.state == 2) {
              //   configService.addProxyConfig(targetUrl, proxyPort, deviceName, deviceType, deviceCode, useFlag, desc);
              // }
              return;
            }
            log.write('ERROR', `[createProxy] Fail Create Proxy, Error occurred: ${error}`);
        });
      

        httpProxyServer.listen(proxyPort);

        log.write('INFO', `[createProxy] Create Proxy ${targetUrl}, Proxy Port : ${proxyPort} `);
      }
      else
      {
        log.write('INFO', `[createProxy] Skip Create Proxy ${targetUrl}, Proxy Port : ${proxyPort}, Unuse Proxy`);
      }

      // 프록시 서버 목록에 추가 - 이후 서버 닫을 때 사용
      this.PROXY_SERVER[proxyPort] = httpProxyServer;

      // 사용 중인 포트에 추가
      this.PROXY_PORT_URL[proxyPort] = targetUrl;

      // config에 추가
      if (isPortAble.state == 1 || isPortAble.state == 2) {
        configService.addProxyConfig(targetUrl, proxyPort, deviceName, deviceType, deviceCode, useFlag, desc);
      }

      // 결과 반영
      newProxyResult.result = true;
      newProxyResult.resultMessage = "Success";

      log.write('INFO', `[createProxy] Finish Create Proxy`);

      return newProxyResult;
    } catch (err) {
      newProxyResult.resultMessage = err.stack;
      return newProxyResult;
    }
  }
}

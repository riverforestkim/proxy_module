import fs from "fs";
import { PATH } from "../utils/path.js";
import { DEFAULT_PORT, USABLE_PORT_START } from "../../../index.js";

const configFileObj = JSON.parse(fs.readFileSync(PATH.WEB_CONFIG_FILE_PATH, 'utf8'));

// config 제어하는 파일

export class ConfigService {
  constructor(proxyFilePath) {
    this.proxyFilePath = proxyFilePath;
  }

  // config 파일 읽어오기
  getProxyConfig() {
    try {
      if (!fs.existsSync(this.proxyFilePath)) {
        this.initProxyConfig();
      }

      let proxyFile = fs.readFileSync(this.proxyFilePath, "utf8");

      if (proxyFile == "") {
        this.initProxyConfig();
        proxyFile = fs.readFileSync(this.proxyFilePath, "utf8");
      }

      const proxyFileData = JSON.parse(proxyFile);
      return proxyFileData;
    } catch (err) {
      throw new Error(err.message);
    }
  }

  // 프록시 파일 미존재시 초기값 저장
  initProxyConfig() {
    try {
      const config = {
        SERVER: {
          IP: "localhost",
          URL: "https://localhost",
          PORT: configFileObj["proxy_port"],
        },
        PROXY_SERVER: [],
      };

      fs.writeFileSync(this.proxyFilePath, JSON.stringify(config, null, 2));
    } catch (err) {
      throw new Error(err.message);
    }
  }

  // 프록시 서버 정보 추가
  addProxyConfig(targetUrl, proxyPort, deviceName, deviceType, deviceCode, useFlag, desc) {
    try {
      // 포트 번호 기 존재 여부 체크
      if (this.isUsedPortConfig(proxyPort, targetUrl)) {
        throw new Error(`The proxy port (${proxyPort}) is already allocated.`);
      }

      // config에 추가
      const configData = this.getProxyConfig();
      const newServerData = {
        URL: targetUrl,
        NPROXY_PORT: Number(proxyPort),
        DEVICE_NAME: deviceName,
        DEVICE_TYPE: deviceType,
        DEVICE_CODE: deviceCode,
        NUSE_FLAG: useFlag,
        SDESC : desc
      };
      configData.PROXY_SERVER.push(newServerData);

      this.proxyConfigUpdate(configData);
      return;
    } catch (err) {
      throw new Error(err.message);
    }
  }

  // 다수 입력 시, 사용하지 않는 프록시 정보 제거
  deleteProxyConfigPort(ports) {
    const configData = this.getProxyConfig();
    const newConfigData = configData.PROXY_SERVER.filter((item) =>
      ports.includes(item.NPROXY_PORT)
    );
    configData.PROXY_SERVER = newConfigData;
    this.proxyConfigUpdate(configData);
  }

  // 프록시 서버 정보 제거
  deleteProxyConfig(proxyPort) {
    try {
      let newConfigData;

      const configData = this.getProxyConfig();
      const proxyServerInfos = configData.PROXY_SERVER;

      // for (const proxyPort of proxyPorts) {
      // Port 가 동일한 항목 제거
      if (proxyServerInfos && Array.isArray(proxyServerInfos)) {
        newConfigData = proxyServerInfos.filter(
          (item) => !(item.NPROXY_PORT == proxyPort)
        );
      

        // config 파일 저장
        configData.PROXY_SERVER = newConfigData;
        this.proxyConfigUpdate(configData);
        }
        
      return;
    } catch (err) {
      throw new Error(err.message);
    }
  }

    // 프록시 서버 정보 제거
    disableProxyConfig(proxyPort) {
      try {
        let newConfigData;
  
        const configData = this.getProxyConfig();
        const proxyServerInfos = configData.PROXY_SERVER;
        
        if (proxyServerInfos && Array.isArray(proxyServerInfos)) {
          // 프록시 포트를 비활성화
          newConfigData = proxyServerInfos.map(item => {
            if (item.NPROXY_PORT == proxyPort) {
              item.NUSE_FLAG = 0;
            }
            return item;
          });
        
        
          // config 파일 저장
          configData.PROXY_SERVER = newConfigData;
          this.proxyConfigUpdate(configData);
    
        }
        return;
      } catch (err) {
        throw new Error(err.message);
      }
    }

  // 프록시 서버 정보 전체 제거
  deleteAllProxyConfig() {
    try {
      const configData = this.getProxyConfig();
      configData.PROXY_SERVER = [];

      this.proxyConfigUpdate(configData);
      return;
    } catch (err) {
      throw new Error(err.message);
    }
  }

  // 특정 포트 있는지 확인
  isUsedPortConfig(proxyPort, targetURL) {
    try {
      if (DEFAULT_PORT == proxyPort) {
        throw new Error(`port is for management`);
      }

      const configData = this.getProxyConfig();
      const proxyServerInfos = configData.PROXY_SERVER;

      for (const info of proxyServerInfos) {
        // 포트는 같지만, URL이 다를 경우 - 기존에 사용하므로 사용 불가한 포트
        // 포트와 URL 이 같으면 사용 가능하다고 판단
        if (info.NPROXY_PORT == proxyPort && info.URL != targetURL) {
          return true;
        }
      }
      return false;
    } catch (err) {
      throw new Error(err.message);
    }
  }

  // 특정 포트 사용 가능한지 확인 (추후 isUsedPortConfig 함수 없애고 이 함수 사용할 예정)
  isAblePort(proxyPort, targetUrl) {
    try {
      // manage port와 같은지 확인
      if (DEFAULT_PORT == proxyPort) {
        return { state: 0, message: "Port is for Management" };
      }

      // config의 데이터와 비교하여 확인
      // 포트와 URL이 동일할 경우, 사용 가능하다고 판단
      // 포트는 동일하지만, URL이 다를 경우, 사용 불가, 업데이트 필요하다는 내용 리턴 (변경할 port도 포함하여 리턴)

      const configData = this.getProxyConfig();
      const proxyServerInfos = configData.PROXY_SERVER;

      for (const info of proxyServerInfos) {
        if (info.NPROXY_PORT == proxyPort && info.URL == targetUrl) {
          return { state: 3, message: "Able according to Existing data" };
        } else if (info.NPROXY_PORT == proxyPort && info.URL != targetUrl) {
          return {
            state: 2,
            recommendPort: this.getAblePort(),
            message: "Port is Allocated (check proxy_config.json)",
          };
        }
      }
      return { state: 1, message: "Able" };
    } catch (err) {
      return { state: 0, message: err.message };
    }
  }

  // config 기반) 포트 중복인 경우, 사용 가능한 포트 번호를 구하기 위한 함수
  getAblePort() {
    const configData = this.getProxyConfig();
    const proxyServerInfos = configData.PROXY_SERVER;
    let recommendPort = Number(USABLE_PORT_START);

    const usedPorts = [...proxyServerInfos.map((item) => item.NPROXY_PORT)];
    while (
      usedPorts.includes(recommendPort) ||
      recommendPort == Number(DEFAULT_PORT)
    ) {
      recommendPort += 1;
    }
    return recommendPort;
  }

  //config(JSON) 파일을 들어온 값으로 저장?
  proxyConfigUpdate(newConfigData) {
    try {
      // obj 형식으로 받게 됨
      // 이를 JSON 형식으로 바꿔서, config 파일을 덮어쓰기
      var jsonString = JSON.stringify(newConfigData, null, 2);

      fs.writeFileSync(this.proxyFilePath, jsonString, (err) => {
        if (err) {
          console.error("Error writing JSON file:", err);
        } else {
          console.log("JSON file has been saved successfully.");
        }
      });
    } catch (err) {
      throw new Error(err.message);
    }
  }
}

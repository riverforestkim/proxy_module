// 파일 경로 지정하는 파일
import * as path from "path";

export class CFilePath {
  ROOT_PATH = path.resolve();
  CONFIG_FILE = path.join(this.ROOT_PATH, "config", "proxy_config.json");
}

export const PATH = new CFilePath();

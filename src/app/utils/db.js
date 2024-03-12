
import sqlite3 from "sqlite3";
import async from "async";
import axios from "axios";
import https from "https";
import { execSync } from 'child_process';

const agent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true
  });

let dbb_pointer_dict = {};

export class DBUtil
{

    async pExecute(action, sql, localInfo)
    {
        const localIP = localInfo.IP;
        const localPort = localInfo.Port;
        return new Promise((resolve, reject) => {
            let strQuery =`action=${action}&query=${sql}&dbname=tmsplus`
            const options = {
                httpsAgent: agent,
                headers: {'Content-Type' : "application/x-www-form-urlencoded"}
            }
            axios.post(`https://${localIP}:${localPort}/sql`, strQuery, options)
                .then(function (res) {
                    resolve(res.data);
                }).catch(function (err) {
                    resolve({DATA: { level: "err" }});
                });
            });
    }

    async check_db_connection_pool(db_path) {
        return new Promise((resolve, reject) => {
            if ((db_path in dbb_pointer_dict) && (dbb_pointer_dict[db_path])) {
                resolve(dbb_pointer_dict[db_path]);
            } else {
                this.connection_sqlite_db(db_path)
                    .then((pointer) => {
                        dbb_pointer_dict[db_path] = pointer;

                        resolve(pointer);
                }).catch((err) => {
                    reject(err);
                });
            }
        });
    }

    async connection_sqlite_db(db_path) {
        return new Promise(async (resolve, reject) => {

            let db = new sqlite3.Database(db_path, sqlite3.OPEN_READWRITE, (err) => {
            if (err) {
                //log.write('ERROR', `${db_path} CONNECTION FAILED`);

                reject(err);
            } else {
                try {
                    db.run(`PRAGMA KEY = '${sqlcipherEncryptKey}'`);
                    db.run('PRAGMA journal_mode = WAL;');

                    resolve(db);
                } catch (err) {
                reject(err);
                };
            }
            });
        });
    }
}

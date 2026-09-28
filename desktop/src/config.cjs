const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

class ConfigStore {
  constructor(dir, safeStorage) {this.dir=dir;this.crypto=safeStorage;this.file=path.join(dir,'settings.json');}
  async read() {
    let data;
    try {data=JSON.parse(await fs.readFile(this.file,'utf8'));} catch(e) {if(e.code==='ENOENT')return {};throw new Error('配置文件无法读取，请保留该文件并检查账户权限');}
    try {
      return {...data,apiKey:data.apiKey?this.crypto.decryptString(Buffer.from(data.apiKey,'base64')):'',dbPassword:data.dbPassword?this.crypto.decryptString(Buffer.from(data.dbPassword,'base64')):''};
    } catch {throw new Error('当前 Windows 账户无法解密配置，请重新填写 API 配置');}
  }
  async write(input) {
    if(!this.crypto.isEncryptionAvailable())throw new Error('系统加密服务不可用，未保存密钥');
    const old=await this.read();
    const key=input.apiKey===undefined?old.apiKey:input.apiKey.trim();
    if (key && !/^[A-Za-z0-9_-]{10,300}$/.test(key)) throw new Error('API 密钥格式不正确');
    const settings={version:1,reuseExisting:input.reuseExisting??old.reuseExisting??true,imageBundle:input.imageBundle??old.imageBundle??'',apiKey:key?this.crypto.encryptString(key).toString('base64'):'',dbPassword:this.crypto.encryptString(old.dbPassword||crypto.randomBytes(24).toString('hex')).toString('base64')};
    await fs.mkdir(this.dir,{recursive:true});
    const pending=this.file+'.new';await fs.writeFile(pending,JSON.stringify(settings,null,2),{mode:0o600});await fs.rename(pending,this.file);
    return this.public();
  }
  async public() {const cfg=await this.read();return {hasApiKey:!!cfg.apiKey,reuseExisting:cfg.reuseExisting??true,imageBundle:cfg.imageBundle||'',dataDirectory:this.dir};}
}
module.exports={ConfigStore};

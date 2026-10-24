'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
class StartupHealth{
 constructor(directory,version){this.file=path.join(directory,'session-health.json');this.version=version;}
 async start(){let previous;try{previous=JSON.parse(await fs.readFile(this.file,'utf8'));}catch{}this.previous=previous?.clean===false&&previous.version===this.version;await fs.mkdir(path.dirname(this.file),{recursive:true});await fs.writeFile(this.file,JSON.stringify({version:this.version,clean:false}));return this.previous;}
 async clean(){await fs.writeFile(this.file,JSON.stringify({version:this.version,clean:true}));}
}
module.exports={StartupHealth};

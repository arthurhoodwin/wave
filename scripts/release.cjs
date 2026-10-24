'use strict';
// One current release note file is used locally and by GitHub Releases.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
const version=pkg.releaseVersion||pkg.version;
const notes=path.join(root,'releases','LATEST.md'),text=fs.readFileSync(notes,'utf8');
if(!text.startsWith('# Wave '+version+'\n')&&!text.startsWith('# Wave '+version+'\r\n'))throw Error('Version in releases/LATEST.md must match package.json');
const args=process.argv.slice(2);if(args.some(x=>!['--check','--draft'].includes(x)))throw Error('Usage: npm run release -- [--draft] | npm run release:check');
const names=['Wave-Setup-'+version+'.exe','Wave-'+version+'.waveupdate','SHA256SUMS.txt'];
const files=names.map(n=>path.join(root,'dist',n));
if(args.includes('--check')){console.log('Release notes match Wave '+version);for(let i=0;i<files.length;i++)console.log((fs.existsSync(files[i])?'Present: ':'Missing artifact: ')+names[i]);process.exit(0);}
for(const f of files)if(!fs.existsSync(f))throw Error('Missing release artifact: '+path.basename(f));
const result=spawnSync('gh',['release','create','v'+version,...files,'--repo','arthurhoodwin/wave','--verify-tag','--title','Wave '+version,'--notes-file',notes,...(args.includes('--draft')?['--draft']:[]),...(['alpha','beta','rc'].includes(pkg.releaseChannel)?['--prerelease','--latest=false']:[])],{cwd:root,stdio:'inherit',shell:false});
if(result.error)throw result.error;process.exit(result.status??1);

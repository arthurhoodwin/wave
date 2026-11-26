'use strict';

const fs = require('node:fs/promises');
const {constants, createReadStream, createWriteStream} = require('node:fs');
const {pipeline} = require('node:stream/promises');
const path = require('node:path');
const {createHash, randomUUID} = require('node:crypto');

const optionalStat = file => fs.lstat(file).catch(error => {
  if (error.code !== 'ENOENT') throw error;
});
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

async function safeFolder(folder) {
  if (!samePath(await fs.realpath(folder), path.resolve(folder))) throw Error('Папка хранения изменилась');
}

async function checksum(file, signal) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file, {signal})) hash.update(chunk);
  return hash.digest('hex');
}

function audioPath(record) {
  if (record.artwork&&!['jpg','png','webp'].includes(record.artwork.ext)) throw Error('Некорректная обложка');
  if (!/^[a-f0-9-]{36}$/.test(record.id) || !['mp3','m4a','wav','aac'].includes(record.ext)) throw Error('Некорректная локальная копия');
  return path.join(record.folder, record.id + '.' + record.ext);
}

async function filesFor(record, signal) {
  await safeFolder(record.folder);
  const entries = [
    [audioPath(record), record],
    [path.join(record.folder, record.id + '.json')],
    ...(record.artwork ? [[path.join(record.folder, record.id + '.cover.' + record.artwork.ext), record.artwork]] : []),
    [path.join(record.folder, record.id + '.lyrics.json'), record.lyrics]
  ];
  const files = [];
  for (const [file, expected] of entries) {
    signal.throwIfAborted();
    const stat = await optionalStat(file);
    if (!stat && !expected) continue;
    if (!stat?.isFile() || stat.isSymbolicLink() || (expected && stat.size !== expected.bytes)) throw Error('Ошибка файла песни «' + record.track.title + '». Запустите проверку скачанного.');
    const hash = await checksum(file, signal);
    if (expected && hash !== expected.sha256) throw Error('Повреждена локальная копия «' + record.track.title + '». Запустите проверку скачанного.');
    files.push({file, bytes:stat.size, hash});
  }
  return files;
}

async function copyVerified(source, folder, created, signal) {
  const target = path.join(folder, path.basename(source.file));
  await safeFolder(path.dirname(source.file));
  await safeFolder(folder);
  const temporary = target + '.' + randomUUID() + '.moving';
  try {
    await pipeline(createReadStream(source.file), createWriteStream(temporary, {flags:'wx',mode:0o600}), {signal});
    const handle = await fs.open(temporary,'r+');
    try { await handle.sync(); } finally { await handle.close(); }
    if (await checksum(temporary, signal) !== source.hash) throw Error('Проверка скопированного файла не прошла');
    signal.throwIfAborted();
    try {
      await fs.link(temporary,target);
    } catch (error) {
      if (error.code === 'EEXIST') throw Error('В новой папке появился файл с таким именем');
      if (!['EPERM','ENOTSUP','EOPNOTSUPP','ENOSYS'].includes(error.code)) throw error;
      // Some removable drives do not support hard links.
      await fs.copyFile(temporary,target,constants.COPYFILE_EXCL);
    }
    created.push(target);
  } finally {
    await fs.rm(temporary,{force:true}).catch(()=>{});
  }
}

class StorageMaintenance {
  constructor(downloads, {playingLocal = () => false} = {}) {
    this.downloads = downloads;
    this.playingLocal = playingLocal;
    this.downloads.playingLocal = playingLocal;
  }

  progress(phase, done, total) {
    this.status = {phase, done, total};
  }

  cancel() {
    if (this.status?.phase !== 'saving') this.operation?.abort();
  }

  async run(root, work, {changesFiles = false} = {}) {
    if (this.operation) throw Error('Операция с хранилищем уже выполняется');
    const controller = this.operation = new AbortController();
    const {downloads} = this;
    const signal = controller.signal;
    const check = () => {
      signal.throwIfAborted();
      if (root !== downloads.getRoot()) throw Error('Аккаунт изменился');
    };
    this.progress('preparing', 0, 0);
    if (changesFiles) downloads.maintaining = true;
    try {
      await downloads.restore(root);
      await downloads.offlineLyrics?.serial;
      check();
      if (changesFiles && (downloads.running || downloads.public(root).some(job => !['ready','cancelled'].includes(job.state)))) throw Error('Сначала завершите или отмените загрузки');
      if (changesFiles && this.playingLocal()) throw Error('Остановите локальную песню или переключитесь на сетевую перед изменением файлов');
      return await work(await downloads.library.account(root), signal, check);
    } catch (error) {
      if (signal.aborted) return {cancelled:true};
      throw error;
    } finally {
      downloads.maintaining = false;
      this.operation = null;
      this.status = null;
      downloads.pump();
    }
  }

  move(root, base) {
    return this.run(root, async (account, signal, check) => {
      const directory = await fs.realpath(base);
      const target = await this.downloads.folder({...account, data:{directory}});
      const records = account.data.downloads.filter(record => !samePath(record.folder,target));
      const plan = [];
      for (const record of records) {
        this.progress('checking', plan.length, records.length);
        plan.push({record, files:await filesFor(record, signal)});
      }
      const bytes = plan.flatMap(row => row.files).reduce((sum,file) => sum + file.bytes,0);
      const disk = await fs.statfs(target);
      if (bytes && disk.bavail * disk.bsize < bytes + 1024 ** 2) throw Error('В новой папке недостаточно места');
      const created = [];
      let committed = false;
      const previous = account.data.directory;
      try {
        let done = 0;
        for (const {files} of plan) {
          this.progress('copying', done, bytes);
          for (const file of files) {
            check();
            const dest = path.join(target, path.basename(file.file));
            const existing = await optionalStat(dest);
            if (existing) {
              // A previous interrupted copy may already have produced a verified file.
              if (!existing.isFile() || existing.isSymbolicLink() || existing.size !== file.bytes || await checksum(dest,signal) !== file.hash) throw Error('В новой папке уже есть другой файл с таким именем');
            } else {
              await copyVerified(file,target,created,signal);
            }
            done += file.bytes;
            this.progress('copying',done,bytes);
          }
        }
        check();
        if (this.playingLocal()) throw Error('Остановите локальное воспроизведение перед завершением переноса');
        this.progress('saving',bytes,bytes);
        account.data.directory = directory;
        const oldFolders = plan.map(({record}) => record.folder);
        for (const {record} of plan) record.folder = target;
        try {
          await this.downloads.library.save(account);
        } catch (error) {
          account.data.directory = previous;
          plan.forEach(({record}, index) => { record.folder = oldFolders[index]; });
          throw error;
        }
        committed = true;
        this.downloads.verified.clear();
        this.downloads.library.changed(root);
        let retained = 0;
        for (const file of plan.flatMap(row => row.files)) {
          try {
            await safeFolder(path.dirname(file.file));
            const stat = await optionalStat(file.file);
            if (!stat?.isFile() || stat.isSymbolicLink() || await checksum(file.file) !== file.hash) { retained++; continue; }
            await fs.unlink(file.file);
          } catch { retained++; }
        }
        return {moved:records.length, retained};
      } finally {
        if (!committed) {
          await safeFolder(target);
          await Promise.allSettled(created.map(file => fs.unlink(file)));
        }
      }
    }, {changesFiles:true});
  }

  tag(root) {
    return this.run(root, async (account, signal, check) => {
      const records = account.data.downloads.filter(record => record.ext === 'mp3' && !record.tagged);
      let tagged = 0, skipped = 0, retained = 0;
      const {writeTags} = require('./mp3-tags.cjs');
      for (const record of records) {
        check();
        this.progress('tagging', tagged + skipped, records.length);
        const created = [];
        let target, committed = false;
        try {
          const files = await filesFor(record,signal);
          target = await fs.mkdtemp(path.join(record.folder,'tagged-'));
          for (const file of files) await copyVerified(file,target,created,signal);
          const audio = audioPath({...record,folder:target});
          await writeTags(audio,record.track,{
            signal, convertArtwork:this.downloads.convertArtwork,
            artwork:record.artwork && {ext:record.artwork.ext,file:path.join(target,record.id+'.cover.'+record.artwork.ext)}
          });
          const bytes = (await fs.stat(audio)).size;
          const sha256 = await checksum(audio,signal);
          const metadata = path.join(target,record.id+'.json');
          const old = await optionalStat(metadata);
          const info = old && old.size <= 65536 ? JSON.parse(await fs.readFile(metadata,'utf8')) : {};
          const json = JSON.stringify({...info,schema:1,title:record.track.title,artist:record.track.artist,
            album:record.track.albumTitle,key:record.track.key,duration:record.track.duration,format:'mp3',sha256},null,2);
          if (!old) created.push(metadata);
          await fs.writeFile(metadata,json);
          const storageBytes = bytes + (record.artwork?.bytes || 0) + Buffer.byteLength(json);
          const used = account.data.downloads.reduce((sum, item)=>sum+(item.storageBytes||item.bytes)+(item.lyrics?.bytes||0),0);
          if(used-(record.storageBytes||record.bytes)+storageBytes>account.data.limitBytes)throw Error('Достигнут лимит скачанного');
          check();
          const original = {...record};
          Object.assign(record,{folder:target,bytes,sha256,storageBytes,tagged:true});
          try { await this.downloads.library.save(account); }
          catch (error) { delete record.tagged; Object.assign(record,original); throw error; }
          committed = true;
          this.downloads.verified.clear();
          this.downloads.library.changed(root);
          tagged++;
          for (const file of files) {
            try {
              await safeFolder(path.dirname(file.file));
              const stat = await optionalStat(file.file);
              if(!stat?.isFile()||stat.isSymbolicLink()||await checksum(file.file)!==file.hash){retained++;continue;}
              await fs.unlink(file.file);
            } catch { retained++; }
          }
        } catch (error) {
          check();
          skipped++;
        } finally {
          if(target&&!committed){
            await safeFolder(target);
            await Promise.allSettled(created.map(file=>fs.unlink(file)));
            await fs.rmdir(target).catch(()=>{});
          }
        }
      }
      return {tagged,skipped,retained};
    }, {changesFiles:true});
  }

  inspect(root) {
    return this.run(root, async (account,signal,check) => {
      const records = account.data.downloads.slice();
      const issues = [];
      let checked = 0;
      for (const record of records) {
        check();
        this.progress('checking',checked,records.length);
        try {
          await filesFor(record,signal);
        } catch {
          check();
          issues.push({id:record.id,title:record.track.title,artist:record.track.artist});
        }
        checked++;
      }
      return {checked,issues};
    });
  }
}

module.exports = {StorageMaintenance, filesFor, safeFolder, checksum, copyVerified, audioPath, optionalStat};

'use strict';
// Electron's normal fs treats app.asar as a virtual directory. Update hashes
// and block copies must always operate on the real archive bytes on disk.
module.exports=process.versions.electron?require('original-fs'):require('node:fs');

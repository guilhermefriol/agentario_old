// Leitor incremental de JSONL: lê só bytes novos, bufferiza linha incompleta,
// detecta truncamento/rotação e limita a leitura inicial de arquivos grandes.
import fs from 'node:fs';

const CHUNK = 1024 * 1024;

export class JsonlTail {
  constructor(file, { initialMaxBytes = 16 * 1024 * 1024 } = {}) {
    this.file = file;
    this.offset = null;
    this.partial = '';
    this.ino = null;
    this.initialMaxBytes = initialMaxBytes;
  }

  // Chama onRecord(obj) para cada linha JSON completa nova. Retorna nº de registros.
  poll(onRecord) {
    let fd;
    try {
      fd = fs.openSync(this.file, 'r');
      const st = fs.fstatSync(fd);
      let skipFirstLine = false;
      if (this.offset === null || st.ino !== this.ino || st.size < this.offset) {
        // primeira leitura, arquivo trocado ou truncado: relê
        const reset = this.offset !== null;
        this.ino = st.ino;
        this.partial = '';
        this.offset = st.size > this.initialMaxBytes ? st.size - this.initialMaxBytes : 0;
        skipFirstLine = this.offset > 0;
        if (reset) this.onReset?.();
      }
      let n = 0;
      const buf = Buffer.alloc(CHUNK);
      while (this.offset < st.size) {
        const want = Math.min(CHUNK, st.size - this.offset);
        const got = fs.readSync(fd, buf, 0, want, this.offset);
        if (got <= 0) break;
        this.offset += got;
        let text = this.partial + buf.toString('utf8', 0, got);
        const lines = text.split('\n');
        this.partial = lines.pop();
        if (this.partial.length > 64 * 1024 * 1024) this.partial = ''; // linha absurda: descarta
        for (const line of lines) {
          if (skipFirstLine) { skipFirstLine = false; continue; }
          if (!line) continue;
          let rec;
          try { rec = JSON.parse(line); } catch { continue; }
          if (rec && typeof rec === 'object') { onRecord(rec); n++; }
        }
      }
      return n;
    } catch { return 0; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
  }
}

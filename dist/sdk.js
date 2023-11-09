export class OPFSWorker {
  available = true; // 功能是否支持
  root = null; // 根句柄
  current = []; // 上下文文件夹句柄

  constructor() {
    if (!navigator.storage || !navigator.storage.getDirectory) {
      this.available = false;
    }

    navigator.storage.getDirectory().then((home) => {
      this.root = home;
      this.current.push(this.root);

      this.postMessage({
        action: 'ready',
        available: this.available,
      });
    });
  }

  postMessage({ error = '', ...out }, evt) {
    postMessage({
      action: evt && evt.action,
      ...out,
      error,
    });
  }

  getCurrent() {
    const current = this.current[this.current.length - 1];
    return current;
  }

  async onMessage(event) {
    // debugger;
    if (!this.available)
      return this.postMessage(
        {
          action: 'ready',
          available: this.available,
          error: '浏览器不支持 StorageManager',
        },
        evt
      );

    console.log('[main to worker]', event.data);
    const { action } = event.data;
    if (this[action]) {
      try {
        await this[action](event.data);
      } catch (error) {
        this.postMessage({ error }, event.data);
      }
    }
  }

  async info(evt) {
    this.postMessage(
      {
        root: this.root,
        current: this.current,
        available: this.available,
      },
      evt
    );
  }

  async relativePath(target, root = true) {
    let arr = [];
    if (!root) {
      arr = await this.getCurrent().resolve(target);
    } else {
      arr = await this.root.resolve(target);
    }
    arr.pop();
    return arr;
  }

  async move(evt) {
    const { fromHandle, toHandle = this.getCurrent(), name = '' } = evt;
    if (fromHandle.kind == 'file')
      // 文件夹暂不能移
      await fromHandle.move(toHandle, name || fromHandle.name);
    this.postMessage({}, evt);
  }

  async read(evt) {
    const { name } = evt;
    const fileHandle = await this.getCurrent().getFileHandle(name);
    const accessHandle = await fileHandle.createSyncAccessHandle(); // FileSystemSyncAccessHandle 仅在 Worker 上下文中可用

    // Get size of the file.
    const fileSize = await accessHandle.getSize();
    // Read file content to a buffer.
    const buffer = new DataView(new ArrayBuffer(fileSize));
    const readSize = accessHandle.read(buffer, { at: 0 });
    accessHandle.close();
    this.postMessage(
      {
        readSize,
        content: buffer.buffer,
      },
      evt
    );
  }
  async write(evt) {
    const { name, position, content } = evt;
    const fileHandle = await this.getCurrent().getFileHandle(name, {
      create: true,
    });
    const accessHandle = await fileHandle.createSyncAccessHandle(); // FileSystemSyncAccessHandle 仅在 Worker 上下文中可用
    const fileSize = await accessHandle.getSize();
    let at = position;
    if (-1 === position) {
      // -1 is append
      at = fileSize;
    }

    let writeSize = 0;
    if (content instanceof ArrayBuffer) {
      writeSize = accessHandle.write(new DataView(content), { at });
    } else {
      const encoder = new TextEncoder();
      const encodedMessage = encoder.encode(content);
      writeSize = accessHandle.write(encodedMessage, { at });
    }
    accessHandle.flush();
    accessHandle.close();
    this.postMessage(
      {
        writeSize,
      },
      evt
    );
  }
  async upload(evt) {
    const { item } = evt;
    const reader = new FileReader();
    reader.addEventListener('load', async (event) => {
      const ev = {
        ...evt,
        name: item.name,
        position: 0,
        content: event.target.result,
      };
      await this.write(ev);
    });
    reader.readAsArrayBuffer(await item.getFile());
  }
  async remove(evt) {
    const { items } = evt,
      arr = [];
    items.map(async (name) => {
      arr.push(this.getCurrent().removeEntry(name, { recursive: true }));
    });

    Promise.all(arr).then(() => {
      this.postMessage(
        {
          items,
        },
        evt
      );
    });
  }
  async clean(evt) {
    const arr = [];
    for await (const handle of this.root.values()) {
      if (handle.kind == 'directory') {
        arr.push(this.root.removeEntry(handle.name, { recursive: true }));
      } else {
        arr.push(this.root.removeEntry(handle.name));
      }
    }
    Promise.all(arr).then(() => {
      this.current = [this.root];
      this.postMessage({}, evt);
    });
  }
  async list(evt) {
    const arr = [];
    for await (const handle of this.getCurrent().values()) {
      arr.push({
        kind: handle.kind,
        name: handle.name,
        suffix: handle.name.split('.').pop(),
        handle,
      });
    }
    this.postMessage(
      {
        items: arr,
      },
      evt
    );
  }
  async cd(evt) {
    const { pwd, name } = evt;
    let current = this.getCurrent();
    if ('..' == name) {
      if (this.current.length > 1) {
        this.current.pop(); // 返回上层
        current = this.getCurrent();
      }
    } else {
      const dirHandle = await current.getDirectoryHandle(name);
      this.current.push(dirHandle);
      current = this.getCurrent();
    }

    let dir = pwd.split('/').pop();
    if ('' == dir) {
      dir = '/';
    }
    this.postMessage(
      {
        dirname: dir,
        current,
      },
      evt
    );
  }
  async touch(evt) {
    const { kind, name } = evt;
    let handle = null,
      current = this.getCurrent();
    switch (kind) {
      case 'file':
        handle = await current.getFileHandle(name, {
          create: true,
        });
        break;
      case 'directory':
        handle = await current.getDirectoryHandle(name, {
          create: true,
        });
        break;
      default:
        break;
    }

    this.postMessage(
      {
        handle,
      },
      evt
    );
  }
  async verifyPermission(fileHandle, readWrite) {
    const options = {};
    if (readWrite) {
      options.mode = 'readwrite';
    }
    // Check if permission was already granted. If so, return true.
    if ((await fileHandle.queryPermission(options)) === 'granted') {
      return true;
    }
    // Request permission. If the user grants permission, return true.
    if ((await fileHandle.requestPermission(options)) === 'granted') {
      return true;
    }
    // The user didn't grant permission, so return false.
    return false;
  }
  async syncToDisk(evt, level = 0) {
    const { fromHandle = this.getCurrent(), toHandle } = evt;
    if ('directory' === fromHandle.kind) {
      for await (const handle of fromHandle.values()) {
        if ('directory' === handle.kind) {
          const dirHandle = await toHandle.getDirectoryHandle(handle.name, {
            create: true,
          });
          await this.syncToDisk(
            {
              fromHandle: handle,
              toHandle: dirHandle,
            },
            level + 1
          );
        } else {
          await this.syncToDisk(
            {
              fromHandle: handle,
              toHandle: toHandle,
            },
            level + 1
          );
        }
      }
    } else {
      const permission = await this.verifyPermission(toHandle, true);
      if (permission) {
        const fileHandle = await toHandle.getFileHandle(fromHandle.name, {
          create: true,
        });
        const accessHandle = await fileHandle.createWritable(); // Access Handles may only be created on temporary file systems
        await accessHandle.truncate(0);
        const blob = await fromHandle.getFile();
        await accessHandle.write(blob);
        await accessHandle.close();
      }
    }

    if (0 === level) {
      this.postMessage({}, evt);
    }
  }
}

// class to worker
export const workerFromClass = (workerClassRef) => {
  console.log(workerClassRef.name, 'init');
  const workerFactory = (self, workerClass) => {
    const opfs = new workerClass();
    self['onmessage'] = opfs.onMessage.bind(opfs);
  };

  const code = `${workerClassRef}
  (${workerFactory})
  (this,${workerClassRef.name});`;
  return new Worker(
    URL.createObjectURL(
      new Blob([code], {
        type: 'application/javascript',
        name: '[https]StorageManager',
      })
    )
  );
};

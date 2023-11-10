# Origin Private File System（浏览器沙盒化文件系统）

## 背景

1. [File and Directory Entries API](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestFileSystem) (废弃)
2. [Storage Foundation API](https://developer.chrome.com/docs/web-platform/storage-foundation/) (废弃)
3. [File System Access API](https://developer.chrome.com/articles/file-system-access/)


一个orign范围内的私有文件系统，主要功能是增删改查文件，适合频繁操作文件及大文件的应用场景，提供了一种直接创建、打开、读取和写入文件的统一API。

- 一个页面只能访问其origin目录中的文件或目录。

- 不同浏览器的origin目录是不共享的，也不在用户本地文件系统内找到其所在。

参考规范：[StorageManager](https://storage.spec.whatwg.org/)

## Can i use

[Source](https://caniuse.com/native-filesystem-api)要求站点必须是https

![Snip20231019_4.png](https://s2.loli.net/2023/10/19/Edh5G9jzgFWOwJV.png)

## 核心API

- FileSystemHandle, 代表文件系统根句柄
- FileSystemFileHandle, 继承 FileSystemHandle ，代表文件句柄
- FileSystemDirectoryHandle, 继承 FileSystemHandle ，代表目录句柄
- FileSystemSyncAccessHandle, 独占全双工读写句柄 
  

``
  FileSystemHandle、FileSystemFileHandle、FileSystemDirectoryHandle 可在 Window and Worker 上下文中, FileSystemSyncAccessHandle 仅可存在于 Worker 中
``

![Snip20231019_3.png](https://s2.loli.net/2023/10/19/AjL2DfT6h7pr5Zu.png)

提示：大部分API都是异步的，除了read和write是同步的

## 数据是否持久化

存储的两种模式：即`best-effort`或`persistent`。默认是 `best-effort`

通常意义，origin下的数据不会丢失，但是一旦设备存储空间耗尽就会LRU算法逐出数据，这种情况就有可能丢失，所以需要API使用者明确标记持久化的要求，设备就不会因可用空间不足去清理数据。

[参考说明](https://web.dev/articles/persistent-storage?hl=zh-cn)

## 文件系统

这是一套类似对象存储的系统，不同origin在不同的bucket下

![](https://storage.spec.whatwg.org/assets/model-diagram.svg)


## 应用场景

- 不常更新的数据，比如WebAssembly
- 不适合网络IO的大文件资源，比如视频、图片
- 不阻塞js主进程的文件读写，比如psd
- 有本地磁盘访问的离线应用，比如web编辑器，制图引擎
- 其他

## 功能示例


### 界面

![Snip20231110_2.png](https://s2.loli.net/2023/11/10/RzwT1QjIVHJyZMv.png)

### 按需授权

![Snip20231108_21.png](https://s2.loli.net/2023/11/08/vLh8ybxR4QkqGXT.png)

### 查看

```js
    const arr = [];
    for await (const handle of this.getCurrent().values()) {
      arr.push({
        kind: handle.kind,
        name: handle.name,
        suffix: handle.name.split('.').pop(),
        handle, // 可在window和worker之间共享句柄
      });
    }
```

### 读取

```js
    const { name } = evt;
    const fileHandle = await this.getCurrent().getFileHandle(name);
    const accessHandle = await fileHandle.createSyncAccessHandle(); // FileSystemSyncAccessHandle 仅在 Worker 上下文中可用

    // Get size of the file.
    const fileSize = await accessHandle.getSize();
    // Read file content to a buffer.
    const buffer = new DataView(new ArrayBuffer(fileSize));
    const readSize = accessHandle.read(buffer, { at: 0 });
    accessHandle.close();
```

### 写入

```js
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
    if (content instanceof ArrayBuffer) { // 二进制类
      writeSize = accessHandle.write(new DataView(content), { at });
    } else { // 文本类
      const encoder = new TextEncoder();
      const encodedMessage = encoder.encode(content);
      writeSize = accessHandle.write(encodedMessage, { at });
    }
    accessHandle.flush(); // 强刷到磁盘
    accessHandle.close();
```

### 创建

```js
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
```

### 删除

```js
    const { items } = evt,
      arr = [];
    items.map(async (name) => {
      arr.push(this.getCurrent().removeEntry(name, { recursive: true })); // 递归删除
    });
    Promise.all(arr)
```

### 移动/改名

```js
    const { fromHandle, toHandle = this.getCurrent(), name = '' } = evt;
    if (fromHandle.kind == 'file')
      // 文件夹暂不能移
      await fromHandle.move(toHandle, name || fromHandle.name);
```

## 灵感来源

1. [Case study](https://developer.chrome.com/tags/case-study/)
2. [Web APIs](https://developer.mozilla.org/en-US/docs/Web/API)
3. [渐进式](https://web.dev/articles/progressively-enhance-your-pwa?hl=zh-cn#notification_triggers_api)


## 代码

[项目](https://github.com/tsdk/opfs-storage) fork后直接运行

```bash
> npx serve .
```

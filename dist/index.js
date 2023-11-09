import {
  createApp,
  reactive,
  nextTick,
} from 'https://unpkg.com/petite-vue?module';
import { OPFSWorker, workerFromClass } from './sdk.js';
const worker = workerFromClass(OPFSWorker);

function getHandles(ctx) {
  return {
    onError: function(evt) {
      return new Promise((resolve, reject) => {
        if (evt.error) {
          store.error =
            typeof evt.error == 'string' ? evt.error : evt.error.message;
          reject(evt);
        } else {
          resolve(evt);
        }
      }).catch((ev) => {
        console.error(ev.error, ev);
        throw new Error(ev.error);
      });
    },
    info: function(evt) {
      // 空间信息
      this.onError(evt).then(() => {
        setTimeout(() => {
          let str = '';
          // 仅在window 上下文中用
          navigator.storage.estimate().then((data) => {
            str += `<p>桶信息：${JSON.stringify(data)}</p>`;
            store.info = str;
          });

          navigator.storage.persisted().then((persistent) => {
            str += `<p>是否持久化：${JSON.stringify(persistent)}</p>`;
            store.info = str;
            navigator.storage.persist().then((isPersisted) => {
              console.log(`Persisted storage granted: ${isPersisted}`);
            });
          });
        }, 100);
      });
    },
    list: function(evt) {
      // 刷新列表
      this.onError(evt).then(() => {
        store.detail = '';
        store.items = [...evt.items];
      });
    },
    cd: function(evt) {
      this.onError(evt).then(() => {
        worker.postMessage({ ...store.ctx, action: 'list' });
      });
    },
    touch: function(evt) {
      this.onError(evt).then(() => {
        worker.postMessage({ ...store.ctx, action: 'list' });
      });
    },
    remove: function(evt) {
      this.onError(evt).then(() => {
        worker.postMessage({ ...store.ctx, action: 'list' });
      });
    },
    clean: function(evt) {
      this.onError(evt).then(() => {
        worker.postMessage({ ...store.ctx, action: 'list' });
      });
    },
    move: function(evt) {
      this.onError(evt).then(() => {
        worker.postMessage({ ...store.ctx, action: 'list' });
      });
    },
    read: function(evt) {
      this.onError(evt).then(() => {
        const decoder = new TextDecoder();
        const str = decoder.decode(evt.content.slice(0, 1000));
        store.detail = str;
      });
    },
    upload: function(evt) {
      this.onError(evt).then(() => {
        worker.postMessage({ ...store.ctx, action: 'list' });
      });
    },
  };
}

const store = reactive({
  info: '',
  items: [],
  detail: '',
  error: '',
  ready: false,
  setReady() {
    this.ready = true;
    this.handles = getHandles(this.ctx);
  },
  ctx: { pwd: '/' },
  handles: {},
  dataTransferItem: null,
});

function App(props) {
  return {
    $template: '#page',
    store,
    onMounted() {
      setTimeout(() => {
        this.postMessage({ action: 'list' });
      }, 1000);
    },
    active(item) {
      item.active = !item.active;
      if (item.active) {
        store.detail = { kind: item.kind, name: item.name };
      } else {
        store.detail = '';
      }
      store.items.map((el) => {
        if (el !== item) {
          el.active = false;
        }
      });
    },
    editable(item, evt) {
      item.editable = !item.editable;
      store.items.map((el) => {
        if (el !== item) {
          el.editable = false;
        }
      });
      if (item.editable) {
        const parent = evt.target.parentElement;
        nextTick(() => {
          const input = parent.querySelector('input');
          input.focus();
          input.select();
        });
      }
    },
    editend(item, evt) {
      if (13 == evt.keyCode) {
        // 回车
        item.name = evt.target.value;
        this.postMessage({
          action: 'move',
          fromHandle: item.handle,
          name: item.name,
        });
        item.editable = false;
      } else if (27 == evt.keyCode) {
        // esc
        item.name = item.handle.name;
        item.editable = false;
      }
    },
    postMessage(obj) {
      store.error = '';
      worker.postMessage({ ...store.ctx, ...obj });
    },
    info() {
      const obj = {
        action: 'info',
        data: '数据 from main\n',
      };
      this.postMessage(obj);
    },
    createFile() {
      const name = window.prompt('请输入文件名');
      name &&
        this.postMessage({
          action: 'touch',
          name,
          kind: 'file',
        });
    },
    createDirectory() {
      const name = window.prompt('请输入目录名');
      name &&
        this.postMessage({
          action: 'touch',
          name,
          kind: 'directory',
        });
    },
    cd(item) {
      if ('..' === item.name) {
        const idx = store.ctx.pwd.lastIndexOf('/');
        store.ctx.pwd = store.ctx.pwd.substring(0, idx) || '/';
        this.postMessage({ action: 'cd', ...item });
      } else if (item.kind == 'directory') {
        if ('/' == store.ctx.pwd) {
          store.ctx.pwd += `${item.name}`;
        } else {
          store.ctx.pwd += `/${item.name}`;
        }
        this.postMessage({ action: 'cd', ...item });
      }
    },
    remove() {
      let items = [],
        cnt = 0;
      store.items.map((el) => {
        if (el.active) {
          cnt += 1;
          if (confirm(`确定删除 ${el.name} ?`)) {
            items.push(el.name);
          }
        }
      });
      if (items.length > 0) {
        return this.postMessage({ action: 'remove', items });
      } else if (cnt <= 0) {
        alert('请至少选择一项');
      }
    },
    clean() {
      if (confirm(`确定全部清空?`)) {
        store.ctx.pwd = '/';
        store.detail = '';
        store.error = '';
        store.info = '';
        this.postMessage({ action: 'clean' });
      }
    },
    read(item) {
      if ('file' == item.kind) {
        this.postMessage({ action: 'read', ...item });
      }
    },
    upload() {
      const pickerOpts = {
        types: [
          {
            description: 'Image+Video',
            accept: {
              'image/*': ['.png', '.gif', '.jpeg', '.jpg'],
              'video/*': ['.mp4', '.mov', '.avi', '.wmv'],
            },
          },
        ],
        excludeAcceptAllOption: true,
        multiple: false,
      };
      showOpenFilePicker(pickerOpts).then(async (items) => {
        items.map((item) => {
          this.postMessage({ action: 'upload', item });
        });
      });
    },
    ondragstart(item) {
      store.dataTransferItem = item;
    },
    ondragover(evt) {
      evt.preventDefault();
    },
    ondrop(to) {
      const from = store.dataTransferItem;
      if (from && to.kind == 'directory') {
        this.postMessage({
          action: 'move',
          fromHandle: from.handle,
          toHandle: to.handle,
        });
      }
      store.dataTransferItem = null;
    },
    async saveAs() {
      let obj = {
        action: 'syncToDisk',
      };
      for (let index = 0; index < store.items.length; index++) {
        const item = store.items[index];
        if (item.active) {
          obj.fromHandle = item.handle;
          break;
        }
      }
      obj.toHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      this.postMessage(obj);
    },
  };
}

createApp({
  App,
}).mount();

window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  console.warn(`UNHANDLED PROMISE REJECTION: ${event.reason}`);
});

// handle error from worker
worker.addEventListener('error', (event) => {
  debugger;
  event.preventDefault();
  console.error(event);
});

// handle messages from worker
worker.addEventListener('message', (event) => {
  console.log('[worker to main]', event.data);
  const { action } = event.data;
  switch (action) {
    case 'ready':
      store.setReady(true);
      break;
    default:
      if (store.handles[action]) store.handles[action](event.data);
      else store.handles['onError'](event.data);
      break;
  }
});

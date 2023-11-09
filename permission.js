// [live demo]https://whatwebcando.today/permissions.html
// [detail]chrome://settings/content
const names = {
  1: 'geolocation', // LBS
  2: 'userMedia', // 摄像头和麦克风
  3: 'midi', // 数字乐器输入输出
  4: 'notifications', // 通知提醒
  5: 'wakelock', // 需要屏幕常亮
  6: 'nfc', // nfc for mobile
  7: 'push', // 推送（无需浏览器打开应用）
  8: 'bluetooth', // 蓝牙
  9: 'accelerometer', // 加速器
  11: 'camera', // 相机
  12: 'microphone', // 麦克风
  10: 'background-sync', // 后台同步
  13: 'payment-handler', // 支付标准化
  14: 'persistent-storage', // 持久化存储
  15: 'clipboard-read', // 剪贴板读
  16: 'clipboard-write', // 剪贴板写
  17: 'gyroscope', // 陀螺仪
}; // or more
const opts = {
  push: { userVisibleOnly: true },
  midi: { sysex: true },
};

const idx = 14;
navigator.permissions
  .query({ name: names[idx] }, opts[names[idx]] || {})
  .then((result) => {
    console.log(names[idx] + ' granted');
    console.log(result); // prompt ｜ denied
  })
  .catch((err) => {
    switch (err.name) {
      case 'PermissionDeniedError':
        console.log(err.message);
        // "User denied access to geolocation"
        break;
      case 'PermissionDismissedError':
        console.log(err.message);
        // "User dissmissed access to geolocation"
        break;
      case 'PermissionTimeoutError':
        console.log(err.message);
        // "Couldn't find GPS position in time"
        break;
      case 'TypeError':
        console.log(err.message);
        // "The provided value geolocation is not a valid enum value of type PermissionName."
        break;
      default:
        console.log(err.message);
        break;
    }
  });

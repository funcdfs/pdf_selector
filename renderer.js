// DOM Elements
const setPathButton = document.getElementById('set-path-button');
const startMonitorButton = document.getElementById('start-monitor-button');
const stopMonitorButton = document.getElementById('stop-monitor-button');
const savePathDisplay = document.getElementById('save-path-display');
const statusElement = document.getElementById('status');
const historyList = document.getElementById('history-list');
const counterElement = document.getElementById('counter');
const counterNumber = document.querySelector('.counter-number');
const completedActions = document.getElementById('completed-actions');
const openPdfButton = document.getElementById('open-pdf-button');
const newPdfButton = document.getElementById('new-pdf-button');
const notification = document.getElementById('notification');
const shortcutHint = document.getElementById('shortcut-hint');
const startMonitorLabel = document.getElementById('start-monitor-label');

// Application State
let isMonitoring = false;
let currentPageCount = 0;
let currentSavePath = null;
let lastSavedPdf = null;
let platform = window.electronAPI.getPlatform();
let isWindows = platform === 'win32';
let isLinux = platform === 'linux';
let isMac = platform === 'darwin';

// 性能优化设置
const OPERATION_TIMEOUT = 15000; // 操作超时时间（毫秒）
const DEBOUNCE_DELAY = 300; // 防抖延迟（毫秒）
const MAX_HISTORY_ITEMS = 20; // 历史记录最大条目

// UI Constants
const SHORTCUTS = {
   setSavePath: { key: 'o', command: setSavePath, condition: () => !isMonitoring && !setPathButton.disabled },
   startMonitoring: { key: 's', command: startMonitoring, condition: () => !startMonitorButton.disabled },
   stopMonitoring: { key: 'e', command: stopMonitoring, condition: () => !stopMonitorButton.disabled },
   openPdf: { key: 'p', command: openPdf, condition: () => lastSavedPdf && completedActions.style.display !== 'none' },
   createNewPdf: { key: 'n', command: createNewPdf, condition: () => completedActions.style.display !== 'none' }
};

// 初始化应用
document.addEventListener('DOMContentLoaded', initializeApp);

// 应用初始化
function initializeApp() {
   // 防抖的状态更新
   const debouncedUpdateUI = debounce(updatePlatformSpecificUI, DEBOUNCE_DELAY);

   // 根据平台调整UI
   debouncedUpdateUI();

   // 设置事件监听器
   setupEventListeners();

   // 初始化按钮状态
   updateButtonStates();

   // 初始化历史记录
   initializeHistory();

   // 首次启动显示全局快捷键提示
   setTimeout(() => {
      if (isWindows || isLinux) {
         shortcutHint.textContent = "全局快捷键: Ctrl+Alt+S 开始监听, Ctrl+Alt+E 停止";
      } else if (isMac) {
         shortcutHint.textContent = "全局快捷键: ⌥⌘+S 开始监听, ⌥⌘+E 停止";
      }
      showNotification('shortcut');
   }, 1500);
}

// 设置所有事件监听器
function setupEventListeners() {
   // --- Button Event Listeners ---
   setPathButton.addEventListener('click', setSavePath);
   startMonitorButton.addEventListener('click', startMonitoring);
   stopMonitorButton.addEventListener('click', stopMonitoring);
   openPdfButton.addEventListener('click', openPdf);
   newPdfButton.addEventListener('click', createNewPdf);

   // --- Keyboard Shortcuts ---
   document.addEventListener('keydown', handleKeyboardShortcuts);

   // --- IPC Listeners --- 
   window.electronAPI.onMonitorStateChanged(handleMonitorStateChange);
   window.electronAPI.onClipboardImageAdded(handleClipboardImageAdded);
   window.electronAPI.onMonitorComplete(handleMonitorComplete);
   window.electronAPI.onMonitorError(handleMonitorError);

   // --- 监听全局快捷键 ---
   window.electronAPI.onTriggerStartMonitor(() => {
      if (!startMonitorButton.disabled) {
         startMonitoring();
         showNotification('global', '开始监听剪贴板');
      }
   });

   window.electronAPI.onTriggerStopMonitor(() => {
      if (!stopMonitorButton.disabled) {
         stopMonitoring();
         showNotification('global', '停止并保存PDF');
      }
   });
}

// 键盘快捷键处理
function handleKeyboardShortcuts(e) {
   if (!(e.metaKey || e.ctrlKey)) return;

   Object.entries(SHORTCUTS).forEach(([name, config]) => {
      if (e.key === config.key && config.condition()) {
         e.preventDefault();
         config.command();
         showNotification('shortcut');
      }
   });
}

// 防抖函数
function debounce(func, delay) {
   let timeoutId;
   return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
   };
}

// 超时处理包装器
function withTimeout(promise, timeoutMs, errorMessage) {
   let timeoutId;

   // 创建一个会在指定时间后拒绝的Promise
   const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
         reject(new Error(errorMessage || '操作超时'));
      }, timeoutMs);
   });

   // 返回一个在原始Promise解决或超时Promise拒绝时解决的Promise
   return Promise.race([
      promise,
      timeoutPromise
   ]).finally(() => {
      clearTimeout(timeoutId);
   });
}

// 批量处理DOM更新
function batchDOMUpdates(updates) {
   // 使用requestAnimationFrame来批量处理DOM更新
   return new Promise(resolve => {
      requestAnimationFrame(() => {
         updates();
         resolve();
      });
   });
}

function updatePlatformSpecificUI() {
   // 根据平台更新快捷键显示
   const shortcutPrefix = isWindows || isLinux ? 'Ctrl' : '⌘';
   const globalShortcutPrefix = isWindows || isLinux ? 'Ctrl+Alt' : '⌥⌘';

   batchDOMUpdates(() => {
      document.querySelectorAll('.shortcut').forEach(el => {
         if (el.textContent.includes('⌘+')) {
            el.textContent = el.textContent.replace('⌘+', `${shortcutPrefix}+`);
         }
      });

      // 更新全局快捷键提示
      if (shortcutHint) {
         shortcutHint.textContent = `全局快捷键: ${globalShortcutPrefix}+S/E`;
      }

      // 为Windows添加更多可见的说明
      if (isWindows) {
         const tooltip = document.querySelector('.tooltip');
         if (tooltip) {
            const currentTooltip = tooltip.getAttribute('data-tooltip');
            tooltip.setAttribute('data-tooltip',
               `${currentTooltip} 您还可以使用全局快捷键 Ctrl+Alt+S 开始监听，Ctrl+Alt+E 停止监听。`);
         }
      }
   });
}

// 更新按钮状态
function updateButtonStates() {
   const stopBtnText = isWindows || isLinux ? 'Ctrl+E' : '⌘+E';
   const stopHTML = `停止并保存<span class="shortcut">${stopBtnText}</span>`;

   batchDOMUpdates(() => {
      if (isMonitoring) {
         counterElement.classList.add('active');
         setPathButton.disabled = true;
         startMonitorButton.disabled = true;
         stopMonitorButton.disabled = false;
         stopMonitorButton.innerHTML = stopHTML;
      } else {
         counterElement.classList.remove('active');
         setPathButton.disabled = false;
         startMonitorButton.disabled = !currentSavePath;
         stopMonitorButton.disabled = true;
         startMonitorLabel.innerHTML = '开始监听剪贴板';
         stopMonitorButton.innerHTML = stopHTML;
      }
   });
}

// 统一通知显示函数
function showNotification(type, message) {
   switch (type) {
      case 'shortcut':
         batchDOMUpdates(() => {
            shortcutHint.classList.add('show');
         });
         setTimeout(() => {
            batchDOMUpdates(() => shortcutHint.classList.remove('show'))
         }, 1500);
         break;

      case 'global':
         const globalNotification = document.createElement('div');
         globalNotification.className = 'notification';
         globalNotification.style.backgroundColor = 'rgba(67, 97, 238, 0.95)';
         globalNotification.innerHTML = `<span>全局快捷键: ${message}</span>`;

         batchDOMUpdates(() => {
            document.body.appendChild(globalNotification);
            // 强制回流
            void globalNotification.offsetWidth;
            // 应用动画
            globalNotification.classList.add('show');
         });

         setTimeout(() => {
            batchDOMUpdates(() => globalNotification.classList.remove('show'));
            setTimeout(() => {
               batchDOMUpdates(() => document.body.removeChild(globalNotification));
            }, 400);
         }, 2000);
         break;

      case 'clipboard':
         batchDOMUpdates(() => notification.classList.add('show'));
         setTimeout(() => {
            batchDOMUpdates(() => notification.classList.remove('show'));
         }, 2000);
         break;
   }
}

// --- Core Functions ---
async function setSavePath() {
   try {
      showStatus('正在设置保存路径...', 'info');
      const result = await withTimeout(
         window.electronAPI.setSavePath(),
         OPERATION_TIMEOUT,
         '设置保存路径操作超时，请重试'
      );

      if (result.success && result.path) {
         currentSavePath = result.path;

         batchDOMUpdates(() => {
            savePathDisplay.textContent = `保存位置: ${currentSavePath}`;
            startMonitorButton.disabled = false;
            completedActions.style.display = 'none';
         });

         showStatus('保存路径已设置，可以开始监听剪贴板。', 'info');
         resetCounter();
      } else if (result.error) {
         showStatus(`设置路径出错: ${result.error}`, false);
      }
   } catch (error) {
      console.error('设置保存路径出错:', error);
      showStatus(`设置路径出错: ${error.message || '未知错误'}`, false);
   }
}

async function startMonitoring() {
   if (!currentSavePath) {
      showStatus('请先设置保存路径', false);
      return;
   }

   try {
      batchDOMUpdates(() => {
         startMonitorLabel.innerHTML = '<span class="loading-circle"></span>正在监听...';
         completedActions.style.display = 'none';
      });

      resetCounter();

      await withTimeout(
         window.electronAPI.startClipboardMonitor(),
         OPERATION_TIMEOUT,
         '启动监听操作超时，请重试'
      );
   } catch (error) {
      console.error('启动监听出错:', error);
      showStatus(`启动监听出错: ${error.message || '未知错误'}`, false);

      // 恢复UI状态
      batchDOMUpdates(() => {
         startMonitorLabel.innerHTML = '开始监听剪贴板';
      });
   }
}

async function stopMonitoring() {
   try {
      batchDOMUpdates(() => {
         stopMonitorButton.innerHTML = '<span class="loading-circle"></span>正在保存...';
         stopMonitorButton.disabled = true;
      });

      await withTimeout(
         window.electronAPI.stopClipboardMonitor(),
         OPERATION_TIMEOUT,
         '停止监听操作超时，请重试'
      );
   } catch (error) {
      console.error('停止监听出错:', error);
      showStatus(`停止监听出错: ${error.message || '未知错误'}`, false);

      // 恢复UI状态
      batchDOMUpdates(() => {
         const stopBtnText = isWindows || isLinux ? 'Ctrl+E' : '⌘+E';
         stopMonitorButton.innerHTML = `停止并保存<span class="shortcut">${stopBtnText}</span>`;
         stopMonitorButton.disabled = false;
      });
   }
}

function openPdf() {
   if (lastSavedPdf) {
      try {
         window.electronAPI.openFile(lastSavedPdf);
      } catch (error) {
         console.error('打开PDF出错:', error);
         showStatus(`打开PDF出错: ${error.message || '未知错误'}`, false);
      }
   } else {
      showStatus('没有可打开的PDF文件', false);
   }
}

function createNewPdf() {
   batchDOMUpdates(() => {
      completedActions.style.display = 'none';
   });
   resetCounter();
   showStatus('准备创建新PDF。请选择保存位置。', 'info');
}

// 重置计数器
function resetCounter() {
   currentPageCount = 0;
   batchDOMUpdates(() => {
      counterNumber.textContent = '0';
   });
}

// 初始化历史记录
function initializeHistory() {
   // 在这里可以添加从localStorage或其他存储加载历史记录的逻辑
   // 目前仅清空历史记录列表
   batchDOMUpdates(() => {
      historyList.innerHTML = '';
   });
}

// --- IPC Callback Handlers ---
function handleMonitorStateChange(isActive) {
   isMonitoring = isActive;
   console.log('监听状态改变:', isActive);

   updateButtonStates();

   if (isActive) {
      showStatus('正在监听剪贴板... 复制截图后会自动添加到PDF。', 'info');
      resetCounter();
   }
}

function handleClipboardImageAdded(result) {
   currentPageCount = result.pageNumber;

   batchDOMUpdates(() => {
      counterNumber.textContent = currentPageCount;
   });

   // 显示通知
   showNotification('clipboard');

   showStatus(`已添加第 ${currentPageCount} 张图片到PDF`, 'info');
}

function handleMonitorComplete(result) {
   if (result.success) {
      lastSavedPdf = result.path;

      // 为Windows显示更友好的路径
      let displayPath = result.path;
      if (isWindows) {
         const pathParts = result.path.split('\\');
         if (pathParts.length > 2) {
            // 显示前两部分...最后一部分
            displayPath = `${pathParts[0]}\\${pathParts[1]}\\...\\${pathParts[pathParts.length - 1]}`;
         }
      }

      const message = `成功保存 ${result.pageCount} 页PDF到: ${displayPath}`;
      showStatus(message, true);
      addToHistory(result.path, result.pageCount);

      // 显示完成操作区
      batchDOMUpdates(() => {
         completedActions.style.display = 'block';
      });
   } else {
      lastSavedPdf = null;
      const isError = result.error && result.error.startsWith('保存PDF失败');

      if (isError) {
         showStatus(`错误: ${result.error || '保存PDF时出现未知错误'}`, false);
      } else {
         showStatus(`监听已停止。${result.error || '未保存任何内容'}`, 'info');
      }
   }
}

function handleMonitorError(errorMessage) {
   showStatus(`监听错误: ${errorMessage}`, false);
}

// --- UI Utility Functions ---
function showStatus(message, type) {
   batchDOMUpdates(() => {
      statusElement.textContent = message;
      if (type === true) {
         statusElement.className = 'status success';
      } else if (type === false) {
         statusElement.className = 'status error';
      } else {
         statusElement.className = 'status info';
      }
      statusElement.style.display = 'block';

      // 滚动到状态消息
      statusElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
   });
}

function addToHistory(filePath, pageCount) {
   if (!filePath) return;

   // 限制历史记录数量
   if (historyList.children.length >= MAX_HISTORY_ITEMS) {
      // 移除最旧的历史记录
      batchDOMUpdates(() => {
         historyList.removeChild(historyList.lastChild);
      });
   }

   const item = document.createElement('li');
   const date = new Date().toLocaleString();

   // 创建信息部分
   const info = document.createElement('div');
   info.className = 'history-info';

   const time = document.createElement('span');
   time.className = 'time';
   time.textContent = date;

   const pages = document.createElement('span');
   pages.className = 'page-count';
   pages.textContent = `${pageCount}页`;

   // 针对Windows路径做处理
   let displayPath = filePath;
   if (isWindows && filePath.length > 40) {
      const pathParts = filePath.split('\\');
      if (pathParts.length > 2) {
         displayPath = `${pathParts[0]}\\${pathParts[1]}\\...\\${pathParts[pathParts.length - 1]}`;
         info.title = filePath; // 鼠标悬停时显示完整路径
      }
   }

   const pathElement = document.createElement('div');
   pathElement.className = 'path';
   pathElement.textContent = displayPath;
   pathElement.title = filePath; // 鼠标悬停时显示完整路径

   info.appendChild(time);
   info.appendChild(pages);
   info.appendChild(pathElement);

   // 创建操作部分
   const actions = document.createElement('div');
   actions.className = 'history-actions';

   const openButton = document.createElement('button');
   openButton.textContent = '打开';
   openButton.onclick = () => {
      try {
         window.electronAPI.openFile(filePath);
      } catch (error) {
         console.error('打开文件出错:', error);
         showStatus(`打开文件出错: ${error.message || '未知错误'}`, false);
      }
   };

   const folderButton = document.createElement('button');
   folderButton.textContent = '查看文件夹';
   folderButton.onclick = () => {
      try {
         window.electronAPI.openFolder(filePath);
      } catch (error) {
         console.error('打开文件夹出错:', error);
         showStatus(`打开文件夹出错: ${error.message || '未知错误'}`, false);
      }
   };

   actions.appendChild(openButton);
   actions.appendChild(folderButton);

   item.appendChild(info);
   item.appendChild(actions);

   // 使用批处理添加到DOM
   batchDOMUpdates(() => {
      // 添加到历史记录并应用动画
      item.style.opacity = '0';
      item.style.transform = 'translateY(10px)';
      historyList.prepend(item);

      // 触发重排
      void item.offsetWidth;

      // 应用动画
      item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      item.style.opacity = '1';
      item.style.transform = 'translateY(0)';
   });

   // 保存历史记录到localStorage或其他存储
   try {
      // 这里可以添加持久化存储历史记录的代码
   } catch (error) {
      console.error('保存历史记录出错:', error);
   }
}

// 初始化按钮状态
startMonitorButton.disabled = true;
stopMonitorButton.disabled = true;

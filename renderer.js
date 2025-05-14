// DOM Elements
const setPathButton = document.getElementById('set-path-button');
const startMonitorButton = document.getElementById('start-monitor-button');
const stopMonitorButton = document.getElementById('stop-monitor-button');
const savePathDisplay = document.getElementById('save-path-display');
const statusElement = document.getElementById('status');
const historyList = document.getElementById('history-list');
const counterElement = document.getElementById('counter');
const counterNumber = document.querySelector('.counter-number');
const notification = document.getElementById('notification');
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
   openPdf: { key: 'p', command: () => openFileByPath(lastSavedPdf), condition: () => lastSavedPdf }
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
}

// 设置所有事件监听器
function setupEventListeners() {
   // --- Button Event Listeners ---
   setPathButton.addEventListener('click', setSavePath);
   startMonitorButton.addEventListener('click', startMonitoring);
   stopMonitorButton.addEventListener('click', stopMonitoring);

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
      }
   });

   window.electronAPI.onTriggerStopMonitor(() => {
      if (!stopMonitorButton.disabled) {
         stopMonitoring();
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

   batchDOMUpdates(() => {
      document.querySelectorAll('.shortcut').forEach(el => {
         if (el.textContent.includes('⌘+')) {
            el.textContent = el.textContent.replace('⌘+', `${shortcutPrefix}+`);
         }
      });

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

// 修改显示通知函数，不再显示快捷键提示
function showNotification(type, message) {
   if (type === 'shortcut') {
      // 不再显示快捷键提示
      return;
   }

   if (type === 'global') {
      notification.querySelector('span').textContent = message;
      notification.classList.add('show');
      setTimeout(() => {
         notification.classList.remove('show');
      }, 2000);
      return;
   }

   if (notification.classList.contains('show')) {
      notification.classList.remove('show');
      setTimeout(() => {
         notification.querySelector('span').textContent = message || '已添加截图';
         notification.classList.add('show');
      }, 300);
   } else {
      notification.querySelector('span').textContent = message || '已添加截图';
      notification.classList.add('show');
   }

   setTimeout(() => {
      notification.classList.remove('show');
   }, 2000);
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

         // 处理路径显示
         let displayPath = currentSavePath;
         if (isWindows && currentSavePath.length > 50) {
            const pathParts = currentSavePath.split('\\');
            if (pathParts.length > 3) {
               const fileName = pathParts.pop();
               displayPath = `${pathParts[0]}\\...\\${pathParts[pathParts.length - 1]}\\${fileName}`;
            }
         } else if (currentSavePath.length > 50) {
            const pathParts = currentSavePath.split('/');
            if (pathParts.length > 3) {
               const fileName = pathParts.pop();
               displayPath = `${pathParts[0]}/.../${pathParts[pathParts.length - 1]}/${fileName}`;
            }
         }

         batchDOMUpdates(() => {
            savePathDisplay.textContent = displayPath;
            savePathDisplay.title = currentSavePath; // 鼠标悬停时显示完整路径
            startMonitorButton.disabled = false;
         });

         // 自动重置为新PDF状态
         resetCounter();
         showStatus('保存路径已设置，可以开始监听剪贴板。每次创建新PDF都需要重新选择保存位置。', 'info');
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

function openFileByPath(filePath) {
   if (filePath) {
      try {
         window.electronAPI.openFile(filePath);
      } catch (error) {
         console.error('打开PDF出错:', error);
         showStatus(`打开PDF出错: ${error.message || '未知错误'}`, false);
      }
   } else {
      showStatus('没有可打开的PDF文件', false);
   }
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
   // 无论成功与否，都重置保存路径，强制用户重新选择保存位置
   currentSavePath = null;
   batchDOMUpdates(() => {
      savePathDisplay.textContent = "";
      startMonitorButton.disabled = true;
   });

   if (result.success) {
      lastSavedPdf = result.path;

      // 为Windows显示更友好的路径
      let displayPath = result.path;
      if (isWindows) {
         const pathParts = result.path.split('\\');
         if (pathParts.length > 2) {
            displayPath = `${pathParts[0]}\\${pathParts[1]}\\...\\${pathParts[pathParts.length - 1]}`;
         }
      }

      // 显示成功消息
      const message = `成功保存 ${result.pageCount} 页PDF`;
      showStatus(message, true);

      // 添加到历史记录
      addToHistory(result.path, result.pageCount);

      // 提示用户选择新的保存位置
      setTimeout(() => {
         showStatus('PDF已保存，请为新PDF选择保存位置', 'info');
      }, 3500);

      // 滚动到历史记录区域
      setTimeout(() => {
         const historySection = document.querySelector('.history');
         if (historySection) {
            historySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
         }
      }, 300);

   } else {
      lastSavedPdf = null;
      const isError = result.error && result.error.startsWith('保存PDF失败');

      if (isError) {
         showStatus(`错误: ${result.error || '保存PDF时出现未知错误'}`, false);
      } else {
         showStatus(`监听已停止。${result.error || '未保存任何内容，请重新选择保存位置'}`, 'info');
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
         // 成功消息3秒后自动消失
         setTimeout(() => {
            statusElement.style.display = 'none';
         }, 3000);
      } else if (type === false) {
         statusElement.className = 'status error';
         // 只在错误时滚动到状态消息
         statusElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
         statusElement.className = 'status info';
      }
      statusElement.style.display = 'block';
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

   // 格式化日期为更优雅的格式
   const now = new Date();
   const year = now.getFullYear();
   const month = (now.getMonth() + 1).toString().padStart(2, '0');
   const day = now.getDate().toString().padStart(2, '0');
   const hours = now.getHours().toString().padStart(2, '0');
   const minutes = now.getMinutes().toString().padStart(2, '0');
   const dateStr = `${year}-${month}-${day} ${hours}:${minutes}`;

   // 创建信息部分
   const info = document.createElement('div');
   info.className = 'history-info';

   // 提取文件名
   const fileName = filePath.split(/[\/\\]/).pop();

   // 创建badge容器
   const badgeContainer = document.createElement('div');
   badgeContainer.className = 'badge-container';

   // 文件名作为第一个badge
   const fileNameBadge = document.createElement('span');
   fileNameBadge.className = 'badge file-badge';
   fileNameBadge.textContent = fileName;
   fileNameBadge.title = fileName;

   // 页数作为badge样式
   const pagesSpan = document.createElement('span');
   pagesSpan.className = 'badge page-count';
   pagesSpan.textContent = `${pageCount}页`;

   // 日期作为badge样式
   const dateSpan = document.createElement('span');
   dateSpan.className = 'badge date-badge';
   dateSpan.textContent = dateStr;

   // 添加所有badge
   badgeContainer.appendChild(fileNameBadge);
   badgeContainer.appendChild(pagesSpan);
   badgeContainer.appendChild(dateSpan);

   // 创建路径元素 (显示完整路径)
   const pathElement = document.createElement('div');
   pathElement.className = 'path';
   pathElement.textContent = filePath;
   pathElement.title = filePath; // 鼠标悬停时显示完整路径

   // 添加所有信息元素
   info.appendChild(badgeContainer);
   info.appendChild(pathElement);

   // 创建操作部分
   const actions = document.createElement('div');
   actions.className = 'history-actions';

   const openButton = document.createElement('button');
   openButton.className = 'open-button';
   openButton.textContent = '打开PDF';
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
}

// 初始化按钮状态
startMonitorButton.disabled = true;
stopMonitorButton.disabled = true;

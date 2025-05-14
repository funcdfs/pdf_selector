const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

let mainWindow;

// --- State Management ---
let isMonitoringClipboard = false;
let pdfPagesData = []; // Store page data { pngData, width, height }
let firstPageWidth = null;
let savedFilePath = null;
let clipboardCheckIntervalId = null;
let previousClipboardImageBuffer = null; // Store buffer of the last added image
const CLIPBOARD_CHECK_INTERVAL_MS = 1500; // Check every 1.5 seconds
const PDF_PAGE_WIDTH = 842; // A4 width in points at 150 DPI (higher resolution)
const PDF_PAGE_HEIGHT = 1190; // A4 height in points at 150 DPI (optional, for reference)
let initialClipboardCaptureDone = false; // Flag to track initial capture
// ----------------------

function createWindow() {
   // 根据平台选择适当的图标格式
   let iconPath;
   if (process.platform === 'win32') {
      iconPath = path.join(__dirname, 'assets', 'icon.ico');
   } else if (process.platform === 'darwin') {
      iconPath = path.join(__dirname, 'assets', 'icon.icns');
   } else {
      iconPath = path.join(__dirname, 'assets', 'icon.png');
   }

   mainWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      title: 'PDF_selector',
      webPreferences: {
         preload: path.join(__dirname, 'preload.js'),
         contextIsolation: true,
         enableRemoteModule: false,
         nodeIntegration: false
      },
      icon: iconPath
   });
   mainWindow.loadFile('index.html');
   mainWindow.on('closed', () => {
      stopClipboardMonitoring(); // Ensure monitoring stops if window closes
   });

   // 设置文档标题
   mainWindow.setTitle('PDF_selector');

   // 注册全局快捷键
   registerGlobalShortcuts();
}

// 注册全局快捷键
function registerGlobalShortcuts() {
   // 根据不同平台注册适当的快捷键
   const isMac = process.platform === 'darwin';
   const modifier = isMac ? 'Command+Option' : 'Ctrl+Alt';

   // 开始监听快捷键
   globalShortcut.register(`${modifier}+S`, () => {
      if (!isMonitoringClipboard && mainWindow && !startMonitorButtonDisabled()) {
         mainWindow.webContents.send('trigger-start-monitor');
      }
   });

   // 停止监听快捷键
   globalShortcut.register(`${modifier}+E`, () => {
      if (isMonitoringClipboard && mainWindow) {
         mainWindow.webContents.send('trigger-stop-monitor');
      }
   });

   // 功能：即使应用不在焦点也可以通过快捷键控制
   console.log(`[主进程] 全局快捷键已注册: ${modifier}+S/E`);
}

// 检查开始按钮状态
function startMonitorButtonDisabled() {
   return savedFilePath === null;
}

// --- Clipboard Monitoring Logic --- 

// Called by Renderer to set the save location
ipcMain.handle('set-save-path', async () => {
   if (isMonitoringClipboard) {
      return { success: false, error: '监听过程中无法更改保存位置。' };
   }

   // 根据平台使用合适的默认路径
   const documentsPath = app.getPath('documents');
   const defaultFileName = `PDF_selector-${Date.now()}.pdf`;
   const defaultSavePath = path.join(documentsPath, defaultFileName);

   const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: '设置PDF保存位置',
      defaultPath: savedFilePath || defaultSavePath,
      filters: [{ name: 'PDF文件', extensions: ['pdf'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
   });

   if (canceled || !filePath) {
      return { success: false, path: null, error: '已取消保存路径选择。' };
   }

   savedFilePath = filePath;
   console.log('[主进程] PDF保存路径设置为:', savedFilePath);
   return { success: true, path: savedFilePath };
});

// Called by Renderer to start monitoring
ipcMain.handle('start-clipboard-monitor', () => {
   if (isMonitoringClipboard) {
      console.log('[主进程] 剪贴板监听已经激活。');
      return false;
   }
   if (!savedFilePath) {
      console.log('[主进程] 未设置保存路径，无法开始监听。');
      mainWindow.webContents.send('monitor-error', '请先设置保存文件路径。');
      return false;
   }

   console.log('[主进程] 开始剪贴板监听。');
   isMonitoringClipboard = true;
   pdfPagesData = []; // Reset pages on start
   firstPageWidth = null;
   initialClipboardCaptureDone = false;

   // Capture initial clipboard content but don't add to PDF
   try {
      const initialImage = clipboard.readImage();
      if (!initialImage.isEmpty()) {
         previousClipboardImageBuffer = initialImage.toPNG();
         console.log('[主进程] 保存初始剪贴板状态作为参考。');
         initialClipboardCaptureDone = true;
      } else {
         previousClipboardImageBuffer = null;
      }
   } catch (error) {
      console.error('[主进程] 读取初始剪贴板状态错误:', error);
      previousClipboardImageBuffer = null;
   }

   mainWindow.webContents.send('monitor-state-changed', true); // Notify UI

   // Start the interval timer
   clipboardCheckIntervalId = setInterval(checkClipboardForNewImage, CLIPBOARD_CHECK_INTERVAL_MS);

   return true;
});

// Called by Renderer to stop monitoring and save
ipcMain.handle('stop-clipboard-monitor', async () => {
   return stopClipboardMonitoring();
});

// Open file in default application
ipcMain.handle('open-file', async (event, filePath) => {
   try {
      // 确保文件存在
      if (!fs.existsSync(filePath)) {
         console.error('[主进程] 文件不存在:', filePath);
         return false;
      }

      await shell.openPath(filePath);
      return true;
   } catch (error) {
      console.error('[主进程] 打开文件错误:', error);
      return false;
   }
});

// Open folder containing the file
ipcMain.handle('open-folder', async (event, filePath) => {
   try {
      // 处理不同平台的路径分隔符
      if (!fs.existsSync(filePath)) {
         console.error('[主进程] 文件不存在，无法打开文件夹:', filePath);
         return false;
      }

      await shell.showItemInFolder(filePath);
      return true;
   } catch (error) {
      console.error('[主进程] 打开文件夹错误:', error);
      return false;
   }
});

// Central function to stop monitoring and save PDF
async function stopClipboardMonitoring() {
   if (!isMonitoringClipboard) {
      return false; // Nothing to stop
   }
   console.log('[主进程] 停止剪贴板监听。');
   isMonitoringClipboard = false;
   if (clipboardCheckIntervalId) {
      clearInterval(clipboardCheckIntervalId);
      clipboardCheckIntervalId = null;
   }
   mainWindow.webContents.send('monitor-state-changed', false); // Notify UI

   // --- Save the PDF --- 
   let saveSuccess = false;
   let finalError = null;
   let finalPageCount = pdfPagesData.length;

   if (pdfPagesData.length > 0 && savedFilePath) {
      console.log(`[主进程] 正在保存 ${pdfPagesData.length} 页到 ${savedFilePath}...`);
      try {
         const finalPdfDoc = await PDFDocument.create();

         for (const pageData of pdfPagesData) {
            const pngImage = await finalPdfDoc.embedPng(pageData.pngData);

            // Calculate scaling to fit width while maintaining aspect ratio
            // Using higher resolution page size
            const scaleFactor = PDF_PAGE_WIDTH / pageData.width;
            const scaledWidth = PDF_PAGE_WIDTH;
            const scaledHeight = pageData.height * scaleFactor;

            // Create page with high-resolution dimensions
            const page = finalPdfDoc.addPage([scaledWidth, scaledHeight]);

            // Draw image to fill the page width at high quality
            page.drawImage(pngImage, {
               x: 0,
               y: 0,
               width: scaledWidth,
               height: scaledHeight,
               opacity: 1.0
            });

            console.log(`[主进程] 添加高分辨率页面 - 原尺寸: ${pageData.width}x${pageData.height}, 缩放尺寸: ${scaledWidth}x${scaledHeight}`);
         }

         // 确保目录存在
         const saveDir = path.dirname(savedFilePath);
         if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true });
         }

         // Save with higher quality settings
         const pdfBytes = await finalPdfDoc.save({
            useObjectStreams: false, // Better compatibility and potentially higher quality
            addDefaultPage: false,
            preserveXFA: true
         });
         fs.writeFileSync(savedFilePath, pdfBytes);
         console.log('[主进程] 高分辨率PDF保存成功。');
         saveSuccess = true;
      } catch (error) {
         console.error('[主进程] 保存PDF错误:', error.message, error.stack);
         finalError = `保存PDF失败: ${error.message}`;
      }
   } else if (pdfPagesData.length === 0) {
      finalError = '剪贴板监听已停止。未捕获任何图片。';
   } else {
      finalError = '剪贴板监听已停止。保存失败（未指定路径）。';
   }

   // Send final result to UI
   mainWindow.webContents.send('monitor-complete', {
      success: saveSuccess,
      path: saveSuccess ? savedFilePath : null,
      pageCount: finalPageCount,
      error: finalError
   });

   // Reset state completely AFTER saving/reporting
   pdfPagesData = [];
   firstPageWidth = null;
   // Keep savedFilePath unless user explicitly changes it
   // savedFilePath = null; 
   previousClipboardImageBuffer = null;
   return true;
}

// Function called by the interval timer
function checkClipboardForNewImage() {
   if (!isMonitoringClipboard) return; // Stop checking if monitoring was stopped

   try {
      const currentImage = clipboard.readImage(); // Read image directly

      if (currentImage.isEmpty()) {
         // console.log('[剪贴板检查] 剪贴板无图片数据或图片为空。');
         return;
      }

      // Convert to PNG buffer for comparison and storage
      const currentImageBuffer = currentImage.toPNG();

      // Compare with the previous image buffer
      if (!previousClipboardImageBuffer || !currentImageBuffer.equals(previousClipboardImageBuffer)) {
         console.log('[主进程] 剪贴板检测到新图片。');

         const imageSize = currentImage.getSize();
         if (imageSize.width <= 0 || imageSize.height <= 0) {
            console.warn('[主进程] 剪贴板图片尺寸无效:', imageSize);
            return;
         }

         // Only add to PDF if it's not the first capture or initial capture is already done
         if (initialClipboardCaptureDone) {
            // Store page data
            pdfPagesData.push({ pngData: currentImageBuffer, width: imageSize.width, height: imageSize.height });

            const pageCount = pdfPagesData.length;
            console.log(`[主进程] 已储存第 ${pageCount} 页数据。尺寸: ${imageSize.width}x${imageSize.height}`);

            // Notify renderer of the update
            mainWindow.webContents.send('clipboard-image-added', {
               pageNumber: pageCount,
               filePath: savedFilePath // Send the eventual path
            });
         } else {
            console.log('[主进程] 初始剪贴板图片已记录，但不添加到PDF。');
            initialClipboardCaptureDone = true;
         }

         // Update the previous image buffer
         previousClipboardImageBuffer = currentImageBuffer;
      } else {
         // console.log('[剪贴板检查] 剪贴板图片与前一张相同。');
      }
   } catch (error) {
      console.error('[主进程] 检查剪贴板错误:', error.message, error.stack);
      mainWindow.webContents.send('monitor-error', `检查剪贴板错误: ${error.message}`);
      // Optionally stop monitoring on error?
      // stopClipboardMonitoring();
   }
}

// --- App Lifecycle ---
// 设置应用程序图标（针对开发模式下的托盘和任务栏）
if (process.platform === 'linux') {
   app.setIcon(path.join(__dirname, 'assets', 'icon.png'));
} else if (process.platform === 'darwin') {
   // 设置 macOS Dock 图标
   app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
   // 确保应用名称正确 (macOS)
   app.setName('PDF_selector');
}

app.whenReady().then(() => {
   createWindow();

   // 处理macOS系统点击dock图标重新激活应用的特性
   app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
   });
});

// 处理不同平台的窗口关闭行为
app.on('window-all-closed', () => {
   // macOS上关闭窗口不退出应用，其他平台则退出
   if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
   stopClipboardMonitoring(); // Ensure monitoring stops and attempts save
   globalShortcut.unregisterAll(); // 清除所有全局快捷键
});

// 接收渲染进程的触发事件
ipcMain.on('trigger-start-monitor-from-ui', () => {
   if (!isMonitoringClipboard && savedFilePath) {
      startClipboardMonitor();
   }
});

ipcMain.on('trigger-stop-monitor-from-ui', () => {
   if (isMonitoringClipboard) {
      stopClipboardMonitoring();
   }
}); 
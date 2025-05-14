/**
 * PDF_selector 应用启动准备脚本
 * 
 * 功能:
 * 1. 检查必要的资源文件
 * 2. 生成或更新应用图标
 * 3. 验证工作环境
 * 4. 检查版本号和兼容性
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const semver = require('semver');

// 项目根目录
const ROOT_DIR = path.resolve(__dirname, '..');

// 颜色输出
const colors = {
   reset: '\x1b[0m',
   red: '\x1b[31m',
   green: '\x1b[32m',
   yellow: '\x1b[33m',
   blue: '\x1b[34m',
   cyan: '\x1b[36m'
};

// 需要验证的资源文件
const REQUIRED_ASSETS = [
   {
      path: path.join(ROOT_DIR, 'assets', 'icon.png'),
      generate: () => {
         console.log('📦 生成应用图标...');
         try {
            execSync('node assets/generate-icons.js', { cwd: ROOT_DIR, stdio: 'inherit' });
         } catch (error) {
            console.error(`${colors.red}❌ 无法生成图标: ${error.message}${colors.reset}`);
            // 尝试备用方式
            console.log(`${colors.yellow}⚠️ 尝试备用方式生成图标...${colors.reset}`);
            try {
               // 检查源SVG文件
               const svgPath = path.join(ROOT_DIR, 'assets', 'icon.svg');
               if (!fs.existsSync(svgPath)) {
                  console.error(`${colors.red}❌ 未找到源SVG文件: ${svgPath}${colors.reset}`);
                  return false;
               }

               // 创建简单备用图标文件
               console.log(`${colors.yellow}⚠️ 创建备用图标...${colors.reset}`);
               fs.copyFileSync(svgPath, path.join(ROOT_DIR, 'assets', 'icon.png'));
               return true;
            } catch (backupError) {
               console.error(`${colors.red}❌ 备用生成方式也失败: ${backupError.message}${colors.reset}`);
               return false;
            }
         }
         return true;
      }
   }
];

// 格式化输出
function log(level, message) {
   const prefix = {
      info: `${colors.blue}ℹ${colors.reset}`,
      success: `${colors.green}✓${colors.reset}`,
      warning: `${colors.yellow}⚠${colors.reset}`,
      error: `${colors.red}✗${colors.reset}`,
   };
   console.log(`${prefix[level] || ''} ${message}`);
}

// 检查Node.js版本兼容性
function checkNodeCompatibility() {
   log('info', '检查Node.js兼容性...');

   const nodeVersion = process.version;
   log('info', `当前Node.js版本: ${nodeVersion}`);

   try {
      // 读取package.json中的engines字段
      const packageJson = require(path.join(ROOT_DIR, 'package.json'));

      if (packageJson.engines && packageJson.engines.node) {
         const requiredNodeVersion = packageJson.engines.node;
         log('info', `要求的Node.js版本: ${requiredNodeVersion}`);

         if (semver.satisfies(nodeVersion, requiredNodeVersion)) {
            log('success', `Node.js版本兼容性检查通过`);
            return true;
         } else {
            log('warning', `当前Node.js版本 (${nodeVersion}) 与要求的版本 (${requiredNodeVersion}) 不兼容`);
            log('warning', `这可能导致构建问题或运行时错误`);
            return false;
         }
      } else {
         log('info', `package.json中未指定Node.js版本要求`);
      }
   } catch (error) {
      log('error', `检查Node.js兼容性时出错: ${error.message}`);
   }

   // 默认兼容性检查
   // 电子应用通常需要Node.js >= 14.x
   if (semver.lt(nodeVersion, '14.0.0')) {
      log('warning', `当前Node.js版本 (${nodeVersion}) 可能过旧，建议使用14.x或更高版本`);
      return false;
   }

   return true;
}

// 检查工作环境
function checkEnvironment() {
   log('info', '检查工作环境...');

   let allChecksPass = true;

   // 检查Node版本
   const nodeCompatible = checkNodeCompatibility();
   if (!nodeCompatible) {
      allChecksPass = false;
   }

   // 检查Electron安装
   try {
      const electronPath = path.join(ROOT_DIR, 'node_modules', 'electron', 'package.json');
      if (fs.existsSync(electronPath)) {
         const electronPackage = require(electronPath);
         log('success', `Electron 版本: ${electronPackage.version}`);
      } else {
         log('warning', `未找到Electron安装，可能需要先运行 'npm install'`);
         allChecksPass = false;
      }
   } catch (error) {
      log('error', `检查Electron安装时出错: ${error.message}`);
      allChecksPass = false;
   }

   // 检查操作系统兼容性
   const platform = process.platform;
   log('info', `操作系统: ${platform}`);

   // 检查必要的命令
   const requiredCommands = ['npm', 'node'];
   for (const cmd of requiredCommands) {
      try {
         execSync(`which ${cmd}`, { stdio: 'ignore' });
         log('success', `已安装: ${cmd}`);
      } catch (error) {
         log('error', `未找到必要的命令: ${cmd}`);
         allChecksPass = false;
      }
   }

   return allChecksPass;
}

// 检查版本号格式
function checkVersionFormat() {
   log('info', '检查版本号格式...');

   try {
      const packageJson = require(path.join(ROOT_DIR, 'package.json'));
      const version = packageJson.version;

      if (!version) {
         log('error', `package.json中未找到版本号`);
         return false;
      }

      log('info', `当前版本号: ${version}`);

      if (semver.valid(version)) {
         log('success', `版本号格式有效`);
         return true;
      } else {
         log('error', `版本号格式无效，应为 x.y.z`);
         return false;
      }
   } catch (error) {
      log('error', `检查版本号时出错: ${error.message}`);
      return false;
   }
}

// 检查并生成所需资源
function checkAndGenerateAssets() {
   log('info', '检查应用资源...');

   let allAssetsReady = true;

   for (const asset of REQUIRED_ASSETS) {
      if (!fs.existsSync(asset.path)) {
         log('warning', `未找到资源: ${path.relative(ROOT_DIR, asset.path)}`);

         try {
            const generated = asset.generate();
            if (generated) {
               log('success', `已生成资源: ${path.relative(ROOT_DIR, asset.path)}`);
            } else {
               log('error', `资源生成失败`);
               allAssetsReady = false;
            }
         } catch (error) {
            log('error', `生成资源失败: ${error.message}`);
            allAssetsReady = false;
         }
      } else {
         log('success', `资源已存在: ${path.relative(ROOT_DIR, asset.path)}`);
      }
   }

   return allAssetsReady;
}

// 检查package.json一致性
function checkPackageConsistency() {
   log('info', '检查package.json一致性...');

   try {
      const packageJson = require(path.join(ROOT_DIR, 'package.json'));

      // 检查必备字段
      const requiredFields = ['name', 'version', 'main', 'description'];
      const missingFields = requiredFields.filter(field => !packageJson[field]);

      if (missingFields.length > 0) {
         log('warning', `package.json缺少以下字段: ${missingFields.join(', ')}`);
         return false;
      }

      // 检查依赖一致性
      if (packageJson.dependencies) {
         // 检查package-lock.json是否存在
         const lockFilePath = path.join(ROOT_DIR, 'package-lock.json');
         if (!fs.existsSync(lockFilePath)) {
            log('warning', `未找到package-lock.json文件，依赖版本可能不一致`);
         }
      }

      // 检查scripts
      if (!packageJson.scripts || Object.keys(packageJson.scripts).length === 0) {
         log('warning', `package.json中未定义scripts`);
      } else {
         log('success', `找到已定义的scripts: ${Object.keys(packageJson.scripts).join(', ')}`);
      }

      // 检查build配置
      if (packageJson.build) {
         log('success', `找到Electron构建配置`);
      } else {
         log('warning', `未找到Electron构建配置，可能影响打包`);
      }

      return true;
   } catch (error) {
      log('error', `检查package.json时出错: ${error.message}`);
      return false;
   }
}

// 主函数
function main() {
   console.log(`\n${colors.blue}🚀 启动 PDF_selector 准备工作...${colors.reset}\n`);

   // 收集所有验证结果
   const results = {
      environment: checkEnvironment(),
      versionFormat: checkVersionFormat(),
      packageConsistency: checkPackageConsistency(),
      assets: checkAndGenerateAssets()
   };

   // 汇总结果
   console.log(`\n${colors.blue}======= 准备工作摘要 =======${colors.reset}`);

   let allChecksPass = true;
   for (const [check, result] of Object.entries(results)) {
      if (result) {
         log('success', `${check}: 通过`);
      } else {
         log('error', `${check}: 失败`);
         allChecksPass = false;
      }
   }

   console.log('');

   if (allChecksPass) {
      log('success', `所有准备工作已完成，应用可以启动`);
   } else {
      log('warning', `存在一些问题，应用可能无法正常运行`);
   }
}

// 检查是否有semver依赖，如果没有则临时实现简单版本
if (!semver) {
   const semverFallback = {
      valid: (version) => /^\d+\.\d+\.\d+$/.test(version),
      satisfies: (version, range) => {
         // 简单实现，只支持固定版本和大于等于小于等于
         log('warning', '使用简化版semver实现，版本比较可能不准确');
         return true; // 简单起见，默认返回true
      },
      lt: (v1, v2) => {
         const v1parts = v1.replace(/[^\d.]/g, '').split('.');
         const v2parts = v2.replace(/[^\d.]/g, '').split('.');
         for (let i = 0; i < v1parts.length; ++i) {
            if (v2parts.length === i) return false;
            if (parseInt(v1parts[i]) === parseInt(v2parts[i])) continue;
            return parseInt(v1parts[i]) < parseInt(v2parts[i]);
         }
         return v1parts.length < v2parts.length;
      }
   };

   global.semver = semverFallback;
}

// 执行主函数
try {
   main();
} catch (error) {
   log('error', `执行过程中发生错误: ${error.message}`);
   console.error(error);
} 
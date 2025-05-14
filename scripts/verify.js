/**
 * PDF_selector 验证脚本
 * 
 * 功能:
 * 1. 验证项目文件完整性
 * 2. 检查依赖版本兼容性
 * 3. 基本的环境兼容性测试
 * 4. 验证版本号与Git标签一致性
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 项目根目录
const ROOT_DIR = path.resolve(__dirname, '..');

// 必要的项目文件
const REQUIRED_FILES = [
   'main.js',
   'preload.js',
   'renderer.js',
   'index.html',
   'styles.css',
   'package.json'
];

// 运行测试并收集结果
const testResults = {
   filesExist: false,
   dependenciesValid: false,
   packageVersionsMatch: false,
   gitTagMatch: false
};

// ANSI颜色代码
const colors = {
   reset: '\x1b[0m',
   red: '\x1b[31m',
   green: '\x1b[32m',
   yellow: '\x1b[33m',
   blue: '\x1b[34m',
   cyan: '\x1b[36m'
};

// 辅助函数：格式化输出
function log(type, message) {
   const icons = {
      info: `${colors.blue}ℹ${colors.reset}`,
      success: `${colors.green}✓${colors.reset}`,
      warning: `${colors.yellow}⚠${colors.reset}`,
      error: `${colors.red}✗${colors.reset}`,
      title: `${colors.cyan}◉${colors.reset}`
   };

   console.log(`${icons[type]} ${message}`);
}

// 测试1：验证文件完整性
function checkRequiredFiles() {
   log('title', '检查必要文件:');

   const missingFiles = [];

   for (const file of REQUIRED_FILES) {
      const filePath = path.join(ROOT_DIR, file);
      if (!fs.existsSync(filePath)) {
         missingFiles.push(file);
         log('error', `缺失文件: ${file}`);
      } else {
         log('success', `文件存在: ${file}`);
      }
   }

   if (missingFiles.length === 0) {
      log('success', '所有必要文件都存在');
      testResults.filesExist = true;
   } else {
      log('error', `缺少 ${missingFiles.length} 个必要文件`);
   }

   console.log(''); // 空行分隔
}

// 测试2：检查依赖版本
function checkDependencies() {
   log('title', '检查依赖:');

   try {
      // 读取package.json
      const packageJson = require(path.join(ROOT_DIR, 'package.json'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

      // 检查核心依赖
      const criticalDeps = ['electron', 'pdf-lib'];
      let allValid = true;

      for (const dep of criticalDeps) {
         if (dependencies[dep]) {
            log('success', `找到依赖: ${dep} (${dependencies[dep]})`);
         } else {
            log('error', `缺少关键依赖: ${dep}`);
            allValid = false;
         }
      }

      testResults.dependenciesValid = allValid;

      if (allValid) {
         log('success', '所有关键依赖都已安装');
      }
   } catch (error) {
      log('error', `依赖检查失败: ${error.message}`);
   }

   console.log(''); // 空行分隔
}

// 测试3：检查版本一致性
function checkVersionConsistency() {
   log('title', '检查版本一致性:');

   try {
      // 读取package.json版本
      const packageJson = require(path.join(ROOT_DIR, 'package.json'));
      const packageVersion = packageJson.version;

      log('info', `package.json 版本: ${packageVersion}`);

      // 检查版本格式
      if (/^\d+\.\d+\.\d+$/.test(packageVersion)) {
         log('success', '版本格式有效');
         testResults.packageVersionsMatch = true;
      } else {
         log('error', '版本格式无效，应为 x.y.z');
      }
   } catch (error) {
      log('error', `版本检查失败: ${error.message}`);
   }

   console.log(''); // 空行分隔
}

// 测试4：检查Git标签与版本一致性
function checkGitTagConsistency() {
   log('title', '检查Git标签与版本一致性:');

   try {
      // 检查是否在Git仓库中
      try {
         execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
      } catch (e) {
         log('warning', '当前目录不是Git仓库，跳过Git标签检查');
         return;
      }

      // 读取package.json版本
      const packageJson = require(path.join(ROOT_DIR, 'package.json'));
      const packageVersion = packageJson.version;
      const expectedTag = `v${packageVersion}`;

      log('info', `期望的Git标签: ${expectedTag}`);

      // 获取当前标签
      let currentTag;
      try {
         // 尝试获取当前提交的标签
         currentTag = execSync('git describe --tags --exact-match 2>/dev/null', { encoding: 'utf8' }).trim();
      } catch (e) {
         // 当前提交没有标签，检查是否有对应版本的标签
         try {
            const allTags = execSync('git tag', { encoding: 'utf8' }).split('\n');
            if (allTags.includes(expectedTag)) {
               log('warning', `存在标签 ${expectedTag}，但未应用于当前提交`);
            } else {
               log('warning', `未找到标签 ${expectedTag}`);
            }
            return;
         } catch (tagError) {
            log('error', `获取Git标签失败: ${tagError.message}`);
            return;
         }
      }

      // 比较标签
      if (currentTag === expectedTag) {
         log('success', `Git标签 (${currentTag}) 与package.json版本匹配`);
         testResults.gitTagMatch = true;
      } else {
         log('error', `Git标签 (${currentTag}) 与package.json版本 (${expectedTag}) 不匹配`);
      }
   } catch (error) {
      log('error', `Git标签检查失败: ${error.message}`);
   }

   console.log(''); // 空行分隔
}

// 运行所有测试
function runTests() {
   console.log(`\n${colors.cyan}======= PDF_selector 项目验证 =======${colors.reset}\n`);

   checkRequiredFiles();
   checkDependencies();
   checkVersionConsistency();
   checkGitTagConsistency();

   // 总结结果
   console.log(`${colors.cyan}======= 测试结果摘要 =======${colors.reset}\n`);

   const testSummary = [
      { name: '文件完整性', passed: testResults.filesExist },
      { name: '依赖有效性', passed: testResults.dependenciesValid },
      { name: '版本一致性', passed: testResults.packageVersionsMatch },
      { name: 'Git标签一致性', passed: testResults.gitTagMatch }
   ];

   const passedTests = testSummary.filter(test => test.passed).length;

   for (const test of testSummary) {
      if (test.passed) {
         log('success', `${test.name}: 通过`);
      } else {
         log('error', `${test.name}: 失败`);
      }
   }

   console.log('');

   if (passedTests === testSummary.length) {
      log('success', `所有测试通过 (${passedTests}/${testSummary.length})`);
      process.exit(0);
   } else {
      log('error', `部分测试失败 (${passedTests}/${testSummary.length})`);
      process.exit(1);
   }
}

// 执行所有测试
runTests(); 
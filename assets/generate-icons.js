#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 直接导入依赖包，不再尝试动态安装
const sharp = require('sharp');
const svg2png = require('svg2png');
const pngToIco = require('png-to-ico');

console.log('🖼️ 正在从 icon.svg 生成所有图标格式...');

// 定义路径
const assetsDir = __dirname;
const svgPath = path.join(assetsDir, 'icon.svg');
const pngPath = path.join(assetsDir, 'icon.png');
const icoPath = path.join(assetsDir, 'icon.ico');
const icnsPath = path.join(assetsDir, 'icon.icns');

// 检查源SVG是否存在
if (!fs.existsSync(svgPath)) {
   console.error('错误: icon.svg 文件未找到！');
   process.exit(1);
}

// 创建尺寸数组，用于生成多种尺寸的PNG
const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];

// 开始生成流程
async function generateAll() {
   try {
      // 1. 从SVG生成不同尺寸的PNG
      console.log('⚙️ 步骤1: 生成多种尺寸的PNG...');
      const pngPromises = sizes.map(size => generatePng(svgPath, size));
      await Promise.all(pngPromises);

      // 2. 生成高质量主PNG图标(1024x1024)用于主图标
      console.log('⚙️ 步骤2: 生成主PNG图标...');
      await generateMainPng(svgPath, pngPath);

      // 3. 生成ICO文件(Windows)
      console.log('⚙️ 步骤3: 生成Windows ICO图标...');
      await generateIco();

      // 4. 生成ICNS文件(macOS)
      console.log('⚙️ 步骤4: 生成macOS ICNS图标...');
      await generateIcns();

      console.log('✅ 所有图标格式生成完成!');
   } catch (error) {
      console.error('❌ 生成图标时出错:', error);
      process.exit(1);
   }
}

// 生成指定尺寸的PNG
async function generatePng(svgPath, size) {
   const outputPath = path.join(assetsDir, `icon-${size}.png`);
   console.log(`   生成 ${size}x${size} PNG...`);

   try {
      // 从SVG读取并转换为对应尺寸的PNG
      const svgBuffer = fs.readFileSync(svgPath);
      const pngBuffer = await svg2png(svgBuffer, { width: size, height: size });
      fs.writeFileSync(outputPath, pngBuffer);
      return outputPath;
   } catch (error) {
      console.error(`   生成 ${size}x${size} PNG失败:`, error.message);
      throw error;
   }
}

// 生成主PNG图标
async function generateMainPng(svgPath, outputPath) {
   try {
      // 生成一个高质量的1024x1024 PNG
      const svgBuffer = fs.readFileSync(svgPath);
      const pngBuffer = await svg2png(svgBuffer, { width: 1024, height: 1024 });
      fs.writeFileSync(outputPath, pngBuffer);
      console.log(`   已生成主PNG图标: ${outputPath}`);
      return outputPath;
   } catch (error) {
      console.error('   生成主PNG图标失败:', error.message);
      throw error;
   }
}

// 生成ICO图标(Windows)
async function generateIco() {
   try {
      // 准备不同尺寸的PNG用于ICO文件
      const icoPngs = [16, 32, 48, 64, 128, 256].map(size =>
         path.join(assetsDir, `icon-${size}.png`)
      );

      // 确保所有文件都存在
      const existingPngs = icoPngs.filter(file => fs.existsSync(file));

      if (existingPngs.length === 0) {
         throw new Error('没有找到生成ICO所需的PNG文件');
      }

      // 生成包含多种尺寸的ICO文件
      const icoBuffer = await pngToIco(existingPngs);
      fs.writeFileSync(icoPath, icoBuffer);
      console.log(`   已生成ICO图标: ${icoPath}`);
   } catch (error) {
      console.error('   生成ICO图标失败:', error.message);
      // 使用备用方法尝试
      await generateIcoFallback();
   }
}

// ICO生成的备用方法
async function generateIcoFallback() {
   try {
      console.log('   尝试使用备用方法生成ICO...');
      // 使用sharp直接将PNG转换为ICO
      await sharp(path.join(assetsDir, 'icon-256.png'))
         .toFile(icoPath);
      console.log(`   已使用备用方法生成ICO图标: ${icoPath}`);
   } catch (error) {
      console.error('   备用方法生成ICO图标失败:', error.message);
      // 如果电脑上安装了ImageMagick，尝试使用它
      try {
         execSync(`convert ${path.join(assetsDir, 'icon-*.png')} ${icoPath}`);
         console.log(`   已使用ImageMagick生成ICO图标: ${icoPath}`);
      } catch (e) {
         console.error('   所有ICO生成方法均失败。请手动创建ICO文件。');
      }
   }
}

// 生成ICNS图标(macOS)
async function generateIcns() {
   // macOS专用，在其他平台上跳过
   if (process.platform !== 'darwin') {
      console.log('   跳过ICNS生成 (仅在macOS上支持)');
      return;
   }

   try {
      // 创建临时iconset目录
      const iconsetDir = path.join(assetsDir, 'icon.iconset');
      if (fs.existsSync(iconsetDir)) {
         fs.rmSync(iconsetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(iconsetDir);

      // 为iconset准备文件
      const iconsetSizes = [16, 32, 64, 128, 256, 512, 1024];
      for (const size of iconsetSizes) {
         const sourcePath = path.join(assetsDir, `icon-${size}.png`);
         if (!fs.existsSync(sourcePath)) {
            console.warn(`   警告: ${sourcePath} 不存在，跳过此尺寸`);
            continue;
         }

         // 基本尺寸
         fs.copyFileSync(
            sourcePath,
            path.join(iconsetDir, `icon_${size}x${size}.png`)
         );

         // @2x 尺寸 (如果有合适的更大尺寸)
         if (size <= 512 && iconsetSizes.includes(size * 2)) {
            fs.copyFileSync(
               path.join(assetsDir, `icon-${size * 2}.png`),
               path.join(iconsetDir, `icon_${size}x${size}@2x.png`)
            );
         }
      }

      // 使用iconutil转换iconset为icns
      execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`);

      // 清理临时文件
      fs.rmSync(iconsetDir, { recursive: true, force: true });

      console.log(`   已生成ICNS图标: ${icnsPath}`);
   } catch (error) {
      console.error('   生成ICNS图标失败:', error.message);
      console.log('   注意: ICNS生成需要macOS。在其他平台上，请在macOS上构建或手动提供icon.icns文件。');
   }
}

// 运行主函数
generateAll().catch(err => {
   console.error('图标生成过程失败:', err);
   process.exit(1);
}); 
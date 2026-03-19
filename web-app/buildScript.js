import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { fileURLToPath } from 'url';
// 获取当前平台
const platform = process.platform;

// 获取当前时间
const buildTime = new Date().toLocaleString();

// 读取生成的 index.html 文件
const indexPath = fileURLToPath(new URL('./dist/index.html', import.meta.url));
let htmlContent = fs.readFileSync(indexPath, 'utf-8');
// 使用正则表达式替换绝对路径为相对路径
htmlContent = htmlContent.replace(/\/assets\//g, 'assets/');
// 将修改后的内容写回文件
fs.writeFileSync(indexPath, htmlContent, 'utf-8');
// 替换注释中的内容
// if (platform !== 'win32') {
//   return false; // 或者 return htmlContent; 根据需求
// }
const updatedContent = htmlContent.replace('Build Time', `Build Time:${buildTime}`);
// 读取 package.json 并获取 description 字段
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 使用 path.join 的方式
const packageJsonPath = path.join(__dirname, 'package.json');
fs.readFile(packageJsonPath, 'utf8', (err, data) => {
  if (err) {
    throw new Error(`无法读取 package.json: ${err.message}`);
  }
  
  const packageJson = JSON.parse(data);
  const packageName = packageJson.description;

  if (!packageName) {
    throw new Error('package.json 中没有找到 description 字段');
  }

  // 创建一个可写流（在这个例子中是文件）
  const output = fs.createWriteStream(path.join(__dirname, `${packageName}.zip`));
  const archive = archiver('zip', {
    zlib: { level: 9 }, // 设置压缩级别
  });

  // 监听任何错误
  archive.on('error', (error) => {
    throw error;
  });

  // 将数据管道到输出流
  archive.pipe(output);

  // 添加整个 dist 目录到存档
  archive.directory('dist/', 'dist');

  // 添加 adcui.json 文件到根目录
  archive.file('adcui.json', { name: 'adcui.json' });

  // 添加 package.json 文件到根目录
  archive.file('package.json', { name: 'package.json' });

  // 完成归档过程
  archive.finalize();
});
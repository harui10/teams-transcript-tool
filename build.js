/**
 * ブックマークレット変換スクリプト
 *
 * Usage: node build.js
 *
 * 各JSファイルをブックマークレット形式に変換して出力します。
 */

const fs = require('fs');
const path = require('path');

const files = ['diagnose.js', 'transcript-copy.js'];

function minify(code) {
    // コメント除去
    code = code.replace(/\/\*[\s\S]*?\*\//g, '');
    code = code.replace(/\/\/.*$/gm, '');

    // 改行とインデントを削除
    code = code.replace(/\s+/g, ' ');

    // 不要なスペースを削除
    code = code.replace(/\s*([{};,:])\s*/g, '$1');
    code = code.replace(/\s*([()])\s*/g, '$1');

    return code.trim();
}

function toBookmarklet(code) {
    const minified = minify(code);
    return 'javascript:' + encodeURIComponent(minified);
}

console.log('='.repeat(60));
console.log('ブックマークレット変換結果');
console.log('='.repeat(60));

files.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        const code = fs.readFileSync(filePath, 'utf8');
        const bookmarklet = toBookmarklet(code);

        console.log(`\n【${file}】`);
        console.log(`文字数: ${bookmarklet.length}`);
        console.log('-'.repeat(40));
        console.log(bookmarklet);
        console.log('-'.repeat(40));

        // ファイルにも出力
        const outPath = path.join(__dirname, file.replace('.js', '.bookmarklet.txt'));
        fs.writeFileSync(outPath, bookmarklet);
        console.log(`保存先: ${outPath}`);
    } else {
        console.log(`ファイルが見つかりません: ${file}`);
    }
});

console.log('\n' + '='.repeat(60));
console.log('変換完了');
console.log('='.repeat(60));

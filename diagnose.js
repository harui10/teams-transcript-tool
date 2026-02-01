/**
 * Teams トランスクリプト DOM構造診断スクリプト
 *
 * このスクリプトを実行すると、ページ上のトランスクリプト関連要素を調査し、
 * セレクタ情報をコンソールに出力します。
 */
(function() {
    'use strict';

    const results = {
        url: location.href,
        timestamp: new Date().toISOString(),
        findings: []
    };

    function log(category, message, data) {
        const entry = { category, message, data };
        results.findings.push(entry);
        console.log(`[診断] ${category}: ${message}`, data || '');
    }

    // 1. role属性を持つ要素を調査
    log('調査開始', 'role属性を持つ要素を検索中...');

    const roleList = document.querySelectorAll('[role="list"]');
    const roleListitem = document.querySelectorAll('[role="listitem"]');

    log('role属性', `role="list": ${roleList.length}個, role="listitem": ${roleListitem.length}個`, {
        lists: Array.from(roleList).map(el => ({
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            childCount: el.children.length
        })),
        listitems: Array.from(roleListitem).slice(0, 5).map(el => ({
            tagName: el.tagName,
            className: el.className,
            textContent: el.textContent?.substring(0, 100)
        }))
    });

    // 2. 時刻パターン（分:秒）を含む要素を探す
    log('調査開始', '時刻パターン（MM:SS）を含む要素を検索中...');

    const timePattern = /\d{1,2}:\d{2}/;
    const allElements = document.querySelectorAll('*');
    const timeElements = [];

    allElements.forEach(el => {
        if (el.children.length === 0 && el.textContent && timePattern.test(el.textContent)) {
            const text = el.textContent.trim();
            if (text.length < 20) { // 時刻要素は短いはず
                timeElements.push({
                    tagName: el.tagName,
                    className: el.className,
                    text: text,
                    parentClass: el.parentElement?.className,
                    grandparentClass: el.parentElement?.parentElement?.className
                });
            }
        }
    });

    log('時刻要素', `${timeElements.length}個の時刻要素を発見`, timeElements.slice(0, 10));

    // 3. 仮想スクロールコンテナを探す
    log('調査開始', '仮想スクロールコンテナを検索中...');

    const scrollContainers = [];
    document.querySelectorAll('*').forEach(el => {
        const style = getComputedStyle(el);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
            scrollContainers.push({
                tagName: el.tagName,
                className: el.className,
                id: el.id,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
                role: el.getAttribute('role'),
                childCount: el.children.length
            });
        }
    });

    log('スクロールコンテナ', `${scrollContainers.length}個のスクロール可能要素を発見`, scrollContainers);

    // 4. 発言内容と思われる要素を探す（長いテキストを持つ要素）
    log('調査開始', '発言内容要素を検索中...');

    const textElements = [];
    allElements.forEach(el => {
        if (el.children.length === 0 && el.textContent) {
            const text = el.textContent.trim();
            if (text.length > 20 && text.length < 1000 && !text.includes('<') && !text.includes('{')) {
                textElements.push({
                    tagName: el.tagName,
                    className: el.className,
                    text: text.substring(0, 80) + (text.length > 80 ? '...' : ''),
                    parentClass: el.parentElement?.className
                });
            }
        }
    });

    log('テキスト要素', `${textElements.length}個の発言候補を発見`, textElements.slice(0, 10));

    // 5. data-属性を持つ要素を調査
    log('調査開始', 'data-属性を持つ要素を検索中...');

    const dataAttributes = new Set();
    allElements.forEach(el => {
        Array.from(el.attributes).forEach(attr => {
            if (attr.name.startsWith('data-')) {
                dataAttributes.add(attr.name);
            }
        });
    });

    log('data属性', `${dataAttributes.size}種類のdata属性を発見`, Array.from(dataAttributes));

    // 6. 特徴的なクラス名を調査
    log('調査開始', 'クラス名パターンを検索中...');

    const classPatterns = ['transcript', 'caption', 'speaker', 'message', 'utterance', 'segment', 'line', 'entry', 'item'];
    const matchedClasses = {};

    classPatterns.forEach(pattern => {
        const matched = document.querySelectorAll(`[class*="${pattern}"]`);
        if (matched.length > 0) {
            matchedClasses[pattern] = {
                count: matched.length,
                samples: Array.from(matched).slice(0, 3).map(el => el.className)
            };
        }
    });

    log('クラス名パターン', 'マッチしたパターン', matchedClasses);

    // 7. listitem内の構造を詳細調査
    if (roleListitem.length > 0) {
        log('調査開始', 'listitem要素の内部構造を調査中...');

        const firstItems = Array.from(roleListitem).slice(0, 3);
        const itemStructures = firstItems.map((item, idx) => {
            const children = Array.from(item.querySelectorAll('*'));
            return {
                index: idx,
                directChildren: item.children.length,
                allDescendants: children.length,
                structure: children.slice(0, 20).map(c => ({
                    tag: c.tagName,
                    class: c.className?.substring(0, 50),
                    text: c.textContent?.substring(0, 50),
                    role: c.getAttribute('role')
                }))
            };
        });

        log('listitem構造', 'listitem内部の要素構造', itemStructures);
    }

    // 結果をコンソールに出力
    console.log('='.repeat(60));
    console.log('診断結果（JSON）:');
    console.log(JSON.stringify(results, null, 2));
    console.log('='.repeat(60));

    // UIで結果を表示
    const panel = document.createElement('div');
    panel.id = 'transcript-diagnose-panel';
    panel.innerHTML = `
        <style>
            #transcript-diagnose-panel {
                position: fixed;
                top: 10px;
                right: 10px;
                width: 500px;
                max-height: 80vh;
                background: white;
                border: 2px solid #0078d4;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                z-index: 999999;
                font-family: 'Segoe UI', sans-serif;
                font-size: 13px;
            }
            #transcript-diagnose-panel .header {
                background: #0078d4;
                color: white;
                padding: 10px 15px;
                font-weight: bold;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-radius: 6px 6px 0 0;
            }
            #transcript-diagnose-panel .close-btn {
                background: none;
                border: none;
                color: white;
                font-size: 20px;
                cursor: pointer;
            }
            #transcript-diagnose-panel .content {
                padding: 15px;
                overflow-y: auto;
                max-height: calc(80vh - 60px);
            }
            #transcript-diagnose-panel .section {
                margin-bottom: 15px;
                padding: 10px;
                background: #f5f5f5;
                border-radius: 4px;
            }
            #transcript-diagnose-panel .section-title {
                font-weight: bold;
                color: #0078d4;
                margin-bottom: 5px;
            }
            #transcript-diagnose-panel pre {
                background: #1e1e1e;
                color: #d4d4d4;
                padding: 10px;
                border-radius: 4px;
                overflow-x: auto;
                font-size: 11px;
                white-space: pre-wrap;
                word-break: break-all;
            }
            #transcript-diagnose-panel .copy-btn {
                background: #0078d4;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                margin-top: 10px;
            }
            #transcript-diagnose-panel .copy-btn:hover {
                background: #005a9e;
            }
        </style>
        <div class="header">
            <span>🔍 トランスクリプト診断結果</span>
            <button class="close-btn" onclick="this.closest('#transcript-diagnose-panel').remove()">×</button>
        </div>
        <div class="content">
            <div class="section">
                <div class="section-title">📋 サマリー</div>
                <ul>
                    <li>role="list": ${roleList.length}個</li>
                    <li>role="listitem": ${roleListitem.length}個</li>
                    <li>時刻要素: ${timeElements.length}個</li>
                    <li>スクロールコンテナ: ${scrollContainers.length}個</li>
                </ul>
            </div>
            <div class="section">
                <div class="section-title">🎯 推奨セレクタ</div>
                <p>以下の情報を開発者に共有してください：</p>
                <pre id="diagnose-json">${JSON.stringify(results, null, 2)}</pre>
                <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('diagnose-json').textContent).then(() => alert('コピーしました'))">📋 JSONをコピー</button>
            </div>
        </div>
    `;

    // 既存のパネルがあれば削除
    const existing = document.getElementById('transcript-diagnose-panel');
    if (existing) existing.remove();

    document.body.appendChild(panel);

    console.log('診断完了！ 右上のパネルで結果を確認してください。');
})();

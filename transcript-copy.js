/**
 * Teams トランスクリプト全文コピーツール
 *
 * 仮想スクロールに対応して、自動スクロールしながら全テキストを収集します。
 */
(function() {
    'use strict';

    // 既存のパネルがあれば削除
    const existingPanel = document.getElementById('transcript-copy-panel');
    if (existingPanel) {
        existingPanel.remove();
        return;
    }

    // 状態管理
    const state = {
        isRunning: false,
        collected: new Map(), // key: ユニークID, value: {speaker, time, text}
        orderedKeys: [],
        scrollContainer: null,
        lastScrollTop: -1,
        stuckCount: 0
    };

    // セレクタ候補（複数パターンを試す）
    const SELECTORS = {
        containers: [
            '[role="list"]',
            '[data-automation-id="transcript-list"]',
            '.transcript-list',
            '.captions-list',
            '[class*="transcript"]',
            '[class*="caption"]'
        ],
        items: [
            '[role="listitem"]',
            '[data-automation-id="transcript-item"]',
            '.transcript-item',
            '.caption-item',
            '[class*="transcript-entry"]',
            '[class*="segment"]'
        ],
        scrollable: [
            '[role="list"]',
            '[class*="scroll"]',
            '[class*="transcript"]',
            '.ms-List'
        ]
    };

    // スクロールコンテナを検出
    function findScrollContainer() {
        // 方法1: スクロール可能な要素を探す
        for (const selector of SELECTORS.scrollable) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                const style = getComputedStyle(el);
                if ((style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                    el.scrollHeight > el.clientHeight + 100) {
                    console.log('[検出] スクロールコンテナ:', selector, el);
                    return el;
                }
            }
        }

        // 方法2: 全要素から最大のスクロール可能要素を探す
        let bestContainer = null;
        let maxScrollHeight = 0;

        document.querySelectorAll('*').forEach(el => {
            const style = getComputedStyle(el);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                el.scrollHeight > el.clientHeight &&
                el.scrollHeight > maxScrollHeight) {
                maxScrollHeight = el.scrollHeight;
                bestContainer = el;
            }
        });

        if (bestContainer) {
            console.log('[検出] スクロールコンテナ (フォールバック):', bestContainer);
            return bestContainer;
        }

        return null;
    }

    // トランスクリプトアイテムを収集
    function collectItems() {
        let items = [];

        // 複数のセレクタを試す
        for (const selector of SELECTORS.items) {
            const found = document.querySelectorAll(selector);
            if (found.length > 0) {
                items = Array.from(found);
                console.log(`[収集] ${selector}: ${items.length}個`);
                break;
            }
        }

        // セレクタでマッチしない場合、ヒューリスティックに検出
        if (items.length === 0) {
            items = findItemsHeuristically();
        }

        return items;
    }

    // ヒューリスティックにアイテムを検出
    function findItemsHeuristically() {
        const candidates = [];
        const timePattern = /^\d{1,2}:\d{2}$/;

        // 時刻要素を持つ親要素を探す
        document.querySelectorAll('*').forEach(el => {
            if (el.children.length === 0 && el.textContent) {
                const text = el.textContent.trim();
                if (timePattern.test(text)) {
                    // 時刻要素の親を辿って、発言単位の要素を見つける
                    let parent = el.parentElement;
                    for (let i = 0; i < 5 && parent; i++) {
                        if (parent.textContent && parent.textContent.length > text.length + 10) {
                            candidates.push(parent);
                            break;
                        }
                        parent = parent.parentElement;
                    }
                }
            }
        });

        // 重複を除去して返す
        const unique = [...new Set(candidates)];
        console.log(`[ヒューリスティック] ${unique.length}個のアイテム候補を発見`);
        return unique;
    }

    // アイテムから情報を抽出
    function extractInfo(item) {
        const text = item.textContent || '';
        const timePattern = /(\d{1,2}:\d{2})/;

        // 時刻を探す
        let time = '';
        const timeMatch = text.match(timePattern);
        if (timeMatch) {
            time = timeMatch[1];
        }

        // 時刻要素を見つけて、その前後で話者と内容を分離
        let speaker = '';
        let content = '';

        // 子要素を調べて構造を把握
        const children = item.querySelectorAll('*');
        children.forEach(child => {
            if (child.children.length === 0) {
                const childText = child.textContent.trim();

                // 時刻要素
                if (timePattern.test(childText) && childText.length < 10) {
                    time = childText;
                }
                // 短いテキスト（話者名の可能性）
                else if (childText.length > 0 && childText.length < 30 && !childText.includes(' ') === false) {
                    // 日本語の名前パターン
                    if (/^[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\s]+$/.test(childText) ||
                        /^[A-Za-z\s]+$/.test(childText)) {
                        if (!speaker) speaker = childText;
                    }
                }
                // 長いテキスト（発言内容の可能性）
                else if (childText.length > 10) {
                    if (!content || childText.length > content.length) {
                        content = childText;
                    }
                }
            }
        });

        // フォールバック: 全テキストから推測
        if (!content) {
            content = text.replace(time, '').replace(speaker, '').trim();
        }

        // ユニークキーを生成（重複排除用）
        const key = `${time}|${content.substring(0, 50)}`;

        return { speaker, time, content, key, raw: text };
    }

    // 収集したデータを整形
    function formatOutput() {
        const lines = [];
        for (const key of state.orderedKeys) {
            const item = state.collected.get(key);
            if (item) {
                const speaker = item.speaker || '(話者不明)';
                const time = item.time || '--:--';
                const content = item.content || item.raw || '';

                if (content.trim()) {
                    lines.push(`${speaker} ${time}\n${content}`);
                }
            }
        }
        return lines.join('\n\n');
    }

    // 自動スクロール＆収集
    async function startCollection() {
        const container = state.scrollContainer;
        if (!container) {
            updateStatus('エラー: スクロールコンテナが見つかりません', 'error');
            return;
        }

        state.isRunning = true;
        state.collected.clear();
        state.orderedKeys = [];
        state.stuckCount = 0;

        updateStatus('開始: 一番上にスクロール中...', 'info');

        // 一番上までスクロール
        container.scrollTop = 0;
        await sleep(500);

        const scrollStep = 150; // スクロール量（小さめに設定）
        const waitTime = 300;   // 待機時間（長めに設定）
        let iteration = 0;
        const maxIterations = 1000; // 安全装置

        while (state.isRunning && iteration < maxIterations) {
            iteration++;

            // 現在表示されているアイテムを収集
            const items = collectItems();
            let newCount = 0;

            items.forEach(item => {
                const info = extractInfo(item);
                if (info.key && !state.collected.has(info.key)) {
                    state.collected.set(info.key, info);
                    state.orderedKeys.push(info.key);
                    newCount++;
                }
            });

            // 進捗更新
            const progress = Math.round((container.scrollTop / (container.scrollHeight - container.clientHeight)) * 100);
            updateStatus(`収集中... ${state.collected.size}件 (${progress}%) +${newCount}`, 'info');
            updateTextarea(formatOutput());

            // スクロール位置が変わらなくなったら終了
            if (container.scrollTop === state.lastScrollTop) {
                state.stuckCount++;
                if (state.stuckCount > 5) {
                    updateStatus(`完了: ${state.collected.size}件を収集しました`, 'success');
                    state.isRunning = false;
                    break;
                }
            } else {
                state.stuckCount = 0;
            }

            state.lastScrollTop = container.scrollTop;

            // 下にスクロール
            container.scrollTop += scrollStep;
            await sleep(waitTime);
        }

        state.isRunning = false;
        updateStatus(`完了: ${state.collected.size}件を収集しました`, 'success');
        updateTextarea(formatOutput());
    }

    function stopCollection() {
        state.isRunning = false;
        updateStatus('停止しました', 'warning');
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function updateStatus(message, type) {
        const statusEl = document.getElementById('transcript-status');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `status ${type}`;
        }
        console.log(`[状態] ${message}`);
    }

    function updateTextarea(text) {
        const textarea = document.getElementById('transcript-output');
        if (textarea) {
            textarea.value = text;
        }
    }

    function copyToClipboard() {
        const textarea = document.getElementById('transcript-output');
        if (textarea && textarea.value) {
            navigator.clipboard.writeText(textarea.value)
                .then(() => updateStatus('クリップボードにコピーしました!', 'success'))
                .catch(err => updateStatus('コピーに失敗しました: ' + err, 'error'));
        }
    }

    function downloadText() {
        const textarea = document.getElementById('transcript-output');
        if (textarea && textarea.value) {
            const blob = new Blob([textarea.value], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `transcript_${new Date().toISOString().slice(0, 10)}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            updateStatus('ダウンロードしました', 'success');
        }
    }

    // UIを作成
    function createUI() {
        const panel = document.createElement('div');
        panel.id = 'transcript-copy-panel';
        panel.innerHTML = `
            <style>
                #transcript-copy-panel {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    width: 400px;
                    max-height: 90vh;
                    background: white;
                    border: 2px solid #0078d4;
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    z-index: 999999;
                    font-family: 'Segoe UI', 'Yu Gothic UI', sans-serif;
                    font-size: 13px;
                    display: flex;
                    flex-direction: column;
                }
                #transcript-copy-panel .header {
                    background: #0078d4;
                    color: white;
                    padding: 12px 15px;
                    font-weight: bold;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-radius: 6px 6px 0 0;
                    flex-shrink: 0;
                }
                #transcript-copy-panel .close-btn {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 20px;
                    cursor: pointer;
                    padding: 0 5px;
                }
                #transcript-copy-panel .close-btn:hover {
                    opacity: 0.8;
                }
                #transcript-copy-panel .content {
                    padding: 15px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    flex: 1;
                    overflow: hidden;
                }
                #transcript-copy-panel .button-row {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                #transcript-copy-panel button {
                    background: #0078d4;
                    color: white;
                    border: none;
                    padding: 10px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                    flex: 1;
                    min-width: 80px;
                }
                #transcript-copy-panel button:hover {
                    background: #005a9e;
                }
                #transcript-copy-panel button:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }
                #transcript-copy-panel button.stop {
                    background: #d83b01;
                }
                #transcript-copy-panel button.stop:hover {
                    background: #a52a00;
                }
                #transcript-copy-panel button.secondary {
                    background: #6c757d;
                }
                #transcript-copy-panel button.secondary:hover {
                    background: #545b62;
                }
                #transcript-copy-panel .status {
                    padding: 8px 12px;
                    border-radius: 4px;
                    background: #f0f0f0;
                    font-size: 12px;
                }
                #transcript-copy-panel .status.info { background: #e3f2fd; color: #1565c0; }
                #transcript-copy-panel .status.success { background: #e8f5e9; color: #2e7d32; }
                #transcript-copy-panel .status.warning { background: #fff3e0; color: #e65100; }
                #transcript-copy-panel .status.error { background: #ffebee; color: #c62828; }
                #transcript-copy-panel textarea {
                    flex: 1;
                    min-height: 200px;
                    max-height: 50vh;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 10px;
                    font-family: 'Consolas', 'Yu Gothic', monospace;
                    font-size: 12px;
                    resize: vertical;
                    line-height: 1.5;
                }
            </style>
            <div class="header">
                <span>📝 トランスクリプト全文コピー</span>
                <button class="close-btn" title="閉じる">×</button>
            </div>
            <div class="content">
                <div class="button-row">
                    <button id="btn-start">▶ 収集開始</button>
                    <button id="btn-stop" class="stop" disabled>⏹ 停止</button>
                </div>
                <div id="transcript-status" class="status info">開始ボタンを押すと、自動スクロールして全文を収集します</div>
                <textarea id="transcript-output" placeholder="収集したテキストがここに表示されます..." readonly></textarea>
                <div class="button-row">
                    <button id="btn-copy">📋 コピー</button>
                    <button id="btn-download" class="secondary">💾 ダウンロード</button>
                </div>
            </div>
        `;

        document.body.appendChild(panel);

        // イベントハンドラ
        panel.querySelector('.close-btn').onclick = () => {
            stopCollection();
            panel.remove();
        };

        panel.querySelector('#btn-start').onclick = async () => {
            panel.querySelector('#btn-start').disabled = true;
            panel.querySelector('#btn-stop').disabled = false;
            await startCollection();
            panel.querySelector('#btn-start').disabled = false;
            panel.querySelector('#btn-stop').disabled = true;
        };

        panel.querySelector('#btn-stop').onclick = () => {
            stopCollection();
            panel.querySelector('#btn-start').disabled = false;
            panel.querySelector('#btn-stop').disabled = true;
        };

        panel.querySelector('#btn-copy').onclick = copyToClipboard;
        panel.querySelector('#btn-download').onclick = downloadText;
    }

    // 初期化
    state.scrollContainer = findScrollContainer();

    if (!state.scrollContainer) {
        alert('トランスクリプトのスクロールコンテナが見つかりませんでした。\n\nトランスクリプト表示画面で実行してください。');
        return;
    }

    createUI();
    console.log('[初期化完了] スクロールコンテナ:', state.scrollContainer);
})();

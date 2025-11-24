// ==UserScript==
// @name         多家大模型网页同时回答 & 目录导航
// @namespace    http://tampermonkey.net/
// @version      3.1.1
// @description  输入一次问题，就能自动同步在各家大模型官网提问，免去到处粘贴的麻烦；提供多种便捷的页内目录导航。支持范围：DS，Kimi，千问，豆包，元宝，ChatGPT，Gemini，Claude，Grok……更多介绍见本页面下方。
// @author       interest2
// @match        https://www.kimi.com/*
// @match        https://chat.deepseek.com/*
// @match        https://www.tongyi.com/*
// @match        https://www.qianwen.com/*
// @match        https://chat.qwen.ai/*
// @match        https://www.doubao.com/*
// @match        https://yuanbao.tencent.com/*
// @match        https://chat.zchat.tech/*
// @match        https://chatgpt.com/*
// @match        https://gemini.google.com/*
// @match        https://aistudio.google.com/*
// @match        https://claude.ai/*
// @match        https://grok.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @connect      www.ratetend.com
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/536504/%E5%A4%9A%E5%AE%B6%E5%A4%A7%E6%A8%A1%E5%9E%8B%E5%90%8C%E6%97%B6%E5%9B%9E%E7%AD%94%EF%BC%8C%E5%8E%9F%E7%AB%99%E6%A0%B7%E5%BC%8F%E5%B1%95%E7%A4%BA.user.js
// @updateURL https://update.greasyfork.org/scripts/536504/%E5%A4%9A%E5%AE%B6%E5%A4%A7%E6%A8%A1%E5%9E%8B%E5%90%8C%E6%97%B6%E5%9B%9E%E7%AD%94%EF%BC%8C%E5%8E%9F%E7%AB%99%E6%A0%B7%E5%BC%8F%E5%B1%95%E7%A4%BA.meta.js
// ==/UserScript==

(function () {
    'use strict';
    const FLAG = '__MY_SCRIPT_ALREADY_RUN__';
    if (window[FLAG]) {
        console.log('Already running. Skipped.');
        return;
    }
    window[FLAG] = true;

    console.log("ai script, start");

    /**
     * 可自行修改的简单变量
     * */
    const NAV_MAX_WIDTH = "230px";  // 主目录的最大宽度
    const NAV_TOP = "20%";          // 主目录的默认 top 位置
    const NAV_TOP_THRESHOLD = 7;    // 主目录条目超过此阈值时，top位置抬高到5%
    const NAV_COUNT_THRESHOLD = 12; // 主目录条数超过此阈值时，会显示"共xx条"

    let SUB_NAV_TOP = "20%";          // 副目录的默认 top 位置
    const SUB_NAV_LEFT = "270px";     // 副目录的水平位置（距离屏幕左侧）
    const SUB_NAV_WIDTH = "270px";    // 副目录的宽度
    const SUB_NAV_MIN_ITEMS = 2;      // 副目录标题总条数超过此阈值才显示
    const SUB_NAV_TOP_THRESHOLD = 18; // 副目录标题条数超过此阈值时，top位置抬高到5%
    const SUB_NAV_PREV_LEVEL_THRESHOLD = 25; // 总条数超过此阈值时，默认显示到上一层级（如h4显示到h3，h3显示到h2）

    const STUDIO_CONTENT_MAX_WIDTH = "800px"; // gemini ai studio 内容最大宽度

    const DEFAULT_WAIT_ELEMENT_TIME = 20000; // 等待元素出现的超时时间
    const version = "3.1.1";

    /******************************************************************************
     * ═══════════════════════════════════════════════════════════════════════
     * ║                                                                      ║
     * ║  🔧 1、适配各站点相关代码  🔧                                      ║
     * ║                                                                      ║
     * ═══════════════════════════════════════════════════════════════════════
     ******************************************************************************/

    // 定义站点常量
    const DEEPSEEK = 0;
    const KIMI = 1;
    const TONGYI = 2;
    const QWEN = 3;
    const DOUBAO = 4;
    const YUANBAO = 5;

    const ZCHAT = 10;
    const CHATGPT = 11;
    const GEMINI = 12;
    const STUDIO = 13;
    const CLAUDE = 14;
    const GROK = 15;

    // 默认不启用的站点列表，移除元素可启用对应站点
    const DISABLE_SITES = [];

    // 启用 Markdown 标题识别的站点列表（性能优化：仅对需要的站点启用）
    const ENABLE_MARKDOWN_HEADING_SITES = [CLAUDE];

    // 启用 副目录滚动到上一个元素的站点列表
    const ENABLE_SCROLL_TO_PREV_ELEMENT_SITES = [CLAUDE];

    // 输入框类型分类
    const inputAreaTypes = {
        textarea: [DEEPSEEK, TONGYI, DOUBAO, QWEN, STUDIO],
        lexical: [KIMI, CHATGPT, ZCHAT, GEMINI, CLAUDE, GROK, YUANBAO]
    };

    // 通用输入框选择器，两类：textarea标签、lexical
    const getTextareaInput = () => document.getElementsByTagName('textarea')[0];
    const getContenteditableInput = () => document.querySelector('[contenteditable="true"]');

    // 选择器配置
    const selectors = {
        // 输入框分两类处理
        inputArea: {
            ...Object.fromEntries(inputAreaTypes.textarea.map(site => [site, getTextareaInput])),
            ...Object.fromEntries(inputAreaTypes.lexical.map(site => [site, getContenteditableInput]))
        },
        // 输入框里的发送按钮
        sendBtn: {
            [DEEPSEEK]: () => ((btns) => btns[btns.length - 1])(document.querySelectorAll('[role="button"]')),
            [KIMI]: () => document.getElementsByClassName('send-button')[0],
            [TONGYI]: () => document.querySelector('[class^="operateBtn-"], [class*=" operateBtn-"]'),
            [QWEN]: () => document.getElementById('send-message-button'),
            [DOUBAO]: () => document.getElementById('flow-end-msg-send'),
            [YUANBAO]: () => document.getElementById('yuanbao-send-btn'),

            [ZCHAT]: () => document.getElementById('composer-submit-button'),
            [CHATGPT]: () => document.getElementById('composer-submit-button'),
            [GEMINI]: () => document.querySelector('button.send-button'),
            [STUDIO]: () => document.querySelector('.run-button-content'),
            [CLAUDE]: () => document.querySelector('[aria-label^="Send"]'),
            [GROK]: () => document.querySelector('button[type="submit"]')
        },
        // 已提问的列表（官网样式变更不会影响同步提问功能，只影响目录功能）
        questionList: {
            [DEEPSEEK]: () => filterQuestions(document.getElementsByClassName("ds-message")),
            [KIMI]: () => document.getElementsByClassName("user-content"),
            [TONGYI]: () => document.querySelectorAll('[class^="bubble-"]'),
            [QWEN]: () => document.getElementsByClassName("user-message-content"),
            [DOUBAO]: () => Array.from(document.querySelectorAll('[data-testid="message_text_content"]')).filter(el => !el.children || el.children.length === 0),
            [YUANBAO]: () => document.querySelectorAll(".hyc-content-text"),

            [ZCHAT]: () => document.querySelectorAll('[data-message-author-role="user"]'),
            [CHATGPT]: () => document.querySelectorAll('[data-message-author-role="user"]'),
            [GEMINI]: () => document.getElementsByTagName('user-query'),
            [STUDIO]: () => document.querySelectorAll('[data-turn-role="User"]'),
            [CLAUDE]: () => document.querySelectorAll('[data-testid="user-message"]'),
            [GROK]: () => document.querySelectorAll('div.items-end .message-bubble')
        }
    };

    // url里关键词与各站点的对应关系
    const keywords = {
        "deepseek": DEEPSEEK,
        "kimi": KIMI,
        "qianwen": TONGYI,
        "qwen": QWEN,
        "doubao": DOUBAO,
        "yuanbao": YUANBAO,

        "zchat": ZCHAT,
        "chatgpt": CHATGPT,
        "gemini": GEMINI,
        "aistudio": STUDIO,
        "claude": CLAUDE,
        "grok": GROK
    };

    // 各家大模型的网址（新对话，历史对话的前缀）
    const webSites = {
        [KIMI]: ["https://www.kimi.com/"],
        [DEEPSEEK]: ["https://chat.deepseek.com/"],
        [TONGYI]: ["https://www.qianwen.com/"],
        [CHATGPT]: ["https://chatgpt.com/"],
        [DOUBAO]: ["https://www.doubao.com/chat"],
        [YUANBAO]: ["https://yuanbao.tencent.com"],

        [ZCHAT]: ["https://chat.zchat.tech/"],
        [GEMINI]: ["https://gemini.google.com/app"],
        [STUDIO]: ["https://aistudio.google.com/"],
        [QWEN]: ["https://chat.qwen.ai/"],
        [CLAUDE]: ["https://claude.ai/chat"],
        [GROK]: ["https://grok.com/"]
    };

    // 多选面板里，各站点的全称、简称
    let wordConfig = [
        { site: DEEPSEEK, word: 'DeepSeek', alias: 'D'},
        { site: KIMI, word: 'Kimi', alias: 'K' },
        { site: TONGYI, word: '千问', alias: '千' },
        { site: QWEN, word: 'Qwen', alias: 'Q' },
        { site: DOUBAO, word: '豆包', alias: '豆' },
        { site: YUANBAO, word: '元宝', alias: '元' },

        { site: ZCHAT, word: 'ZCHAT-GPT', alias: 'Z' },
        { site: CHATGPT, word: 'ChatGPT', alias: 'C' },
        { site: GEMINI, word: 'Gemini', alias: 'G' },
        { site: STUDIO, word: 'AI Studio', alias: 'A' },
        { site: CLAUDE, word: 'Claude', alias: 'Cl' },
        { site: GROK, word: 'Grok', alias: 'Gr' }
    ];
    // 过滤掉被禁用的站点
    wordConfig = wordConfig.filter(item => !DISABLE_SITES.includes(item.site));

    // （可选）隐藏输入框及周边区域，所需隐藏的元素，是输入框本体的第几层父元素？以下数字即层数（后续应改为半自动配置）
    const inputAreaHideParentLevel = {
        [DEEPSEEK]: 5,
        [KIMI]: 4,
        [TONGYI]: 6,
        [QWEN]: 9,
        [DOUBAO]: 11,
        [YUANBAO]: 10,

        [ZCHAT]: 10,
        [CHATGPT]: 10,
        [GEMINI]: 9,
        [STUDIO]: 11,
        [CLAUDE]: 6,
        [GROK]: 10
    };

    const newSites = Object.fromEntries(
        Object.entries(webSites).map(([key, [baseUrl]]) => [key, baseUrl])
    );

    // 表示当前站点的变量
    let site = 0;
    let currentUrl = getUrl();

    // 根据当前网址关键词，设置site值
    for (const keyword in keywords) {
        if (currentUrl.indexOf(keyword) > -1) {
            site = keywords[keyword];
            break;
        }
    }

    // 检查当前站点是否被禁用
    if (DISABLE_SITES.includes(site)) {
        console.log(`站点 ${site} 已被禁用，脚本完全退出`);
        return;
    }

    // 面板数据常量
    const CHOSEN_SITE = "chosenSite";

    /******************************************************************************
     * ═══════════════════════════════════════════════════════════════════════
     * ║                                                                      ║
     * ║  🔧 2、一些函数和变量  🔧                                            ║
     * ║                                                                      ║
     * ═══════════════════════════════════════════════════════════════════════
     ******************************************************************************/

    // 过滤出问题列表（偶数索引元素）
    const filterQuestions = (elements) => {
        if (!isEmpty(elements)) {
            let elementsArray = Array.from(elements);
            return elementsArray.filter((item, index) => index % 2 === 0);
        }
        return [];
    };

    // 标准化问题文本：移除特定站点的前缀
    const normalizeQuestionText = (text) => {
        if (!text) return '';
        const trimmedText = text.trim();
        const removeWord = 'User';
        if (site === STUDIO && trimmedText.startsWith(removeWord)) {
            return trimmedText.substring(removeWord.length).trim();
        }
        return trimmedText;
    };


    // 以下几个，是获取元素的入口方法
    function getQuestionList() {
        const selector = selectors.questionList[site];
        return selector ? selector() : [];
    }

    function getInputArea() {
        const selector = selectors.inputArea[site];
        return selector ? selector() : null;
    }

    function getSendButton() {
        const selector = selectors.sendBtn[site];
        return selector ? selector() : null;
    }

    if(site === STUDIO) {
        SUB_NAV_TOP = "35%";
    }

    // 系统功能配置
    const checkGap = 100;
    const maxRetries = 200;
    const OPEN_GAP = 300; // 打开网页的间隔
    const HIBERNATE_GAP = 600; // 单位：秒
    let testLocalFlag = 0;

    // 存储时的特征词
    const T = "tool-";
    const UID_KEY_PREFIX = "uid-";
    const HEART_KEY_PREFIX ="lastHeartbeat-";

    let DOMAIN = "https://www.ratetend.com:5001";
    let testDOMAIN = "http://localhost:8002";
    const DEVELOPER_USERID = "7bca846c-be51-4c49-ba2b6"

    let userid = getGV("userid");
    if(isEmpty(userid)){
        userid = guid();
        setGV("userid", userid);
    }else{
        // 本地调试用，连接本地服务器
        if(userid === DEVELOPER_USERID){
            if(testLocalFlag === 1){
                DOMAIN = testDOMAIN;
            }
        }
    }

    setTimeout(developTest, 2000);
    function developTest(){
        // kimi 表格太窄，自测调大用
        if(DEVELOPER_USERID === userid && site === KIMI){
            // let kimiPage = document.getElementsByClassName("chat-content-list")[0];
            // kimiPage.style.maxWidth = TEST_KIMI_WIDTH;
        }
    }


    let startUrl = DOMAIN + "/start";
    let startData = {
        "userid": userid,
        "site": site,
        "version": version
    };
    remoteHttp(startUrl, startData);

    // 生成映射
    const wordToSite = {};
    const siteToWord = {};
    const siteToAlias = {};
    const wordToAlias = {};
    const words = [];

    wordConfig.forEach(({ site, word, alias }) => {
        words.push(word);

        wordToSite[word] = site;
        siteToWord[site] = word;
        siteToAlias[site] = alias;
        wordToAlias[word] = alias;
    });


    /******************************************************************************
     * ═══════════════════════════════════════════════════════════════════════
     * ║                                                                      ║
     * ║  📡 3、主从节点逻辑  📡                                              ║
     * ║                                                                      ║
     * ═══════════════════════════════════════════════════════════════════════
     ******************************************************************************/

    // 给发送环节加锁。因为send环节是异步轮询，新问题来时send未必轮询结束
    let sendLock = false;

    // 页面加载时，向本地存储发送一次心跳
    setGV(HEART_KEY_PREFIX + site, Date.now());

    function masterCheck(lastestQ){
        if(sendLock){
            return;
        }
        if(isEmpty(lastestQ)){
            return;
        }

        let msg = {
            question: lastestQ,
            date: Date.now()
        };
        console.log(msg);
        setGV("msg", msg);

        addCurrentToStorage();

        let isDisable = getGV("disable");
        if(isDisable){
            return;
        }
        let remoteUrl = DOMAIN + "/masterQ";
        let sites = getSitesExcludeCurrent();
        let data = {
            "userid": userid,
            "sites": sites
        };
        remoteHttp(remoteUrl, data);

        sites.forEach(site => {
            let lastHeartbeat = getGV(HEART_KEY_PREFIX + site);
            // 如果从节点 xx 秒没有更新心跳时刻，则认为已经关闭，需打开
            if(isEmpty(lastHeartbeat) || Date.now() - lastHeartbeat > 1000 * HIBERNATE_GAP){
                setTimeout(function(){
                    window.open(newSites[site], '_blank');
                }, OPEN_GAP);
            }
        });
    }

    let lastQuestion = "";

    // 监听是否有新的提问
    GM_addValueChangeListener('msg', function(name, oldValue, msg, remote) {
        if(!remote){
            return;
        }
        if(getGV("disable") === true){
            return;
        }

        let sites = getSitesOfStorage();
        if(sites.includes(site)){
            // 假定新的提问出现时，上次的提问已经发送出去，故sendLock是已解锁
            if(sendLock){
                return;
            }
            let msg = getGV("msg");
            let question = msg.question;
            // 避免重复发送
            if(question === lastQuestion){
                return;
            }
            sendQuestion(question);
        }
    });

    /******************************************************************************
     * ═══════════════════════════════════════════════════════════════════════
     * ║                                                                      ║
     * ║  ⚙️ 4、从节点异步轮询检查  ⚙️                                        ║
     * ║                                                                      ║
     * ═══════════════════════════════════════════════════════════════════════
     ******************************************************************************/

    /**
     * 发送提问内容
     * 整体涉及这些轮询检查：① 输入框的存在 ② 发送按钮的存在 ③ 输入框的清空
     */

    /**
     * 发送问题的主流程
     */
    async function sendQuestion(content) {
        updateBoxFromStorage();
        sendLock = true;
        lastQuestion = content;

        try {
            // 步骤1: 等待输入框出现（使用 MutationObserver）
            const inputArea = await waitForElement(
                () => getInputArea(),
                {timeout: 10000, timeoutMsg: "监测输入框存在超时"}
            );
            // 步骤2、3: 粘贴内容到输入框、等待发送按钮出现并点击
            await pasteContent(inputArea, content);
            await waitAndClickSendButton();

        } catch (error) {
            console.error("发送问题失败:", error);
            sendLock = false;
        }
    }

    /**
     * 等待发送按钮出现并执行发送流程
     */
    async function waitAndClickSendButton() {
        console.log(curDate() + "h1 等待发送按钮");

        try {
            // 等待发送按钮出现（使用 MutationObserver）
            const sendBtn = await waitForElement(
                () => getSendButton(),
                {timeout: maxRetries * checkGap, timeoutMsg: "发送按钮未找到"}
            );

            // 点击页面空白处，然后点击发送按钮
            await new Promise((resolve) => {
                setTimeout(() => {
                    document.body.click();
                    setTimeout(() => {
                        console.log(curDate() + "h2 点击发送按钮");
                        sendBtn.click();
                        resolve();
                    }, 200);
                }, 200);
            });

            // 验证发送成功
            await verifySendSuccess(sendBtn);

        } catch (error) {
            console.error("发送失败:", error);
            sendLock = false;
            throw error;
        }
    }

    /**
     * 验证发送成功（输入框内容清空）
     */
    async function verifySendSuccess(sendBtn) {
        const pollInterval = 500;
        const maxPollTime = 20000;
        const startTime = Date.now();
        if(site === YUANBAO){
            pollInterval = 2000;
        }

        return new Promise((resolve) => {
            function checkInputArea() {
                const elapsed = Date.now() - startTime;
                const inputArea = getInputArea();
                const areaContent = getInputContent(inputArea);

                // 输入框为空，表明发送成功
                if (!areaContent || areaContent.trim() === '') {
                    sendLock = false;
                    resolve();
                    return;
                }

                // 超时，解锁并返回
                if (elapsed >= maxPollTime) {
                    console.warn("发送验证超时，但可能已经成功发送");
                    sendLock = false;
                    resolve();
                    return;
                }


                // 输入框仍有内容，继续点击发送按钮
                console.log(curDate() + "h3 重试发送");
                sendBtn.click();

                setTimeout(checkInputArea, pollInterval);
            }

            setTimeout(checkInputArea, pollInterval);
        });
    }

    /**
     * 输入框粘贴提问内容
     */
    async function pasteContent(editor, content) {
        return new Promise((resolve) => {
            setTimeout(() => {
                // 输入框粘贴文字，大致分两类处理。其中第一类里 kimi 特殊处理
                //  第一类（lexical）
                if (inputAreaTypes.lexical.includes(site)) {
                    if ([KIMI].includes(site)) {
                        editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: content }));
                    } else {
                        const pTag = editor.querySelector('p');
                        pTag.textContent = content;
                    }
                    //  第二类（textarea 标签）
                } else if (inputAreaTypes.textarea.includes(site)) {
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLTextAreaElement.prototype,
                        'value'
                    ).set;
                    nativeInputValueSetter.call(editor, content);
                    // 触发 input 事件
                    editor.dispatchEvent(new Event('input', { bubbles: true }));
                }
                resolve();
            }, 100);
        });
    }

    /******************************************************************************
     * ═══════════════════════════════════════════════════════════════════════
     * ║                                                                      ║
     * ║  🖼️ 5、图片同步功能  🖼️                                              ║
     * ║                                                                      ║
     * ═══════════════════════════════════════════════════════════════════════
     ******************************************************************************/

    // 监听是否有新的图片
    GM_addValueChangeListener('image', function(name, oldValue, msg, remote) {
        if(!remote){
            return;
        }
        if(getGV("disable") === true){
            return;
        }

        let sites = getSitesOfStorage();
        if(sites.includes(site)){
            pasteImage();
        }
    });

    // 主节点监听粘贴事件
    const imageKey = "image";
    const currentAskHasImage = "currentAskHasImage";

    document.addEventListener('paste', async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                if (!blob) continue;

                // 转为 Base64
                const base64 = await blobToBase64(blob);

                GM_setValue(imageKey, base64);
                setS(T + currentAskHasImage, "1");

                break; // 手动粘贴图片后，脚本读取最后一张图，存入共享存储
            }
        }
    });

    // 模拟将 base64 图片粘贴到输入框（返回在实际触发粘贴后才 resolve）
    async function pasteImage() {
        const base64 = GM_getValue(imageKey);
        if (!base64) {
            console.error('未找到指定的图片');
            return false;
        }
        return new Promise((resolve) => {
            try {
                const blob = base64ToBlob(base64);
                const file = new File([blob], 'pasted-image.png', {
                    type: blob.type || 'image/png',
                    lastModified: Date.now()
                });

                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);

                const pasteEvent = new ClipboardEvent('paste', {
                    clipboardData: dataTransfer,
                    bubbles: true,
                    cancelable: true
                });

                let targetElement = getInputArea();
                let retryCount = 0;
                const maxRetries = 100; // 最多重试（20秒）
                const interval = setInterval(() => {
                    retryCount++;
                    targetElement = getInputArea(); // 每次重试时重新获取元素
                    if (targetElement && typeof targetElement.focus === 'function') {
                        clearInterval(interval);
                        targetElement.focus();

                        // 粘贴
                        const dispatched = targetElement.dispatchEvent(pasteEvent);
                        console.log('模拟粘贴图片成功');
                        resolve(!!dispatched);
                    } else if (retryCount >= maxRetries) {
                        clearInterval(interval);
                        console.warn('粘贴图片超时：输入框未找到或无法聚焦');
                        resolve(false);
                    }
                }, 200);
            } catch (error) {
                console.error('模拟粘贴失败:', error);
                resolve(false);
            }
        });
    }

    /******************************************************************************
     * ═══════════════════════════════════════════════════════════════════════
     * ║                                                                      ║
     * ║  👂 6、监听新的提问：监听输入框回车事件、发送按钮点击事件  👂        ║
     * ║                                                                      ║
     * ═══════════════════════════════════════════════════════════════════════
     ******************************************************************************/

    // 检查事件是否带有修饰键
    const hasModifierKey = (event) => event.shiftKey || event.ctrlKey || event.altKey || event.metaKey;

    // 根据输入框类型获取内容
    function getInputContent(inputArea) {
        if (isEmpty(inputArea)) return '';

        // textarea 类型使用 .value
        if (inputAreaTypes.textarea.includes(site)) {
            return inputArea.value ? inputArea.value.trim() : '';
        }
        // lexical 类型使用 .textContent
        else if (inputAreaTypes.lexical.includes(site)) {
            return inputArea.textContent ? inputArea.textContent.trim() : '';
        }

        return '';
    }

    // 监听发送按钮点击事件和回车键
    let sendBtnListenerAdded = false;
    let inputAreaListenerAdded = false;
    let pendingQuestion = null; // 临时存储按下时的问题
    let lastUrl = getUrl(); // 记录上次的URL
    let cachedInputContent = ""; // 缓存的输入框内容

    function addSendButtonListener() {
        const sendBtn = getSendButton();
        const inputArea = getInputArea();

        if (!isEmpty(sendBtn) && !sendBtnListenerAdded) {
            // 给元素添加标记，用于检测元素是否被替换
            sendBtn.setAttribute('data-listener-added', 'true');

            // 鼠标按下（记录输入框内容）
            sendBtn.addEventListener('mousedown', function() {
                const inputArea = getInputArea();
                if (!isEmpty(inputArea)) {
                    const lastestQ = getInputContent(inputArea);
                    // 如果lastestQ为空，则使用缓存的内容
                    const questionToUse = isEmpty(lastestQ) ? cachedInputContent : lastestQ;
                    if (!isEmpty(questionToUse)) {
                        pendingQuestion = questionToUse;
                    }
                }
            });

            // 鼠标移出（取消）
            sendBtn.addEventListener('mouseleave', function() {
                if (!isEmpty(pendingQuestion)) {
                    console.log("鼠标移出按钮，取消发送");
                    pendingQuestion = null;
                }
            });

            // 鼠标释放（发送提问）
            sendBtn.addEventListener('mouseup', function() {

                if (!isEmpty(pendingQuestion)) {
                    const questionToSend = pendingQuestion;
                    pendingQuestion = null; // 清空临时变量

                    setTimeout(function() {
                        masterCheck(questionToSend);
                    }, 100);
                }
            });

            sendBtnListenerAdded = true;
            console.log("✓ 发送按钮监听器已添加");
        }

        // 监听输入框的回车键和输入内容
        if (!isEmpty(inputArea) && !inputAreaListenerAdded) {
            // 给元素添加标记，用于检测元素是否被替换
            inputArea.setAttribute('data-listener-added', 'true');

            // 监听输入框内容变化
            inputArea.addEventListener('input', function() {
                cachedInputContent = getInputContent(inputArea);
            });

            inputArea.addEventListener('keydown', function(event) {
                let isTrigger = false;
                if (site === STUDIO) {
                    // STUDIO: Ctrl + Enter
                    if (event.key === 'Enter' && event.ctrlKey) {
                        isTrigger = true;
                    }
                } else {
                    // 单纯的 Enter 键，不带任何修饰键
                    if (event.key === 'Enter' && !hasModifierKey(event)) {
                        isTrigger = true;
                    }
                }

                if (isTrigger) {
                    const lastestQ = getInputContent(inputArea);
                    console.log("lastestQ: "+lastestQ);
                    const questionToUse = isEmpty(lastestQ) ? cachedInputContent : lastestQ;
                    if (!isEmpty(questionToUse)) {
                        setTimeout(function() {
                            masterCheck(questionToUse);
                        }, 100);
                    }
                }
            });
            inputAreaListenerAdded = true;
            console.log("✓ 输入框回车监听器已添加");
        }

        // 如果按钮或输入框还没加载，稍后重试
        if (!sendBtnListenerAdded || !inputAreaListenerAdded) {
            setTimeout(addSendButtonListener, 500);
        }
    }

    // 检查监听器是否丢失（元素被替换）
    function checkListenerIntegrity() {
        const sendBtn = getSendButton();
        const inputArea = getInputArea();

        // 检查发送按钮
        if (!isEmpty(sendBtn) && sendBtnListenerAdded) {
            const hasMarker = sendBtn.getAttribute('data-listener-added') === 'true';
            if (!hasMarker) {
                console.warn("⚠ 发送按钮元素已被替换，监听器丢失！重新添加...");
                sendBtnListenerAdded = false;
            }
        }

        // 检查输入框
        if (!isEmpty(inputArea) && inputAreaListenerAdded) {
            const hasMarker = inputArea.getAttribute('data-listener-added') === 'true';
            if (!hasMarker) {
                console.warn("⚠ 输入框元素已被替换，监听器丢失！重新添加...");
                inputAreaListenerAdded = false;
            }
        }

        // 如果发现监听器丢失，重新添加
        if (!sendBtnListenerAdded || !inputAreaListenerAdded) {
            setTimeout(addSendButtonListener, 1000);
        }
    }
    // 标记输入框是否处于隐藏状态
    let isInputAreaHidden = false;

    // 监听URL变化，重新添加监听器
    function checkUrlChange() {
        const currentUrl = getUrl();

        if (currentUrl !== lastUrl) {
            console.log("URL已变化，重新添加监听器");
            lastUrl = currentUrl;

            let nthInputArea = getNthInputArea();
            if(site === GEMINI){
                // gemini 打开新对话的情况
                if(isInputAreaHidden && nthInputArea.style.display === 'none' && getQuestionList().length === 0){
                    nthInputArea.style.display = 'flex';
                    isInputAreaHidden = false;
                }
            }
            // 如果打开新对话，可能导致 display 值清空，此时输入框并未隐藏
            if(nthInputArea.style.display === ''){
                toggleBtnStatus(true);
                isInputAreaHidden = false;
            }

            sendBtnListenerAdded = false;
            inputAreaListenerAdded = false;
            pendingQuestion = null;

            // URL 变化时隐藏副目录
            if (typeof hideSubNavBar === 'function') {
                hideSubNavBar();
            }

            setTimeout(addSendButtonListener, 500);
        }
    }

    // 定期检查URL变化和监听器完整性
    setInterval(function() {
        reloadCompactMode();
        checkUrlChange();
        checkListenerIntegrity();
        setGV(HEART_KEY_PREFIX + site, Date.now());

        let questions = getQuestionList();
        updateNavQuestions(questions);

        if(site === STUDIO){
            let studioContent = document.querySelector('.chat-session-content');
            if(!isEmpty(studioContent)){
                studioContent.style.maxWidth = STUDIO_CONTENT_MAX_WIDTH;
            }
        }

    }, 1800);


    /******************************************************************************
     * ═══════════════════════════════════════════════════════════════════════
     * ║                                                                      ║
     * ║  🎨 7、trusted HTML & 首次使用指引 🎨                        ║
     * ║                                                                      ║
     * ═══════════════════════════════════════════════════════════════════════
     ******************************************************************************/

    // 安全处理HTML内容（Trusted Types支持）
    let policy = null;
    try {
        if (window.trustedTypes) {
            policy = trustedTypes.createPolicy("forceInner", {
                createHTML: (to_escape) => to_escape
            });
        }
    } catch(e) {
        policy = null;
    }

    function makeHTML(content){
        if(isEmpty(policy)){
            return content;
        }else{
            try {
                return policy.createHTML(content);
            } catch(e) {
                return content;
            }
        }
    }

    // 安全设置 innerHTML，如果失败则使用 DOM 方法
    function setInnerHTML(element, html) {
        if (isEmpty(html)) {
            // 清空内容使用 replaceChildren 更安全
            element.replaceChildren();
            return;
        }

        try {
            const trustedHTML = makeHTML(html);
            element.innerHTML = trustedHTML;
        } catch(e) {
            // 如果 Trusted Types 失败，使用 DOMParser
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                element.replaceChildren(...Array.from(doc.body.childNodes));
            } catch(parseError) {
                // 如果 DOMParser 也失败，使用 textContent 作为最后手段
                element.textContent = html.replace(/<[^>]*>/g, '');
            }
        }
    }

    // 面板延迟时间
    let panelDelay = site === ZCHAT ? 500 : 50;
    const panel = document.createElement('div');

    /**
     * 脚本首次使用的指引
     */
    let FIRST_RUN_KEY = "firstRun";
    setTimeout(function(){
        document.body.appendChild(panel);
        document.body.appendChild(toggleButton);
        document.body.appendChild(subNavBar);
        reloadDisableStatus();

        // 添加发送按钮监听
        setTimeout(addSendButtonListener, 1000);

        setTimeout(function(){
            // 首次运行
            if(isEmpty(getGV(FIRST_RUN_KEY))){
                setGV(FIRST_RUN_KEY, 1);
                let updateHint = "脚本使用提示：\n网页右下角的多选面板可勾选提问范围，\n点击\"禁用\"可一键关闭同步提问";

                alert(updateHint);
            } else {
                // 非首次运行，检查版本更新
                // let VERSION_MARK = FIRST_RUN_KEY + "_2";
                // if(isEmpty(getGV(VERSION_MARK))){
                //     setGV(VERSION_MARK, 1);
                //     let updateHint = "脚本近期更新：\n为单个回答内容建立目录导航功能";
                //     alert(updateHint);
                // }
            }

        }, 800);
    }, panelDelay);


    /******************************************************************************
     * ═══════════════════════════════════════════════════════════════════════
     * ║                                                                      ║
     * ║  🎨 8、输入框的显示/隐藏切换 🎨                        ║
     * ║                                                                      ║
     * ═══════════════════════════════════════════════════════════════════════
     ******************************************************************************/


    /**
     * 输入框的显示/隐藏切换功能
     */
    // 切换按钮相关常量
    const TOGGLE_BUTTON_BG_SHOW = '#ec7258';
    const TOGGLE_BUTTON_BG_HIDE = '#999';
    const TOGGLE_BUTTON_STYLE = `font-size:14px;padding:5px;position:fixed;cursor:pointer;background:${TOGGLE_BUTTON_BG_SHOW};color:white;border:1px solid #ddd;border-radius:30%;box-shadow:0 4px 12px rgba(0,0,0,0.2);z-index:99999999;display:flex;align-items:center;justify-content:center;`;

    // 切换状态配置
    const TOGGLE_STATES = {
        show: {
            text: '隐藏',
            bg: TOGGLE_BUTTON_BG_SHOW,
            display: 'flex'
        },
        hide: {
            text: '显示',
            bg: TOGGLE_BUTTON_BG_HIDE,
            display: 'none'
        }
    };

    const toggleButton = document.createElement('div');
    toggleButton.style.cssText = TOGGLE_BUTTON_STYLE;
    toggleButton.textContent = TOGGLE_STATES.show.text;
    toggleButton.title = '临时隐藏输入框获得更大的视野高度';

    const getNthParent = (el, n) => n > 0 ? getNthParent(el?.parentElement, n - 1) : el;

    function getNthInputArea(){
        const inputArea = getInputArea();
        return getNthParent(inputArea, inputAreaHideParentLevel[site]);
    }

    // 按钮点击事件 - 切换面板显示/隐藏
    toggleButton.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleInput();
    });

    function toggleInput(){
        const aroundInputArea = getNthInputArea();
        // 如果输入框是被用户隐藏的，则切换输入框、按钮状态
        const isHidden = aroundInputArea.style.display === 'none';
        // 更新隐藏状态标记
        isInputAreaHidden = !isHidden;

        const state = isHidden ? TOGGLE_STATES.show : TOGGLE_STATES.hide;
        toggleBtnStatus(isHidden);
        aroundInputArea.style.display = state.display;
    }

    function toggleBtnStatus(isHidden){
        const state = isHidden ? TOGGLE_STATES.show : TOGGLE_STATES.hide;
        toggleButton.textContent = state.text;
        toggleButton.style.background = state.bg;
    }

    // 存储的key
    const TOGGLE_BOTTOM_KEY = T + 'toggleBottom';
    const TOGGLE_LEFT_KEY = T + 'toggleLeft';
    const TOGGLE_MAX_LEFT_KEY = T + 'toggleMaxLeft';
    const TOGGLE_DELTA1_KEY = T + 'toggleDelta1';
    const TOGGLE_DELTA2_KEY = T + 'toggleDelta2';

    const BUTTON_RIGHT_OFFSET = 20; // 按钮右边缘的偏移量
    const DEFAULT_LEFT_OFFSET = 40; // 默认left值的偏移量
    const MIN_RIGHT_THRESHOLD = 10; // right值的最小阈值
    const TOOL_PANEL_ID = 'tool-panel'; // 多选面板的ID

    /**
     * 计算bottom值
     */
    function calculateBottom() {
        const savedBottom = localStorage.getItem(TOGGLE_BOTTOM_KEY);
        if (savedBottom !== null) {
            return parseFloat(savedBottom);
        }

        const UPDATE_BOTTOM_THRESHOLD = 45;
        const sendButton = getSendButton();
        // 发送按钮存在，若新 bottom < 阈值，才更新
        if (sendButton) {
            const calculatedBottom = window.innerHeight - sendButton.getBoundingClientRect().bottom;
            if (calculatedBottom < UPDATE_BOTTOM_THRESHOLD) {
                setS(TOGGLE_BOTTOM_KEY, calculatedBottom.toString());
                return calculatedBottom;
            }
        }

        // 默认值
        return UPDATE_BOTTOM_THRESHOLD;
    }

    /**
     * 计算left值
     * @param {HTMLElement} inputArea - 输入框元素
     * @param {HTMLElement} sendButton - 发送按钮元素
     */
    function calculateLeft(inputArea, sendButton) {
        let hasInputArea = !!inputArea;
        let hasSendButton = !!sendButton;

        const defaultLeft = window.innerWidth - DEFAULT_LEFT_OFFSET;

        // 情况1: 输入框√，按钮√
        if (hasInputArea && hasSendButton) {
            const right1 = sendButton.getBoundingClientRect().right;
            const right2 = inputArea.getBoundingClientRect().right;

            // 检查right值是否有效，无效则重置对应标志
            hasSendButton = hasSendButton && right1 >= MIN_RIGHT_THRESHOLD;
            hasInputArea = hasInputArea && right2 >= MIN_RIGHT_THRESHOLD;

            // 两者都有效才存储
            if (hasInputArea && hasSendButton) {
                const left = right1 + BUTTON_RIGHT_OFFSET;
                const delta1 = BUTTON_RIGHT_OFFSET;
                const delta2 = left - right2;

                setS(TOGGLE_LEFT_KEY, left.toString());
                setS(TOGGLE_DELTA1_KEY, delta1.toString());
                setS(TOGGLE_DELTA2_KEY, delta2.toString());

                // 如果当前是最大宽度，额外记录maxLeft
                if (isMaxWidth()) {
                    setS(TOGGLE_MAX_LEFT_KEY, left.toString());
                }

                return left;
            }
        }

        // 情况2: 输入框√，按钮×。等于 输入框右边缘 + delta
        if (hasInputArea && !hasSendButton) {
            const savedDelta2 = localStorage.getItem(TOGGLE_DELTA2_KEY);
            if (savedDelta2 !== null) {
                const right2 = inputArea.getBoundingClientRect().right;
                return right2 + parseFloat(savedDelta2);
            }
            return defaultLeft;
        }

        // 情况3: 输入框×，按钮√。等于 按钮右边缘 + delta
        if (!hasInputArea && hasSendButton) {
            const savedDelta1 = localStorage.getItem(TOGGLE_DELTA1_KEY);
            if (savedDelta1 !== null) {
                const right1 = sendButton.getBoundingClientRect().right;
                return right1 + parseFloat(savedDelta1);
            }
            return defaultLeft;
        }

        // 情况4: 输入框×，按钮×。用存储的 left
        const savedLeft = localStorage.getItem(TOGGLE_LEFT_KEY);
        if (savedLeft !== null) {
            return parseFloat(savedLeft);
        }
        return defaultLeft;
    }

    /**
     * 更新 toggle 按钮的位置和显示状态
     * @param {boolean} isResizeEvent - 是否是resize事件触发
     */
    function updateToggleButtonPosition(isResizeEvent = false) {
        // 如果处于隐藏状态且非resize场景，直接返回，不更新位置
        if (isInputAreaHidden && !isResizeEvent) {
            return;
        }

        const bottom = calculateBottom();
        let left;

        // 如果处于隐藏状态且是 resize 场景
        if (isInputAreaHidden && isResizeEvent) {
            // 特殊情况：如果resize到最大宽度且有保存的maxLeft，优先使用maxLeft
            if (isMaxWidth()) {
                const savedMaxLeft = localStorage.getItem(TOGGLE_MAX_LEFT_KEY);
                if (savedMaxLeft !== null) {
                    left = parseFloat(savedMaxLeft);
                } else {
                    // 没有保存的maxLeft，跟随多选面板的位置
                    const toolPanel = document.getElementById(TOOL_PANEL_ID);
                    if (toolPanel) {
                        const panelRect = toolPanel.getBoundingClientRect();
                        left = panelRect.left;
                    } else {
                        left = window.innerWidth - DEFAULT_LEFT_OFFSET;
                    }
                }
            } else {
                // 非最大宽度，跟随缩略状态的多选面板的left位置
                const toolPanel = document.getElementById(TOOL_PANEL_ID);
                if (toolPanel) {
                    const panelRect = toolPanel.getBoundingClientRect();
                    left = panelRect.left;
                } else {
                    left = window.innerWidth - DEFAULT_LEFT_OFFSET;
                }
            }
        } else {
            const inputArea = getInputArea();
            const sendButton = getSendButton();
            left = calculateLeft(inputArea, sendButton);
        }

        // 更新toggle按钮位置
        toggleButton.style.left = `${left}px`;
        toggleButton.style.bottom = `${bottom}px`;
    }

    /**
     * 轮询更新 toggle 按钮的位置和显示状态
     */
    function pollToggleButtonPosition() {
        const POLL_INTERVAL = 1000; // 轮询间隔1000ms

        const checkAndUpdate = () => {
            updateToggleButtonPosition();
            setTimeout(checkAndUpdate, POLL_INTERVAL);
        };

        // 开始轮询
        checkAndUpdate();
    }

    // 页面加载后开始持续轮询
    pollToggleButtonPosition();

    // 监听窗口宽度变化，更新toggle按钮的位置和显示状态
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        // 防抖处理，避免频繁触发
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => updateToggleButtonPosition(true), 50);
    });

    /******************************************************************************
     * ═══════════════════════════════════════════════════════════════════════
     * ║                                                                      ║
     * ║  📑 9、目录导航功能  📑                                              ║
     * ║                                                                      ║
     * ═══════════════════════════════════════════════════════════════════════
     ******************************************************************************/

    // 查找回答内容区域的查找限制（用于性能优化）
    const FIND_ANSWER_SIBLING_LIMIT = 20; // 兄弟元素查找上限（原30，已优化）
    const FIND_ANSWER_MIDDLE_SIBLING_LIMIT = 30; // 中间问题查找时的兄弟元素上限（原50，已优化）
    const FIND_ANSWER_LAST_SIBLING_LIMIT = 15; // 最后一个问题查找时的兄弟元素上限（原20，已优化）
    const FIND_ANSWER_PARENT_DEPTH_LIMIT = 10// 向上查找父元素的最大深度（原10，已优化）


    const NAV_ITEM_COLOR = "#333";
    // 副目录项悬停样式常量
    const SUB_NAV_ITEM_HOVER_BG = '#f0f0f0';
    const SUB_NAV_ITEM_HOVER_COLOR = '#0066cc';
    const SUB_NAV_ITEM_NORMAL_BG = 'transparent';
    const SUB_NAV_ITEM_NORMAL_COLOR = '#333';
    // 目录导航相关常量
    const NAV_HIGHLIGHT_THRESHOLD = 0.3; // 目录高亮阈值（0~30%高亮当前项，30%~100%高亮前一项）
    const NAV_VIEWPORT_THRESHOLD = 0.9; // 可视区域阈值（90%）
    const NAV_NEAR_TOP_THRESHOLD = 24; // 接近顶部阈值（像素）
    const NAV_CLICK_LOCK_DURATION = 1200; // 点击锁定持续时间（毫秒）
    // 副目录标题级别配置（可配置为 h1~h4、h2~h4 或 h2~h3）
    const SUB_NAV_HEADING_LEVELS = [4, 3, 2, 1]; // 支持 h4, h3, h2, h1（顺序从低到高）
    const SUB_NAV_HEADING_SELECTOR = SUB_NAV_HEADING_LEVELS.map(level => `h${level}`).join(', '); // 生成选择器字符串，如 "h1, h2, h3, h4"
    const SUB_NAV_HEADING_TAGS = SUB_NAV_HEADING_LEVELS.map(level => `H${level}`); // 生成标签数组，如 ["H1", "H2", "H3", "H4"]

    // 样式常量
    const NAV_STYLES = {
        // 主目录样式
        navBar: `position:fixed;visibility:hidden;top:${NAV_TOP};right:15px;max-width:${NAV_MAX_WIDTH};min-width:150px;background:rgba(255,255,255,0.95);border:1px solid #ccc;border-radius:6px;padding:0 5px;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.15);max-height:90vh;overflow-y:auto;box-sizing:border-box;`,
        miniButton: `position:fixed;top:${NAV_TOP};right:15px;color:${NAV_ITEM_COLOR};border:1px solid #ddd;border-radius:8px;padding:2px 8px;font-size:14px;font-weight: bold;cursor:pointer;z-index:99999;visibility:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.15);user-select:none;`,
        title: `display:flex;align-items:center;justify-content:flex-start;gap:6px;font-weight:bold;color:#333;padding:4px 5px;border-bottom:1px solid #eaeaea;margin-bottom:4px;position:sticky;top:0;background:rgba(255,255,255,0.95);z-index:10;`,
        hideBtn: `font-weight:normal;color:#333;font-size:12px;padding:2px 6px;border:1px solid #aaa;border-radius:10px;cursor:pointer;user-select:none;`,
        countText: `font-weight:normal;color:#333;font-size:14px;margin-left:6px;user-select:none;`,
        linkContainer: `display:flex;align-items:center;gap:4px;width:100%;`,
        link: `width:100%;padding:4px 2px;cursor:pointer;color:#333;font-size:14px;line-height:1.5;white-space:normal;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word;max-height:calc(1.9em * 2);box-sizing:border-box;`,
        waveIcon: `font-size:12px;cursor:pointer;color:#333;padding:0;border-radius:3px;user-select:none;flex-shrink:0;transition:background-color 0.2s;`,
        waveIconHover: `background-color:#f0f0f0;color:#0066cc;`,
        waveIconNormal: `background-color:transparent;color:#333;`,

        // 副目录样式
        subNavBar: `position:fixed;left:${SUB_NAV_LEFT};top:${SUB_NAV_TOP};max-width:${SUB_NAV_WIDTH};min-width:220px;max-height:94vh;background:rgba(255,255,255,1);border:1px solid #ccc;border-radius:6px;padding:8px;z-index:2147483646;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.15);overflow-y:auto;box-sizing:border-box;display:none;`,
        subNavTitle: `font-weight:bold;color:#111;padding:4px 0;border-bottom:1px solid #eaeaea;margin-bottom:6px;font-size:14px;`,
        subNavCloseBtn: `position:absolute;top:0;right:8px;font-size:16px;cursor:pointer;color:#333;width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:3px;transition:background-color 0.2s;`,
        subNavItem: `padding:4px 2px;cursor:pointer;color:#333;font-size:13px;line-height:1.6;border-radius:3px;margin:2px 0;transition:background-color 0.2s;word-break:break-word;`,
        subNavItemH1: `padding-left:0px;font-weight:700;`,
        subNavItemH2: `padding-left:2px;font-weight:600;`,
        subNavItemH3: `padding-left:10px;font-weight:500;`,
        subNavItemH4: `padding-left:18px;font-weight:400;`,
        levelBtnGroup: `display:flex;gap:4px;align-items:center;`,
        levelBtn: `padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #ddd;border-radius:4px;background:#fff;color:#333;transition:all 0.2s;user-select:none;`,
        levelBtnActive: `background:#0066cc;color:#fff;border-color:#0066cc;`,
        levelBtnHover: `background-color:#f0f0f0;border-color:#ccc;`,
        levelBtnLeave: `background-color:#fff;border-color:#ddd;color:#333;`,

        subNavPositionBtn: `position:absolute;top:0;right:32px;font-size:12px;cursor:pointer;color:#111;width:40px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:3px;transition:background-color 0.2s;`,
        subNavPositionBtnHover: `background-color:#f0f0f0;`,
        subNavPositionBtnNormal: `background-color:transparent;`,
        subNavPositionInput: `position:absolute;top:0;right:32px;width:60px;height:18px;padding:0 4px;font-size:12px;border:1px solid #ccc;border-radius:3px;outline:none;`
    };

    // 创建导航元素
    const navBar = document.createElement('div');
    navBar.id = "tool-nav-bar";
    navBar.style.cssText = NAV_STYLES.navBar;

    const navMiniButton = document.createElement('div');
    navMiniButton.textContent = '目录';
    navMiniButton.style.cssText = NAV_STYLES.miniButton;

    // 获取副目录left位置的key
    const getSubNavLeftKey = () => {
        return `${T}subNavLeft`;
    };

    // 获取副目录的left值（优先从localStorage读取）
    const getSubNavLeft = () => {
        const key = getSubNavLeftKey();
        const savedLeft = localStorage.getItem(key);
        return savedLeft || SUB_NAV_LEFT;
    };

    // 设置副目录的left值到localStorage
    const setSubNavLeft = (left) => {
        const key = getSubNavLeftKey();
        setS(key, left);
    };

    // 创建副目录栏元素
    const subNavBar = document.createElement('div');
    subNavBar.id = "tool-sub-nav-bar";
    // 使用动态获取的left值设置样式
    const subNavLeft = getSubNavLeft();
    subNavBar.style.cssText = NAV_STYLES.subNavBar.replace(`left:${SUB_NAV_LEFT}`, `left:${subNavLeft}`);

    // 状态变量
    let navQuestions, navLinks = [], navIO, elToLink = new Map();
    let clickedTarget = null, clickLockUntil = 0, scrollDebounceTimer;
    let currentSubNavQuestionIndex = -1; // 当前显示的副目录对应的主目录索引
    let currentSubNavLevel = 4; // 当前副目录显示的层级（默认 h4）
    let currentSubNavHeadings = []; // 当前副目录的所有标题数据（未过滤）
    let subNavPollInterval = null; // 副目录轮询定时器
    let isSubNavLevelManuallySet = false; // 用户是否手动选择了层级
    let navCountText = null; // 主目录条数显示元素

    // 从localStorage读取最小化状态，默认为false
    let navMinimized = localStorage.getItem(T + 'navMinimized') === 'true';

    // 设置导航链接的样式（高亮或普通状态）
    const setLinkStyle = (linkContainer, isActive) => {
        if(!linkContainer) return;
        // 如果是 linkContainer，从中查找 link 元素
        const link = linkContainer.classList?.contains('tool-nav-link-container')
            ? linkContainer.querySelector('.tool-nav-link')
            : linkContainer;
        if(!link) return;
        if(isActive) {
            link.style.cssText = NAV_STYLES.link + 'background-color:;color:#0066cc;';
        } else {
            link.style.cssText = NAV_STYLES.link + 'background-color:;color:#333;';
        }
    };

    // 清除所有导航链接的高亮状态
    const clearAllHighlights = () => navLinks.forEach(link => setLinkStyle(link, false));

    // 统一的元素可见性判断函数
    const isElementVisible = (rect, viewportThreshold = NAV_VIEWPORT_THRESHOLD) => {
        if (!rect) return false;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        return rect.bottom > 0 && rect.top < viewportHeight * viewportThreshold;
    };

    // 判断元素是否接近顶部
    const isElementNearTop = (rect, threshold = NAV_NEAR_TOP_THRESHOLD) => {
        return rect ? Math.abs(rect.top) < threshold : false;
    };

    // 获取视口高度
    const getViewportHeight = () => window.innerHeight || document.documentElement.clientHeight;

    // 计算元素在视口中的位置百分比
    const getElementPositionPercent = (rect) => {
        const viewportHeight = getViewportHeight();
        return rect.top / viewportHeight;
    };

    // 获取所有可见的元素
    const getVisibleElements = (elements, viewportThreshold = NAV_VIEWPORT_THRESHOLD) => {
        return elements.filter(el => {
            const rect = el?.getBoundingClientRect();
            return isElementVisible(rect, viewportThreshold);
        });
    };

    // 更新主目录条数显示
    const updateNavCount = () => {
        if (!navCountText) return;

        const linkCount = navBar.querySelectorAll('.tool-nav-link').length;

        // 如果条数超过阈值，显示"共xx条"
        if (linkCount > NAV_COUNT_THRESHOLD) {
            navCountText.textContent = `共${linkCount}条`;
            navCountText.style.display = '';
        } else {
            navCountText.style.display = 'none';
        }
    };

    // 刷新导航栏的显示状态（显示/隐藏/最小化）
    const refreshNavBarVisibility = () => {
        const root = document.body || document.documentElement;
        if(!root.contains(navMiniButton)) root.appendChild(navMiniButton);

        const linkCount = navBar.querySelectorAll('.tool-nav-link').length;
        if(linkCount === 0) {
            navBar.style.visibility = navMiniButton.style.visibility = "hidden";
            updateNavCount(); // 更新条数显示
            return;
        }

        // 如果条目数量超过指定阈值，则将navBar的top改为5%
        let navTop;
        if(linkCount > NAV_TOP_THRESHOLD) {
            navTop = "5%";
            navBar.style.top = navTop;
            navMiniButton.style.top = navTop;
        } else {
            navTop = NAV_TOP;
            navBar.style.top = navTop;
            navMiniButton.style.top = navTop;
        }

        // 更新条数显示
        updateNavCount();

        if(navMinimized) {
            navBar.style.visibility = "hidden";
            navMiniButton.style.visibility = "visible";
        } else {
            navBar.style.visibility = "visible";
            navMiniButton.style.visibility = "hidden";
            if(!root.contains(navBar)) root.appendChild(navBar);
        }
    };

    // 设置导航栏的最小化状态
    const setNavMinimized = (min) => {
        navMinimized = min === true;
        setS(T + 'navMinimized', navMinimized.toString());
        refreshNavBarVisibility();
    };

    // 计算当前应该高亮的导航项索引
    const computeActiveIndex = () => {
        if(!navQuestions?.length) return -1;
        let candidateIndex = -1, smallestPositiveTop = Infinity, lastNegativeIndex = -1;

        navQuestions.forEach((el, i) => {
            if(!el?.getBoundingClientRect) return;
            const rect = el.getBoundingClientRect();
            if(rect.top >= 0) {
                if(rect.top < smallestPositiveTop) {
                    smallestPositiveTop = rect.top;
                    candidateIndex = i;
                }
            } else {
                lastNegativeIndex = i;
            }
        });
        return candidateIndex !== -1 ? candidateIndex : lastNegativeIndex;
    };

    // 高亮当前活跃的导航项
    const highlightActiveNav = () => {
        const idx = computeActiveIndex();
        navLinks.forEach((link, i) => setLinkStyle(link, i === idx));
        // 自动显示当前高亮项对应的副目录
        if (idx >= 0 && typeof autoShowSubNav === 'function') {
            autoShowSubNav(idx);
        }
    };

    // 检查并切换高亮状态（根据滚动位置智能高亮）
    const checkAndSwitchHighlight = () => {
        if(!navQuestions?.length) return;

        // 找到所有可见的目录项
        const visibleElements = getVisibleElements(navQuestions, 1.0); // 使用100%视口高度进行初步筛选

        if(visibleElements.length === 0) {
            // 视野无任何目录，保持上次高亮项（不做任何操作）
            return;
        }

        const firstVisibleEl = visibleElements[0];
        const rect = firstVisibleEl.getBoundingClientRect();
        const positionPercent = getElementPositionPercent(rect);

        let targetIndex = -1;
        if(positionPercent >= 0 && positionPercent <= NAV_HIGHLIGHT_THRESHOLD) {
            // 0~30%：高亮当前项
            targetIndex = navQuestions.indexOf(firstVisibleEl);
        } else if(positionPercent > NAV_HIGHLIGHT_THRESHOLD && positionPercent <= 1.0) {
            // 30%~100%：高亮前一项
            const currentIndex = navQuestions.indexOf(firstVisibleEl);
            targetIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
        }

        if(targetIndex >= 0) {
            clearAllHighlights();
            setLinkStyle(navLinks[targetIndex], true);
            // 自动显示当前高亮项对应的副目录
            if (typeof autoShowSubNav === 'function') {
                autoShowSubNav(targetIndex);
            }
        }
    };

    // 滚动事件处理函数（优化的节流处理）
    let lastScrollTime = 0;
    const onScrollRefreshActive = () => {
        const now = Date.now();
        if(now - lastScrollTime < 32) return; // 约30fps的节流，减少性能消耗
        lastScrollTime = now;

        // 清除之前的防抖计时器
        if(scrollDebounceTimer) {
            clearTimeout(scrollDebounceTimer);
            scrollDebounceTimer = null;
        }

        // 设置防抖，避免重复执行
        scrollDebounceTimer = setTimeout(() => {
            scrollDebounceTimer = null;
            highlightActiveNav();
            checkAndSwitchHighlight();
        }, 30); // 减少延迟到30ms，提高响应性
    };

    window.addEventListener('scroll', onScrollRefreshActive, { passive: true });

    // 查找问题对应的回答内容区域
    const findAnswerContent = (questionEl) => {
        if (!questionEl) return null;

        // 获取所有问题元素，用于确定回答区域的边界
        const allQuestions = getQuestionList();
        if (!allQuestions || allQuestions.length === 0) return null;

        const questionIndex = Array.from(allQuestions).indexOf(questionEl);
        if (questionIndex < 0) {
            // 问题不在列表中，尝试直接查找
            let nextSibling = questionEl.nextElementSibling;
            let checkedCount = 0;
            while (nextSibling && checkedCount < FIND_ANSWER_SIBLING_LIMIT) {
                const headings = nextSibling.querySelectorAll(SUB_NAV_HEADING_SELECTOR);
                if (headings.length > 0) {
                    return nextSibling;
                }
                if (nextSibling.tagName && SUB_NAV_HEADING_TAGS.includes(nextSibling.tagName)) {
                    return nextSibling.parentElement;
                }
                nextSibling = nextSibling.nextElementSibling;
                checkedCount++;
            }
            return null;
        }

        if (questionIndex >= allQuestions.length - 1) {
            // 如果是最后一个问题，查找它之后的所有内容
            let current = questionEl;
            let depth = 0;
            while (current && depth < FIND_ANSWER_PARENT_DEPTH_LIMIT) {
                // 查找当前元素的父元素
                let parent = current.parentElement;
                if (!parent) break;

                // 查找父元素的兄弟元素
                let sibling = parent.nextElementSibling;
                let checkedCount = 0;
                while (sibling && checkedCount < FIND_ANSWER_LAST_SIBLING_LIMIT) {
                    const headings = sibling.querySelectorAll(SUB_NAV_HEADING_SELECTOR);
                    if (headings.length > 0) {
                        return sibling;
                    }
                    // 检查当前元素本身是否是h2~h4
                    if (sibling.tagName && SUB_NAV_HEADING_TAGS.includes(sibling.tagName)) {
                        return sibling.parentElement;
                    }
                    sibling = sibling.nextElementSibling;
                    checkedCount++;
                }

                // 向上查找
                current = parent;
                depth++;
            }
        } else {
            // 如果不是最后一个问题，查找当前问题和下一个问题之间的内容
            const nextQuestion = allQuestions[questionIndex + 1];
            if (!nextQuestion) return null;

            // 查找问题元素和下一个问题元素之间的所有元素
            let current = questionEl;
            let depth = 0;
            while (current && depth < FIND_ANSWER_PARENT_DEPTH_LIMIT) {
                // 查找当前元素的父元素
                let parent = current.parentElement;
                if (!parent) break;

                // 查找父元素的兄弟元素，直到找到下一个问题
                let sibling = parent.nextElementSibling;
                let checkedCount = 0;
                while (sibling && checkedCount < FIND_ANSWER_MIDDLE_SIBLING_LIMIT) {
                    // 如果找到了下一个问题，停止搜索
                    if (sibling.contains(nextQuestion) || sibling === nextQuestion) {
                        break;
                    }

                    // 查找包含h2~h4的元素
                    const headings = sibling.querySelectorAll(SUB_NAV_HEADING_SELECTOR);
                    if (headings.length > 0) {
                        return sibling;
                    }

                    // 检查当前元素本身是否是h2~h4
                    if (sibling.tagName && SUB_NAV_HEADING_TAGS.includes(sibling.tagName)) {
                        return sibling.parentElement;
                    }

                    sibling = sibling.nextElementSibling;
                    checkedCount++;
                }

                // 向上查找
                current = parent;
                depth++;
            }
        }

        // 如果以上方法都没找到，尝试在问题元素之后直接查找
        let nextSibling = questionEl.nextElementSibling;
        let checkedCount = 0;
        while (nextSibling && checkedCount < FIND_ANSWER_SIBLING_LIMIT) {
            const headings = nextSibling.querySelectorAll(SUB_NAV_HEADING_SELECTOR);
            if (headings.length > 0) {
                return nextSibling;
            }
            if (nextSibling.tagName && SUB_NAV_HEADING_TAGS.includes(nextSibling.tagName)) {
                return nextSibling.parentElement;
            }
            nextSibling = nextSibling.nextElementSibling;
            checkedCount++;
        }

        return null;
    };

    // 规范化标题文本（移除 emoji、空格、冒号等，但保留数字编号）
    const normalizeHeadingText = (text) => {
        if (!text) return '';

        let normalized = text.trim();

        // 移除开头的空格和 emoji，但保留数字编号
        // 先移除开头的连续空格
        normalized = normalized.replace(/^\s+/, '');

        // 关键优化：先检查第一个字符是否是数字，避免某些环境将数字误识别为 emoji
        const firstChar = normalized.charAt(0);
        if (/[0-9]/.test(firstChar)) {
            // 第一个字符是数字，不做任何处理，保留完整的数字编号
            // 例如："8. ..."、"8.1 ..."、"1. ..." 等
        } else {
            // 第一个字符不是数字，可能是 emoji 或其他字符
            // 检查是否是 emoji 开头，且后面紧跟数字（可能含空格）
            if (/^\p{Emoji}\s*[0-9]/u.test(normalized)) {
                // emoji 后面是数字，只移除 emoji 和空格，保留数字
                // 例如："✅ 1. ..." → "1. ..."
                normalized = normalized.replace(/^\p{Emoji}+\s*/u, '');
            } else if (/^\p{Emoji}/u.test(normalized)) {
                // emoji 后面不是数字，安全移除 emoji
                // 再次确认第一个字符不是数字（双重检查，防止误识别）
                if (!/[0-9]/.test(normalized.charAt(0))) {
                    normalized = normalized.replace(/^\p{Emoji}+\s*/u, '');
                }
                // 如果第一个字符是数字，说明被误识别为 emoji，不做处理
            }
        }

        // 移除末尾的冒号（中英文）
        normalized = normalized.replace(/[:：]+$/, '');

        return normalized;
    };

    // 查找 Markdown 格式的标题（#、## 或 ### 开头）
    const findMarkdownHeadings = (contentEl, headingList, startDomOrder) => {
        // 支持标题被分割在多个元素中的情况（如 <span>## 五、</span><span>标题内容</span>）
        // 兼容代码块未正确闭合的情况：即使标题在代码块内（因代码块未正确闭合导致的），也要识别为标题
        const markdownHeadingPatterns = [
            { level: 1, prefix: '# ' },    // h1: # 标题
            { level: 2, prefix: '## ' },   // h2: ## 标题
            { level: 3, prefix: '### ' }   // h3: ### 标题
        ];

        // 检查纯文本节点（包括合并后的文本，如分割在多个span中的标题在textContent中会合并成一行）
        const walker = document.createTreeWalker(
            contentEl,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let textNode;
        let domOrder = startDomOrder; // 继续使用传入的domOrder，保持顺序连续
        while (textNode = walker.nextNode()) {
            const text = textNode.textContent;
            if (!text) continue;

            // 兼容代码块未正确闭合的情况：不跳过代码块内的文本节点，识别所有标题
            const lines = text.split(/\n|\r\n?/);
            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                const line = lines[lineIndex];
                const trimmedLine = line.trim();

                // 对每一行，检查所有 markdown 标题模式
                markdownHeadingPatterns.forEach(({ level, prefix }) => {
                    if (!SUB_NAV_HEADING_LEVELS.includes(level)) return;

                    if (trimmedLine.startsWith(prefix)) {
                        const titleText = trimmedLine.substring(prefix.length).trim();
                        if (!titleText) return;

                        // 找到包含该文本的可见父元素
                        // 兼容代码块未正确闭合的情况：即使父元素在代码块内，也识别为标题
                        let parentEl = textNode.parentElement;
                        while (parentEl && parentEl !== contentEl) {
                            const rect = parentEl.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                // 检查是否已经存在相同文本和级别的标题（避免重复）
                                const exists = headingList.some(h =>
                                    h.text === titleText &&
                                    h.level === level &&
                                    Math.abs(h.position - rect.top) < 30
                                );

                                if (!exists) {
                                    headingList.push({
                                        element: parentEl,
                                        tagName: `H${level}`,
                                        text: titleText,
                                        level: level,
                                        position: rect.top,
                                        domOrder: domOrder++, // 记录DOM顺序（每个匹配的标题单独分配）
                                        isMarkdown: true
                                    });
                                }
                                return; // 找到匹配后退出当前模式循环
                            }
                            parentEl = parentEl.parentElement;
                        }
                    }
                });
            }
        }

        return domOrder; // 返回更新后的domOrder
    };

    // 在回答内容区域中查找所有配置的标题级别
    const findHeadingsInContent = (contentEl) => {
        if (!contentEl) return [];

        const headingList = [];

        // 1. 查找现有的 h2~h4 标签标题
        let domOrder = 0; // 初始化DOM顺序计数器（HTML标签标题和Markdown标题共用）
        const headings = contentEl.querySelectorAll(SUB_NAV_HEADING_SELECTOR);
        Array.from(headings).forEach(h => {
            // 确保标题是可见的
            const rect = h.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            // 确保标题级别在配置的范围内
            const level = parseInt(h.tagName.substring(1));
            if (!SUB_NAV_HEADING_LEVELS.includes(level)) return;

            // 规范化标题文本
            const text = normalizeHeadingText(h.textContent);

            headingList.push({
                element: h,
                tagName: h.tagName,
                text: text,
                level: level,
                position: rect.top,
                domOrder: domOrder++ // 为HTML标签标题也添加domOrder，确保排序正确
            });
        });

        // 2. 查找文本中以 "## " 或 "### " 开头的 Markdown 标题
        // 性能优化：仅对配置的站点启用此功能，避免对其他站点造成性能占用
        if (ENABLE_MARKDOWN_HEADING_SITES.includes(site)) {
            domOrder = findMarkdownHeadings(contentEl, headingList, domOrder);
        }

        // 3. 去重并排序（按DOM顺序，保持文档中的原始顺序）
        const uniqueHeadings = [];
        const seenKeys = new Set();

        // 按DOM顺序排序（TreeWalker遍历的顺序）
        // 如果domOrder不存在，使用position作为备选排序依据
        headingList.sort((a, b) => {
            const orderA = a.domOrder !== undefined ? a.domOrder : Infinity;
            const orderB = b.domOrder !== undefined ? b.domOrder : Infinity;
            if (orderA !== Infinity && orderB !== Infinity) {
                return orderA - orderB;
            }
            // 如果某个标题没有domOrder，使用position排序
            return a.position - b.position;
        });

        headingList.forEach(heading => {
            // 使用文本、级别和更精确的位置作为唯一标识，避免重复
            // 使用更小的位置区间（5像素）来区分不同的标题
            const positionKey = Math.floor(heading.position / 5);
            const key = `${heading.text}_${heading.level}_${positionKey}`;

            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                uniqueHeadings.push({
                    element: heading.element,
                    tagName: heading.tagName,
                    text: heading.text,
                    level: heading.level
                });
            }
        });

        return uniqueHeadings;
    };

    const SUB_NAV_SCROLL_MAX_HEIGHT_DIFF = 120; // 副目录滚动时，上一个元素最大高度差（超过此值则不滚动）
    const SUB_NAV_SCROLL_MIN_HEIGHT_DIFF = 50; // 副目录滚动时，上一个元素最小高度差（小于此值则再往前找一个元素）

    // 滚动到目标元素，并可选择性地滚动到上一个元素
    const scrollToTargetWithPrevElement = (targetElement) => {
        if (!targetElement || !document.body.contains(targetElement)) {
            console.warn('标题元素不存在，无法跳转');
            return;
        }

        targetElement.scrollIntoView({ block: 'start' });

        // 如果当前站点启用了滚动到上一个元素功能
        if (ENABLE_SCROLL_TO_PREV_ELEMENT_SITES.includes(site)) {
            setTimeout(() => {
                // 找到targetElement的上一个相邻元素
                let previousElement = targetElement.previousElementSibling;
                if (previousElement) {
                    // 检测上一个元素的位置是否比目标高出超过阈值
                    const targetRect = targetElement.getBoundingClientRect();
                    let prevRect = previousElement.getBoundingClientRect();
                    let heightDiff = targetRect.top - prevRect.top;
                    
                    if (heightDiff > SUB_NAV_SCROLL_MAX_HEIGHT_DIFF) {
                        console.log('上一个元素位置过高，不进行滚动');
                    } else if (heightDiff <= SUB_NAV_SCROLL_MIN_HEIGHT_DIFF) {
                        // 如果高度不超过最小阈值，再往前找一个元素
                        const prevPrevElement = previousElement.previousElementSibling;
                        if (prevPrevElement) {
                            const prevPrevRect = prevPrevElement.getBoundingClientRect();
                            const prevPrevHeightDiff = targetRect.top - prevPrevRect.top;
                            if (prevPrevHeightDiff <= SUB_NAV_SCROLL_MAX_HEIGHT_DIFF) {
                                previousElement = prevPrevElement;
                                console.log('使用前前一个元素');
                            }
                        }
                        previousElement.scrollIntoView({ block: 'start' });
                    } else {
                        previousElement.scrollIntoView({ block: 'start' });
                    }
                } else {
                    console.log('没有找到上一个相邻元素');
                }
            }, 0);
        }
    };

    // 渲染副目录项（根据当前选择的层级过滤）
    const renderSubNavItems = () => {
        // 获取标题容器后的所有元素
        const titleContainer = subNavBar.querySelector('.sub-nav-title-container');
        if (!titleContainer) return;

        // 移除所有标题项（保留标题容器）
        const items = subNavBar.querySelectorAll('.sub-nav-item');
        items.forEach(item => item.remove());

        // 根据当前选择的层级过滤标题
        const filteredHeadings = currentSubNavHeadings.filter(h => h.level <= currentSubNavLevel);

        // 创建标题级别样式映射
        const headingStyleMap = {
            1: NAV_STYLES.subNavItemH1,
            2: NAV_STYLES.subNavItemH2,
            3: NAV_STYLES.subNavItemH3,
            4: NAV_STYLES.subNavItemH4
        };

        // 添加过滤后的标题
        filteredHeadings.forEach((heading, index) => {
            const item = document.createElement('div');
            item.className = 'sub-nav-item';
            let itemStyle = NAV_STYLES.subNavItem;

            // 根据标题级别设置不同的缩进（如果配置中包含该级别）
            if (SUB_NAV_HEADING_LEVELS.includes(heading.level) && headingStyleMap[heading.level]) {
                itemStyle += headingStyleMap[heading.level];
            } else {
                // 如果级别不在预定义样式中，根据级别动态计算缩进（每级8px）
                const paddingLeft = heading.level * 8;
                itemStyle += `padding-left:${paddingLeft}px;`;
            }

            item.style.cssText = itemStyle;
            item.textContent = heading.text;
            item.title = heading.text;

            // 鼠标悬停效果
            item.addEventListener('mouseenter', () => {
                item.style.backgroundColor = SUB_NAV_ITEM_HOVER_BG;
                item.style.color = SUB_NAV_ITEM_HOVER_COLOR;
            });
            item.addEventListener('mouseleave', () => {
                item.style.backgroundColor = SUB_NAV_ITEM_NORMAL_BG;
                item.style.color = SUB_NAV_ITEM_NORMAL_COLOR;
            });

            // 点击跳转
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // 先尝试使用保存的元素引用
                let targetElement = heading.element;

                // 如果元素引用失效，重新查找对应的标题元素
                if (!targetElement || !document.body.contains(targetElement)) {
                    // 获取当前问题索引
                    const questionIndex = currentSubNavQuestionIndex;
                    if (questionIndex >= 0 && navQuestions && questionIndex < navQuestions.length) {
                        const targetEl = navQuestions[questionIndex];
                        if (targetEl && document.body.contains(targetEl)) {
                            // 查找回答内容区域
                            const answerContent = findAnswerContent(targetEl);
                            if (answerContent) {
                                // 重新查找所有标题
                                const headings = findHeadingsInContent(answerContent);
                                // 查找匹配的标题（通过文本和级别）
                                const matchedHeading = headings.find(h =>
                                    h.text === heading.text && h.level === heading.level
                                );
                                if (matchedHeading && matchedHeading.element) {
                                    targetElement = matchedHeading.element;
                                }
                            }
                        }
                    }
                }

                scrollToTargetWithPrevElement(targetElement);
            });

            subNavBar.appendChild(item);
        });
    };

    // 根据副目录条目数量动态设置top位置
    const updateSubNavTop = () => {
        const subNavItemCount = subNavBar.querySelectorAll('.sub-nav-item').length;
        if (subNavItemCount > SUB_NAV_TOP_THRESHOLD) {
            subNavBar.style.top = "5%";
        } else {
            subNavBar.style.top = SUB_NAV_TOP;
        }
    };

    // 显示副目录栏
    const showSubNavBar = (questionIndex, headings, isPolling = false) => {
        // 如果已关闭，则不加载
        if (isSubNavClosed()) {
            return;
        }

        if (!headings || headings.length === 0) {
            console.log('未找到标题');
            return;
        }

        // 检测标题总条数，超过指定数量才显示副目录
        if (headings.length <= SUB_NAV_MIN_ITEMS) {
            return;
        }

        // 轮询时的优化：如果当前已有标题且新标题数量少于或等于现有标题数量，可能是DOM还没完全加载
        // 只有在标题数量增加时才更新（保留更完整的数据）
        if (isPolling && currentSubNavHeadings.length > 0) {
            // 如果新标题数量少于现有标题，说明可能丢失了某些标题，不更新
            if (headings.length < currentSubNavHeadings.length) {
                console.log(`轮询时标题数量减少（${headings.length} < ${currentSubNavHeadings.length}），保留现有标题`);
                return;
            }
            // 如果标题数量相同，检查是否有实际变化（避免不必要的重建）
            if (headings.length === currentSubNavHeadings.length) {
                // 检查标题列表是否完全相同（通过比较标题文本和位置的hash）
                const existingKeys = new Set(currentSubNavHeadings.map(h =>
                    `${h.text}_${h.level}_${Math.floor(h.position / 5)}`
                ));
                const newKeys = new Set(headings.map(h =>
                    `${h.text}_${h.level}_${Math.floor(h.position / 5)}`
                ));
                // 如果标题完全相同，不更新
                if (existingKeys.size === newKeys.size &&
                    [...existingKeys].every(k => newKeys.has(k))) {
                    return;
                }
            }
        }

        // 保存标题数据和状态
        currentSubNavHeadings = headings;

        // 获取实际存在的标题层级（从高到低：h4, h3, h2）
        const existingLevels = [...new Set(headings.map(h => h.level))].sort((a, b) => b - a);

        // 检查是否是同一个问题且用户已手动选择层级
        const isSameQuestion = questionIndex === currentSubNavQuestionIndex;
        if (isSameQuestion && isSubNavLevelManuallySet) {
            // 如果是同一个问题且用户已手动选择层级，保留用户的选择，不重新计算
            currentSubNavQuestionIndex = questionIndex;
        } else {
            // 如果是新问题或用户未手动选择，重新计算层级
            currentSubNavQuestionIndex = questionIndex;
            isSubNavLevelManuallySet = false; // 重置手动选择标志

            // 设置默认层级
            if (existingLevels.length > 0) {
                const highestLevel = existingLevels[0]; // 最高层级（数字最大，如h4=4）
                // 如果总条数超过阈值，则默认显示到上一层级
                if (headings.length > SUB_NAV_PREV_LEVEL_THRESHOLD) {
                    // 查找上一层级（比最高层级小1的层级）
                    const prevLevel = highestLevel - 1;
                    // 如果存在上一层级，则显示到上一层级；否则显示到最高层级
                    currentSubNavLevel = existingLevels.includes(prevLevel) ? prevLevel : highestLevel;
                } else {
                    // 否则显示到实际存在的最高层级（h4 > h3 > h2）
                    currentSubNavLevel = highestLevel;
                }
            }
        }

        // 清空副目录栏
        subNavBar.replaceChildren();

        // 创建标题容器（相对定位，用于放置关闭按钮）
        const titleContainer = document.createElement('div');
        titleContainer.style.cssText = 'position:relative;padding-right:24px;padding-bottom:6px;border-bottom:1px solid #eaeaea;margin-bottom:6px;';
        titleContainer.className = 'sub-nav-title-container';

        // 创建标题行容器
        const titleRow = document.createElement('div');
        titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';

        // 创建标题文本和按钮组容器
        const titleLeft = document.createElement('div');
        titleLeft.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;';

        // 创建标题文本
        const titleText = document.createElement('span');
        titleText.style.cssText = 'font-weight:bold;color:#333;font-size:14px;';
        // 如果主目录只有一项，不显示序号；否则显示序号
        const totalQuestions = navQuestions ? navQuestions.length : 0;
        titleText.textContent = totalQuestions <= 1 ? '副目录' : `副目录 ${questionIndex + 1}`;

        // 创建层级按钮组
        const levelBtnGroup = document.createElement('div');
        levelBtnGroup.style.cssText = NAV_STYLES.levelBtnGroup;

        // 创建层级按钮（只显示实际存在的层级，按钮显示顺序为 h2, h3, h4，从高到低）
        existingLevels.slice().reverse().forEach(level => {
            const btn = document.createElement('div');
            btn.textContent = `h${level}`;
            btn.dataset.level = level;

            // 设置按钮样式
            let btnStyle = NAV_STYLES.levelBtn;
            if (level === currentSubNavLevel) {
                btnStyle += NAV_STYLES.levelBtnActive;
            }
            btn.style.cssText = btnStyle;

            // 鼠标悬停效果
            btn.addEventListener('mouseenter', () => {
                if (level !== currentSubNavLevel) {
                    btn.style.cssText = btnStyle + NAV_STYLES.levelBtnHover;
                }
            });
            btn.addEventListener('mouseleave', () => {
                if (level !== currentSubNavLevel) {
                    btn.style.cssText = btnStyle + NAV_STYLES.levelBtnLeave;
                }
            });

            // 点击切换层级
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // 更新当前层级
                currentSubNavLevel = level;
                // 标记用户已手动选择层级
                isSubNavLevelManuallySet = true;

                // 更新所有按钮的样式
                levelBtnGroup.querySelectorAll('[data-level]').forEach(b => {
                    if (parseInt(b.dataset.level) === level) {
                        b.style.cssText = NAV_STYLES.levelBtn + NAV_STYLES.levelBtnActive;
                    } else {
                        b.style.cssText = NAV_STYLES.levelBtn;
                    }
                });

                // 重新渲染标题项
                renderSubNavItems();

                // 根据副目录条目数量动态设置top位置
                updateSubNavTop();
            });

            levelBtnGroup.appendChild(btn);
        });

        // 组装左侧（标题和按钮组）
        titleLeft.appendChild(titleText);
        titleLeft.appendChild(levelBtnGroup);
        titleRow.appendChild(titleLeft);
        titleContainer.appendChild(titleRow);

        // 创建位置按钮
        const positionBtn = document.createElement('div');
        positionBtn.style.cssText = NAV_STYLES.subNavPositionBtn;
        positionBtn.textContent = '位置';
        positionBtn.title = '设置副目录位置';
        positionBtn.addEventListener('mouseenter', () => {
            positionBtn.style.backgroundColor = '#f0f0f0';
        });
        positionBtn.addEventListener('mouseleave', () => {
            positionBtn.style.backgroundColor = 'transparent';
        });
        positionBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            // 创建输入框
            const input = document.createElement('input');
            input.type = 'text';
            input.value = getSubNavLeft();
            input.style.cssText = NAV_STYLES.subNavPositionInput;

            // 替换按钮为输入框
            positionBtn.style.display = 'none';
            titleContainer.appendChild(input);
            input.focus();
            input.select();

            // blur事件：保存值并更新位置
            input.addEventListener('blur', () => {
                const newLeft = input.value.trim();
                // 检查格式：需为数字+px
                const formatRegex = /^\d+(\.\d+)?px$/;
                if (newLeft && formatRegex.test(newLeft)) {
                    // 格式正确，保存到localStorage
                    setSubNavLeft(newLeft);
                    // 更新副目录的left位置
                    subNavBar.style.left = newLeft;
                } else if (newLeft) {
                    // 格式不正确，提示用户并恢复原值
                    alert('位置格式错误，请输入"数字+px"格式，例如：270px');
                    // 恢复原值
                    input.value = getSubNavLeft();
                }
                // 恢复按钮
                input.remove();
                positionBtn.style.display = 'flex';
            });

            // Enter键也触发blur
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    input.blur();
                }
            });
        });
        titleContainer.appendChild(positionBtn);

        // 创建关闭按钮
        const closeBtn = document.createElement('div');
        closeBtn.style.cssText = NAV_STYLES.subNavCloseBtn;
        closeBtn.textContent = '×';
        closeBtn.title = '关闭副目录';
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.backgroundColor = '#f0f0f0';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.backgroundColor = 'transparent';
        });
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            // 检查是否是首次点击（用GM存储标记状态）
            const firstCloseKey = `${T}subNavFirstCloseShown`;
            const hasShownFirstClose = GM_getValue(firstCloseKey, false);
            if (!hasShownFirstClose) {
                alert("这家大模型将不再显示副目录；\n若需恢复，点击主目录每条提问前的小图标即可");
                GM_setValue(firstCloseKey, true);
            }

            // 记录关闭状态
            setSubNavClosed(true);

            hideSubNavBar();
        });
        titleContainer.appendChild(closeBtn);

        // 添加到副目录栏
        subNavBar.appendChild(titleContainer);

        // 渲染标题项
        renderSubNavItems();

        // 根据副目录条目数量动态设置top位置
        updateSubNavTop();

        // 确保使用最新的left值（从localStorage读取）
        subNavBar.style.left = getSubNavLeft();

        // 显示副目录栏
        subNavBar.style.display = 'block';

        // 启动轮询更新，每10秒检查一次是否需要更新副目录
        startSubNavObserver(questionIndex);
    };

    // 获取副目录关闭状态的key
    const getSubNavClosedKey = () => {
        return `${T}subNavClosed`;
    };

    // 检查副目录是否已关闭
    const isSubNavClosed = () => {
        const key = getSubNavClosedKey();
        return localStorage.getItem(key) === 'true';
    };

    // 设置副目录关闭状态
    const setSubNavClosed = (closed) => {
        const key = getSubNavClosedKey();
        if (closed) {
            setS(key, 'true');
        } else {
            localStorage.removeItem(key);
        }
    };

    // 启动副目录轮询更新（复用 autoShowSubNav 实现）
    const startSubNavObserver = (questionIndex) => {
        // 先停止之前的轮询
        stopSubNavObserver();

        if (questionIndex < 0 || !navQuestions || questionIndex >= navQuestions.length) {
            return;
        }

        // 保存问题索引，供轮询函数使用
        const pollQuestionIndex = questionIndex;

        // 轮询间隔
        const POLL_INTERVAL = 6000;

        // 启动轮询定时器，复用 autoShowSubNav 实现更新
        subNavPollInterval = setInterval(() => {
            // 检查副目录是否还在显示或已关闭
            if (subNavBar.style.display !== 'block' || currentSubNavQuestionIndex !== pollQuestionIndex || isSubNavClosed()) {
                stopSubNavObserver();
                return;
            }

            // 复用 autoShowSubNav 实现更新
            autoShowSubNav(pollQuestionIndex);
        }, POLL_INTERVAL);
    };

    // 停止副目录轮询更新
    const stopSubNavObserver = () => {
        if (subNavPollInterval) {
            clearInterval(subNavPollInterval);
            subNavPollInterval = null;
        }
    };

    // 隐藏副目录栏
    const hideSubNavBar = () => {
        subNavBar.style.display = 'none';
        currentSubNavQuestionIndex = -1;
        // 停止内容变化监听
        stopSubNavObserver();
    };

    // 根据问题索引自动显示对应的副目录
    const autoShowSubNav = (questionIndex) => {
        if (questionIndex < 0 || !navQuestions || questionIndex >= navQuestions.length) {
            return;
        }

        // 如果已关闭，则不加载
        if (isSubNavClosed()) {
            return;
        }

        const targetEl = navQuestions[questionIndex];
        if (!targetEl || !document.body.contains(targetEl)) {
            return;
        }

        // 查找回答内容区域
        const answerContent = findAnswerContent(targetEl);
        if (!answerContent) {
            return;
        }

        // 查找标题
        const headings = findHeadingsInContent(answerContent);
        if (headings.length === 0) {
            return;
        }

        // 显示副目录栏
        // 检查是否是轮询调用（通过检查副目录栏是否已显示来判断）
        const isPolling = subNavBar.style.display === 'block' &&
                         currentSubNavQuestionIndex === questionIndex;
        showSubNavBar(questionIndex, headings, isPolling);
    };

    // 创建导航链接元素
    const createNavLink = (el, i) => {
        // 创建链接容器
        const linkContainer = document.createElement('div');
        linkContainer.className = 'tool-nav-link-container';
        linkContainer.style.cssText = NAV_STYLES.linkContainer;

        // 创建副目录小图标
        const subNavIcon = document.createElement('span');
        subNavIcon.textContent = '📖';
        subNavIcon.style.cssText = NAV_STYLES.waveIcon;
        subNavIcon.title = '显示副目录';
        subNavIcon.addEventListener('mouseenter', () => {
            subNavIcon.style.cssText = NAV_STYLES.waveIcon + NAV_STYLES.waveIconHover;
        });
        subNavIcon.addEventListener('mouseleave', () => {
            subNavIcon.style.cssText = NAV_STYLES.waveIcon + NAV_STYLES.waveIconNormal;
        });
        subNavIcon.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // 如果当前已经显示该问题的副目录，则隐藏
            if (currentSubNavQuestionIndex === i && subNavBar.style.display === 'block') {
                hideSubNavBar();
                return;
            }

            // 查找问题对应的回答内容区域
            let targetEl = el;
            if (!targetEl || !document.body.contains(targetEl)) {
                const questions = getQuestionList();
                if (questions && questions.length > i) {
                    targetEl = questions[i];
                }
            }

            if (!targetEl) {
                console.warn('问题元素不存在');
                return;
            }

            // 查找回答内容区域
            const answerContent = findAnswerContent(targetEl);
            if (!answerContent) {
                console.log('未找到回答内容区域');
                return;
            }

            // 查找标题
            const headings = findHeadingsInContent(answerContent);
            if (headings.length === 0) {
                console.log('未找到h2~h4标题');
                return;
            }

            // 清除关闭状态（恢复副目录）
            setSubNavClosed(false);

            // 显示副目录栏
            showSubNavBar(i, headings);
        });

        // 创建链接内容
        const link = document.createElement('div');
        link.className = 'tool-nav-link';
        link.style.cssText = NAV_STYLES.link;

        const indexSpan = document.createElement('span');
        indexSpan.textContent = (i + 1) + '. ';
        indexSpan.style.color = NAV_ITEM_COLOR;

        const textSpan = document.createElement('span');
        const normalizedText = normalizeQuestionText(el.textContent);
        textSpan.textContent = normalizedText;

        link.title = (i + 1) + '. ' + normalizedText;
        link.appendChild(indexSpan);
        link.appendChild(textSpan);

        // 事件监听
        link.addEventListener('mouseenter', () => link.style.backgroundColor = '#f0f0f0');
        link.addEventListener('mouseleave', () => link.style.backgroundColor = '');
        link.addEventListener('click', (e) => {
            e.preventDefault();
            // 验证元素是否存在，如果不存在则尝试重新获取
            let targetEl = el;
            const questions = getQuestionList();

            if (!targetEl || !document.body.contains(targetEl)) {
                // 元素可能已被移除或重新渲染，尝试重新获取
                if (questions && questions.length > i) {
                    targetEl = questions[i];
                }
            }


            setTimeout(function(){
                // 遍历更新所有条目文字：如果条目内容为空而questionList里的textContent非空
                if (questions && navLinks) {
                    questions.forEach((question, index) => {
                        if (index >= navLinks.length) return;

                        const linkContainer = navLinks[index];
                        const linkElement = linkContainer.querySelector('.tool-nav-link');
                        if (!linkElement) return;

                        const spans = linkElement.querySelectorAll('span');
                        if (spans.length < 2) return;

                        const textSpanElement = spans[1]; // 第二个span是文本span
                        const currentText = textSpanElement.textContent.trim();
                        const newText = normalizeQuestionText(question.textContent);

                        if (isEmpty(currentText) && !isEmpty(newText)) {
                            textSpanElement.textContent = newText;
                            linkElement.title = (index + 1) + '. ' + newText;
                        }
                    });
                }
            }, 500);

            // 如果元素存在，执行滚动
            if (targetEl && document.body.contains(targetEl)) {
                targetEl.scrollIntoView({block: 'start'});
                clickedTarget = targetEl;
                clickLockUntil = Date.now() + NAV_CLICK_LOCK_DURATION;
                clearAllHighlights();
                setLinkStyle(linkContainer, true);
                // 自动显示当前点击项对应的副目录
                if (typeof autoShowSubNav === 'function') {
                    autoShowSubNav(i);
                }
            } else {
                // 元素不存在，等待一段时间后重试
                let retryCount = 0;
                const navMaxRetries = 10;
                const retryInterval = 100;
                const retryTimer = setInterval(() => {
                    retryCount++;
                    const questions = getQuestionList();
                    if (questions && questions.length > i) {
                        const newEl = questions[i];
                        if (newEl && document.body.contains(newEl)) {
                            clearInterval(retryTimer);
                            newEl.scrollIntoView({block: 'start'});
                            clickedTarget = newEl;
                            clickLockUntil = Date.now() + NAV_CLICK_LOCK_DURATION;
                            clearAllHighlights();
                            setLinkStyle(linkContainer, true);
                            // 自动显示当前点击项对应的副目录
                            if (typeof autoShowSubNav === 'function') {
                                autoShowSubNav(i);
                            }
                            // 更新navQuestions中的元素引用
                            if (navQuestions && navQuestions[i] !== newEl) {
                                navQuestions[i] = newEl;
                                elToLink.set(newEl, linkContainer);
                            }
                        }
                    }
                    if (retryCount >= navMaxRetries) {
                        clearInterval(retryTimer);
                        console.warn('目录项跳转失败：元素未找到');
                    }
                }, retryInterval);
            }
        });

        // 组装链接容器
        linkContainer.appendChild(subNavIcon);
        linkContainer.appendChild(link);

        return linkContainer;
    };

    // 创建导航栏标题元素（包含隐藏按钮）
    const createTitle = () => {
        const title = document.createElement('div');
        title.style.cssText = NAV_STYLES.title;

        const titleText = document.createElement('span');
        titleText.textContent = '主目录';

        const hideBtn = document.createElement('span');
        hideBtn.textContent = '隐藏';
        hideBtn.style.cssText = NAV_STYLES.hideBtn;
        hideBtn.addEventListener('mouseenter', () => hideBtn.style.backgroundColor = '#f5f5f5');
        hideBtn.addEventListener('mouseleave', () => hideBtn.style.backgroundColor = '');
        hideBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setNavMinimized(true);
        });

        // 创建条数显示元素
        navCountText = document.createElement('span');
        navCountText.style.cssText = NAV_STYLES.countText;
        navCountText.style.display = 'none'; // 默认隐藏

        title.appendChild(titleText);
        title.appendChild(hideBtn);
        title.appendChild(navCountText);
        return title;
    };

    // 初始化IntersectionObserver
    const initIntersectionObserver = () => {
        try {
            navIO = new IntersectionObserver((entries) => {
                const now = Date.now();
                let nextEl = null;

                // 点击锁定期内，优先使用点击的目标
                if(now < clickLockUntil && clickedTarget) {
                    const rect = clickedTarget.getBoundingClientRect?.();
                    const nearTop = isElementNearTop(rect);
                    const inView = isElementVisible(rect, NAV_VIEWPORT_THRESHOLD);
                    if(inView || nearTop) nextEl = clickedTarget;
                }

                // 新的高亮逻辑
                if(!nextEl) {
                    // 找到所有可见的目录项，按位置排序
                    const visibleElements = getVisibleElements(navQuestions, 1.0); // 使用100%视口高度

                    if(visibleElements.length > 0) {
                        // 检查第一个可见元素的位置
                        const firstVisibleEl = visibleElements[0];
                        const rect = firstVisibleEl.getBoundingClientRect();
                        const positionPercent = getElementPositionPercent(rect);

                        // 根据位置决定高亮项
                        if(positionPercent >= 0 && positionPercent <= NAV_HIGHLIGHT_THRESHOLD) {
                            // 0~30%：高亮当前项
                            nextEl = firstVisibleEl;
                        } else if(positionPercent > NAV_HIGHLIGHT_THRESHOLD && positionPercent <= 1.0) {
                            // 30%~100%：高亮前一项
                            const currentIndex = navQuestions.indexOf(firstVisibleEl);
                            if(currentIndex > 0) {
                                nextEl = navQuestions[currentIndex - 1];
                            } else {
                                nextEl = firstVisibleEl; // 如果是第一项，仍然高亮自己
                            }
                        }
                    } else {
                        // 视野无任何目录，保持上次高亮项（不改变nextEl）
                        // 这样navLinks会保持之前的状态
                        return;
                    }
                }

                // 应用高亮
                navLinks.forEach((link, i) => setLinkStyle(link, navQuestions[i] === nextEl));
                // 自动显示当前高亮项对应的副目录
                if (nextEl && typeof autoShowSubNav === 'function') {
                    const activeIndex = navQuestions.indexOf(nextEl);
                    if (activeIndex >= 0) {
                        autoShowSubNav(activeIndex);
                    }
                }
            }, { root: null, rootMargin: '0px 0px -70% 0px', threshold: [0, 0.1, 0.5, 1] });

            navQuestions.forEach(el => {
                if(el?.tagName) try { navIO.observe(el); } catch(e) {}
            });
        } catch(e) {}
    };

    // 更新导航问题列表（重新构建导航栏）
    const updateNavQuestions = (quesList) => {
        if(isEmpty(quesList)) {
            navBar.replaceChildren();
            navBar.style.visibility = navMiniButton.style.visibility = "hidden";
            updateNavCount(); // 更新条数显示
            return;
        }

        const thisQuestions = Array.from(quesList);
        if(navQuestions
            && thisQuestions.length === navQuestions.length
            && normalizeQuestionText(thisQuestions[0].textContent) === normalizeQuestionText(navQuestions[0].textContent)) {

            refreshNavBarVisibility();
            return;
        }

        navBar.replaceChildren();
        navLinks = [];
        elToLink.clear();
        if(navIO) try { navIO.disconnect(); } catch(e) {}

        navBar.appendChild(createTitle());
        navQuestions = thisQuestions;

        navQuestions.forEach((el, i) => {
            if(!el?.tagName) return;
            const link = createNavLink(el, i);
            navBar.appendChild(link);
            navLinks.push(link);
            elToLink.set(el, link);
        });

        refreshNavBarVisibility();
        initIntersectionObserver();

        // 页面刚加载时，如果视野里没有任何目录项，则自动高亮最后一项
        setTimeout(() => {
            const visibleElements = getVisibleElements(navQuestions, 1.0);

            if(visibleElements.length === 0 && navLinks.length > 0) {
                // 视野无任何目录项，高亮最后一项
                clearAllHighlights();
                setLinkStyle(navLinks[navLinks.length - 1], true);
                // 自动显示最后一项对应的副目录
                if (typeof autoShowSubNav === 'function') {
                    autoShowSubNav(navLinks.length - 1);
                }
            }
        }, 100);
    };

    // 迷你按钮事件
    navMiniButton.addEventListener('click', (e) => {
        e.stopPropagation();
        setNavMinimized(false);
    });


    /******************************************************************************
     * ═══════════════════════════════════════════════════════════════════════
     * ║                                                                      ║
     * ║  🎛️ 10、多选面板  🎛️                                                  ║
     * ║                                                                      ║
     * ═══════════════════════════════════════════════════════════════════════
     ******************************************************************************/

    // 面板样式集中定义
    const PANEL_STYLES = {
        panel: `z-index:9999;cursor:pointer;position:fixed;right:10px;bottom:80px;max-height:400px;background:white;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);overflow-y:auto;padding:2px;display:flex;flex-direction:column;`,
        panelCompact: `min-width:120px;`,
        disable: `background:#ec7258;color:white;border-radius:6px;padding:2px 1px;`,
        item: `display:flex;align-items:center;padding:3px 0 3px 3px;border-bottom:1px solid #eee;`,
        wordSpan: `flex:1;margin-right:10px;font-size:14px;`,
        checkbox: `margin-right:1px;font-size:20px;`,
        emptyMessage: `padding:1px;text-align:center;color:#888;font-size:14px;`,
        headline: `font-weight:bold;`,
        hint: `color:#275fe6;width:0;height:0;padding-left:3px;margin-top:5px;margin-bottom:5px;border-top:8px solid transparent;border-right:8px solid #3498db;border-bottom:8px solid transparent;`
    };

    // 面板数据
    const contentContainer = document.createElement('div');
    let isCompactMode = false;
    let originalHTML = contentContainer.innerHTML;

    // 创建面板容器
    panel.style.cssText = PANEL_STYLES.panel;
    panel.id = TOOL_PANEL_ID;
    let hint = document.createElement('div');

    const DISABLE = "禁用";
    const ENABLE = "开启";
    let disable = document.createElement('div');
    disable.id = "tool-disable";
    disable.textContent = DISABLE;
    disable.style = PANEL_STYLES.disable;

    disable.addEventListener('click', (e) => disableEvent(e));

    // 根据word在words数组中的索引获取背景色
    const getItemBgColor = (word) => {
        const index = typeof word === 'number' ? word : words.indexOf(word);
        return index < 6 ? '#f0f8ff' : '#fffcf0';
    };

    // 生成单词和选择框
    let headline = document.createElement('div');
    headline.textContent = "全部模型";
    headline.style.cssText = PANEL_STYLES.headline;

    let sitesAndCurrent = getSitesAndCurrent();
    const items = []; // 收集所有item元素

    words.forEach((word, index) => {
        const item = document.createElement('div');
        item.style.cssText = PANEL_STYLES.item + `background:${getItemBgColor(index)};`;
        item.className = 'panel-item'; // 添加类名用于识别
        item.dataset.word = word; // 添加data-word属性

        const wordSpan = document.createElement('span');
        wordSpan.textContent = word;
        wordSpan.style.cssText = PANEL_STYLES.wordSpan;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `word-${word}`;
        checkbox.style.cssText = PANEL_STYLES.checkbox;

        checkbox.checked = sitesAndCurrent.includes(wordToSite[word]);

        // 添加点击事件
        checkbox.addEventListener('change', () => updateStorageSites(word));

        // 点击整个item div也能切换checkbox状态
        item.addEventListener('click', (e) => {
            // 如果点击的是checkbox本身，不重复处理
            if (e.target.tagName === 'INPUT') {
                return;
            }
            e.stopPropagation(); // 阻止冒泡到panel
            checkbox.checked = !checkbox.checked;
            updateStorageSites(word);
        });

        item.appendChild(wordSpan);
        item.appendChild(checkbox);
        items.push(item); // 收集item，稍后统一添加
    });

    // 集中DOM操作：一次性添加所有元素到 contentContainer, panel
    contentContainer.appendChild(headline);
    items.forEach(item => contentContainer.appendChild(item));
    panel.appendChild(disable);
    panel.appendChild(contentContainer);

    // 首次加载多选面板 是展开状态，后续刷新网页默认缩略状态
    if(getGV(FIRST_RUN_KEY)){
        switchToCompactMode();
    }

    // 面板相关函数
    function disableEvent(event){
        event.stopPropagation();
        if(disable.textContent === DISABLE){
            changeDisable(true);
        }else{
            changeDisable(false);
        }
    }

    function changeDisable(status){
        if(status === true){
            setGV("disable", true);
            disable.textContent = ENABLE;
            disable.style.background = "#f5a088";
            contentContainer.style.color = "lightgray";
            // 禁用状态下，缩略模式的背景色改为白色
            if(isCompactMode){
                const items = contentContainer.querySelectorAll('[data-word]');
                items.forEach(item => {
                    item.style.background = "white";
                });
            }
        }else{
            setGV("disable", false);
            disable.textContent = DISABLE;
            disable.style.background = "#ec7258";
            contentContainer.style.color = "black";
            // 恢复启用状态，缩略模式的背景色恢复为彩色
            if(isCompactMode){
                const items = contentContainer.querySelectorAll('[data-word]');
                items.forEach(item => {
                    const word = item.dataset.word;
                    item.style.background = getItemBgColor(word);
                });
            }
        }
    }

    // 从前端DOM获取面板被选中的元素，并存储
    function getSitesFromDomAndSave(){
        const checkboxes = document.querySelectorAll('input[type="checkbox"][id^="word-"]');
        const selectedSites = [];

        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                const word = checkbox.id.split('-')[1]; // 提取选中的文本
                selectedSites.push(wordToSite[word]);
            }
        });
        setGV(CHOSEN_SITE, selectedSites);
        return selectedSites;
    };

    // 从存储获取已选站点
    function getSitesOfStorage(){
        try {
            return getGV(CHOSEN_SITE) || [];
        } catch (e) {
            console.error('Failed to parse selectedSites from GV', e);
            return [];
        }
    };

    function getSitesAndCurrent() {
        let sitesOfStorage = getSitesOfStorage();
        if(!sitesOfStorage.includes(site)){
            sitesOfStorage.unshift(site);
        }
        return sitesOfStorage;
    };
    function addCurrentToStorage() {
        let sitesOfStorage = getSitesOfStorage();
        if(!sitesOfStorage.includes(site)){
            sitesOfStorage.unshift(site);
            setGV(CHOSEN_SITE, sitesOfStorage);
        }
    };

    function getSitesExcludeCurrent() {
        let sitesOfStorage = getSitesOfStorage();
        if(sitesOfStorage.includes(site)){
            sitesOfStorage = sitesOfStorage.filter(element => element !== site);
        }
        return sitesOfStorage;
    };

    // 更新存储中的已选单词数字
    function updateStorageSites(word) {
        // 只要有勾选动作，就关闭禁用模式
        changeDisable(false);

        const selectedSites = words
            .filter(word => document.getElementById(`word-${word}`)?.checked)
            .map(word => wordToSite[word]);

        setGV(CHOSEN_SITE, selectedSites);
        console.log('Current selected sites:', selectedSites);

        let isDisable = getGV("disable");
        if(isDisable){
            return;
        }
        let siteOfWord = wordToSite[word];
        if (siteOfWord!== site && selectedSites.includes(siteOfWord)) {
            let lastHeartbeat = getGV(HEART_KEY_PREFIX + siteOfWord);
            if(isEmpty(lastHeartbeat) || Date.now() - lastHeartbeat > 1000 * HIBERNATE_GAP){
                setTimeout(function(){
                    window.open(newSites[siteOfWord], '_blank');
                }, OPEN_GAP);
            }
        }
    };

    // 存储-->复选框
    function updateBoxFromStorage() {
        const selectedSites = getSitesAndCurrent();
        // console.log('Syncing checkboxes from stoage:', selectedSites);

        words.forEach(word => {
            const checkbox = document.getElementById(`word-${word}`);
            if (checkbox) {
                checkbox.checked = selectedSites.includes(wordToSite[word]);
            }
        });
    };

    // zchat特殊处理
    if(site === ZCHAT){
        let lastVisibleState = false; // 记录上一次的可见状态
        const observer = new IntersectionObserver((entries, instance) => {
            entries.forEach(entry => {
                const isCurrentlyVisible = entry.isIntersecting;
                // 状态发生变化时触发逻辑
                if (lastVisibleState === true && isCurrentlyVisible === false) {
                    document.body.appendChild(panel);
                    instance.unobserve(entry.target); // 停止观察当前元素
                }
                lastVisibleState = isCurrentlyVisible; // 更新状态记录
            });
        }, {
            threshold: 0.1 // 阈值可根据需求调整
        });
        observer.observe(panel);
    }

    // 刷新简略模式
    function reloadCompactMode(){
        if (!isCompactMode) return;

        let selectedSites = getSitesAndCurrent();
        let selectedWords = selectedSites.map(site => siteToWord[site]).filter(word => word);
        // 按照 wordConfig 的顺序排序
        selectedWords = words.filter(word => selectedWords.includes(word));
        drawCompactPanel(selectedWords);

        reloadDisableStatus();
    }

    function reloadDisableStatus(){
        let isDisable = getGV("disable");
        let status = isDisable ? true : false;
        changeDisable(status);
    }

    // 切换到简略模式
    function switchToCompactMode(){
        if (isCompactMode) return;
        reloadDisableStatus();

        // 保存原始内容
        originalHTML = contentContainer.innerHTML;

        // 记录选中的项：优先从DOM读取，如果读取不到则从存储读取
        let selectedWords = words.filter(word =>
            document.getElementById(`word-${word}`)?.checked
        );

        // 如果从DOM读取不到，则从存储读取（fallback机制）
        if (selectedWords.length === 0) {
            const selectedSites = getSitesAndCurrent();
            let wordsFromStorage = selectedSites.map(site => siteToWord[site]).filter(word => word);
            // 按照 wordConfig 的顺序排序
            selectedWords = words.filter(word => wordsFromStorage.includes(word));
        }

        if (selectedWords.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.textContent = '未选模型';
            emptyMsg.style.cssText = PANEL_STYLES.emptyMessage;
            contentContainer.replaceChildren();
            contentContainer.appendChild(emptyMsg);
        } else {
            drawCompactPanel(selectedWords);
        }

        isCompactMode = true;
        panel.style.cssText = PANEL_STYLES.panel;
    };

    // 绘制缩略模式面板
    function drawCompactPanel(selectedWords){
        contentContainer.replaceChildren();
        hint.style.cssText = PANEL_STYLES.hint;
        contentContainer.appendChild(hint);

        let isDisable = getGV("disable");
        selectedWords.forEach(word => {
            const item = document.createElement('div');
            // 禁用状态下使用白色背景，否则使用彩色背景
            const bgColor = isDisable ? 'white' : getItemBgColor(word);
            item.style.cssText = PANEL_STYLES.item + `background:${bgColor};`;
            item.dataset.word = word;

            const wordSpan = document.createElement('span');
            let alias = wordToAlias[word];
            wordSpan.textContent = alias;
            wordSpan.style.cssText = PANEL_STYLES.wordSpan;

            item.appendChild(wordSpan);
            contentContainer.appendChild(item);
        });
    }

    // 切换到原始模式
    function switchToOriginalMode() {
        if (!isCompactMode) return;

        // 恢复原始内容
        setInnerHTML(contentContainer, originalHTML);

        // 重新绑定事件
        words.forEach(word => {
            const checkbox = document.getElementById(`word-${word}`);
            if (checkbox) {
                checkbox.addEventListener('change', () => updateStorageSites(word));

                // 重新绑定item的点击事件
                const item = checkbox.closest('.panel-item');
                if (item) {
                    item.addEventListener('click', (e) => {
                        if (e.target.tagName === 'INPUT') {
                            return;
                        }
                        e.stopPropagation();
                        checkbox.checked = !checkbox.checked;
                        updateStorageSites(word);
                    });
                }
            }
        });

        // 从存储更新面板选中状态
        updateBoxFromStorage();

        isCompactMode = false;
        panel.style.cssText = PANEL_STYLES.panel;
    };

    // 点击面板切换模式
    panel.addEventListener('click', (e) => {
        // 阻止事件冒泡到document
        e.stopPropagation();

        // 如果点击的是复选框、按钮或者panel-item，不切换模式
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('.panel-item')) {
            return;
        }

        // 切换模式：缩略-->展开；展开-->缩略
        if (isCompactMode) {
            switchToOriginalMode();
        } else {
            switchToCompactMode();
        }
    });

    // 点击页面其他地方切换到简略模式
    document.addEventListener('click', (e) => {
        // 如果点击的是面板内部，不处理
        if (panel.contains(e.target)) {
            return;
        }

        // 切换到简略模式
        if(panel.style.visibility !== "hidden"){
            switchToCompactMode();
        }
    });


    /******************************************************************************
     * ═══════════════════════════════════════════════════════════════════════
     * ║                                                                      ║
     * ║  ⚠️ 11、一些工具函数  ⚠️                       ║
     * ║                                                                      ║
     * ═══════════════════════════════════════════════════════════════════════
     ******************************************************************************/

    /**
     * 使用 MutationObserver 监测元素出现（更优雅的方式）
     * @param {Function} selectorFn - 获取元素的函数
     */
    function waitForElement(selectorFn, options = {}) {
        const {
            timeout = DEFAULT_WAIT_ELEMENT_TIME,
            root = document.body,
            timeoutMsg = "等待元素出现超时"
        } = options;

        return new Promise((resolve, reject) => {
            // 先检查元素是否已经存在
            const element = selectorFn();
            if (element) {
                resolve(element);
                return;
            }

            let timeoutId;
            let observer;

            // 设置超时
            timeoutId = setTimeout(() => {
                if (observer) observer.disconnect();
                console.warn(timeoutMsg);
                reject(new Error(timeoutMsg));
            }, timeout);

            // 创建 MutationObserver 监听 DOM 变化
            observer = new MutationObserver((mutations) => {
                const element = selectorFn();
                if (element) {
                    clearTimeout(timeoutId);
                    observer.disconnect();
                    resolve(element);
                }
            });

            // 开始观察
            observer.observe(root, {
                childList: true,      // 监听子节点的添加/删除
                subtree: true,        // 监听所有后代节点
                attributes: false,    // 不监听属性变化（性能优化）
                characterData: false  // 不监听文本内容变化（性能优化）
            });
        });
    }

    // 获取当前URL
    function getUrl(){
        return window.location.href;
    }

    /**
     * 判断当前是否为最大宽度
     */
    function isMaxWidth() {
        return window.outerWidth >= screen.availWidth - 50;
    }

    // 远程HTTP请求
    function remoteHttp(remoteUrl, data){
        GM_xmlhttpRequest({
            method: "POST",
            url: remoteUrl,
            data: JSON.stringify(data),
            headers: {
                "Content-Type": "application/json"
            },
            onload: function(response) {
                console.log(response.responseText);
            },
            onerror: function(error) {
                console.error('请求失败:', error);
            }
        });
    }

    /**
     * 存储管理
     */

    // Blob --> Base64
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // Base64 --> Blob
    function base64ToBlob(base64) {
        // 移除 data URL 前缀
        const base64Data = base64.split(',')[1];
        if (!base64Data) {
            throw new Error('无效的 Base64 字符串');
        }
        const byteString = atob(base64Data);
        const mimeType = base64.split(',')[0].split(':')[1].split(';')[0] || 'image/png';

        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        // 填充字节数组
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: mimeType });
    }

    function getS(key){
        return localStorage.getItem(key);
    }
    function setS(key, val){
        localStorage.setItem(key, val);
    }

    // 油猴设置、读取共享存储
    function setGV(key, value){
        GM_setValue(key, value);
    }
    function getGV(key){
        return GM_getValue(key);
    }


    // 通用判空函数
    function isEmpty(item){
        if(item===null || item===undefined || item.length===0 || item === "null"){
            return true;
        }else{
            return false;
        }
    }


    function guid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0,
                v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // 格式化的时间
    function curDate() {
        let timer = new Date();
        let year = timer.getFullYear();
        let month = timer.getMonth() + 1; // 由于月份从0开始，因此需加1
        if (month < 10) month = "0" + month;
        let day = timer.getDate();
        if (day < 10) day = "0" + day;
        let hour = timer.getHours();
        if (hour < 10) hour = "0" + hour;
        let minute = timer.getMinutes();
        if (minute < 10) minute = "0" + minute;
        let second = timer.getSeconds();
        if (second < 10) second = "0" + second;
        return `【${hour}:${minute}:${second}】`;
    }

})();

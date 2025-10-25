// ==UserScript==
// @name         多家大模型网页同时回答
// @namespace    http://tampermonkey.net/
// @version      1.9.0
// @description  输入一次问题，就能自动在各家大模型官网同步提问，节省了到处粘贴提问并等待的麻烦。支持范围：DS，Kimi，千问，豆包，ChatGPT，Gemini，Claude，Grok。其他更多功能（例如提升网页阅读体验），见本页面下方介绍。
// @author       interest2
// @match        https://www.kimi.com/*
// @match        https://chat.deepseek.com/*
// @match        https://www.tongyi.com/*
// @match        https://chatgpt.com/*
// @match        https://www.doubao.com/*
// @match        https://chat.zchat.tech/*
// @match        https://gemini.google.com/*
// @match        https://chat.qwen.ai/*
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
    const NAV_MAX_WIDTH = "230px"; // 目录栏最大宽度
    const NAV_TOP = "20%"; // 目录栏竖向位置（上边缘距网页顶部占整体的距离）
    let MAX_QUEUE = 15; // 历史对话的记忆数量

    const version = "1.9.0";

    /**
     * 适配各站点所需代码
     * */
    // 定义站点常量
    const KIMI = 0;
    const DEEPSEEK = 1;
    const TONGYI = 2;
    const CHATGPT = 3;
    const DOUBAO = 4;
    const ZCHAT = 5;
    const GEMINI = 6;
    const QWEN = 7;
    const CLAUDE = 8;
    const GROK = 9;

    // 输入框类型分类
    const inputAreaTypes = {
        textarea: [DEEPSEEK, TONGYI, DOUBAO, QWEN, GROK],
        lexical: [KIMI, CHATGPT, ZCHAT, GEMINI, CLAUDE]
    };

    // 通用输入框选择器，两类：textarea标签、lexical
    const getTextareaInput = () => document.getElementsByTagName('textarea')[0];
    const getContenteditableInput = () => document.querySelector('[contenteditable="true"]');

    // 选择器配置
    const selectors = {
        // 已提问的列表
        questionList: {
            [KIMI]: () => document.getElementsByClassName("user-content"),
            [DEEPSEEK]: () => filterQuestions(document.getElementsByClassName("ds-message")),
            [TONGYI]: () => document.querySelectorAll('[class^="bubble-"]'),
            [CHATGPT]: () => document.querySelectorAll('[data-message-author-role="user"]'),
            [ZCHAT]: () => document.querySelectorAll('[data-message-author-role="user"]'),
            [DOUBAO]: () => filterQuestions(document.querySelectorAll('[data-testid="message_text_content"]')),
            [GEMINI]: () => document.getElementsByTagName('user-query'),
            [QWEN]: () => document.getElementsByClassName("user-message-content"),
            [CLAUDE]: () => document.querySelectorAll('[data-testid="user-message"]'),
            [GROK]: () => document.querySelectorAll('div.items-end .message-bubble')
        },
        // 输入框分两类处理
        inputArea: {
            ...Object.fromEntries(inputAreaTypes.textarea.map(site => [site, getTextareaInput])),
            ...Object.fromEntries(inputAreaTypes.lexical.map(site => [site, getContenteditableInput]))
        },
        // 输入框里的发送按钮
        sendBtn: {
            [KIMI]: () => document.getElementsByClassName('send-button')[0],
            [DEEPSEEK]: () => {
                var btns = document.querySelectorAll('[role="button"]');
                return btns[btns.length - 1];
            },
            [TONGYI]: () => document.querySelectorAll('[class^="operateBtn-"], [class*=" operateBtn-"]')[0],
            [CHATGPT]: () => document.getElementById('composer-submit-button'),
            [ZCHAT]: () => document.getElementById('composer-submit-button'),
            [DOUBAO]: () => document.getElementById('flow-end-msg-send'),
            [GEMINI]: () => document.querySelector('button.send-button'),
            [QWEN]: () => document.getElementById('send-message-button'),
            [CLAUDE]: () => document.querySelector('[aria-label^="Send"]'),
            [GROK]: () => document.querySelector('button[type="submit"]')
        }
    };

    // url里关键词与各站点的对应关系
    const keywords = {
        "kimi": KIMI,
        "deepseek": DEEPSEEK,
        "tongyi": TONGYI,
        "chatgpt": CHATGPT,
        "doubao": DOUBAO,
        "zchat": ZCHAT,
        "gemini": GEMINI,
        "qwen": QWEN,
        "claude": CLAUDE,
        "grok": GROK
    };

    // 各家大模型的网址（新对话，历史对话的前缀）
    const webSites = {
        [KIMI]: ["https://www.kimi.com/", "chat/"],
        [DEEPSEEK]: ["https://chat.deepseek.com/", "a/chat/s/"],
        [TONGYI]: ["https://www.tongyi.com/", "?sessionId="],
        [CHATGPT]: ["https://chatgpt.com/", "c/"],
        [DOUBAO]: ["https://www.doubao.com/chat", "/"],
        [ZCHAT]: ["https://chat.zchat.tech/", "c/"],
        [GEMINI]: ["https://gemini.google.com/app", "/"],
        [QWEN]: ["https://chat.qwen.ai/", "c/"],
        [CLAUDE]: ["https://claude.ai/chat", "/"],
        [GROK]: ["https://grok.com/", "c/"]
    };
    const newSites = Object.fromEntries(
        Object.entries(webSites).map(([key, [baseUrl]]) => [key, baseUrl])
    );
    const historySites = Object.fromEntries(
        Object.entries(webSites).map(([key, [baseUrl, suffix]]) => [key, baseUrl + suffix])
    );

    // 多选面板配置（各站点的全称、简称）
    let wordConfig = [
        { site: DEEPSEEK, word: 'DeepSeek', alias: 'D'},
        { site: KIMI, word: 'Kimi', alias: 'K' },
        { site: TONGYI, word: '通义千问', alias: '通' },
        { site: QWEN, word: 'Qwen', alias: 'Q' },
        { site: DOUBAO, word: '豆包', alias: '豆' },
        { site: CHATGPT, word: 'ChatGPT (官网)', alias: 'C' },
        { site: ZCHAT, word: 'ChatGPT (zchat)', alias: 'Z' },
        { site: GEMINI, word: 'Gemini', alias: 'G' },
        { site: CLAUDE, word: 'Claude', alias: 'Cl' },
        { site: GROK, word: 'Grok', alias: 'Gr' }
    ];

    // 隐藏输入框及周边区域，所需隐藏的元素，是输入框本体的第几层父元素？以下数字即层数（后续应改为可视化配置）
    const inputAreaHideParentLevel = {
        [KIMI]: 4,
        [DEEPSEEK]: 5,
        [TONGYI]: 6,
        [CHATGPT]: 10,
        [DOUBAO]: 11,
        [ZCHAT]: 10,
        [GEMINI]: 9,
        [QWEN]: 9,
        [CLAUDE]: 6,
        [GROK]: 7
    };

    // 表示当前站点的变量
    let site = 0;
    let url = window.location.href;

    // 根据当前网址关键词，设置site值
    for (const keyword in keywords) {
        if (url.indexOf(keyword) > -1) {
            site = keywords[keyword];
            break;
        }
    }

    // 过滤出问题列表（偶数索引元素）
    const filterQuestions = (elements) => {
        if (!isEmpty(elements)) {
            let elementsArray = Array.from(elements);
            return elementsArray.filter((item, index) => index % 2 === 0);
        }
        return [];
    };


    // 获取元素的抽象方法
    function getQuestionList() {
        const selector = selectors.questionList[site];
        return selector ? selector() : [];
    }

    function getInputArea(site) {
        const selector = selectors.inputArea[site];
        return selector ? selector() : null;
    }

    function getSendButton(site) {
        const selector = selectors.sendBtn[site];
        return selector ? selector() : null;
    }


    // 系统功能配置
    const MAX_PLAIN = 50; // localStorage存储的问题原文的最大长度。超过则存哈希
    const HASH_LEN = 16; // 问题的哈希长度
    const checkGap = 100;
    const maxRetries = 150;
    const OPEN_GAP = 300; // 打开网页的间隔
    const HIBERNATE_GAP = 600; // 单位：秒
    let testLocalFlag = 0;

    // 存储时的特征词
    const T = "tool-";
    const QUEUE = "tool-queue";
    const LEN = "len";
    const LAST_Q = "lastQ";
    const UID_KEY = "uid";
    const DEFAULT_DISPLAY_KEY = "defaultDisplay";
    const HEART_KEY_PREFIX ="lastHeartbeat-";

    let DOMAIN = "https://www.ratetend.com:5001";
    let testDOMAIN = "http://localhost:8002";
    const DEVELOPER_USERID = "7bca846c-be51-4c49-ba2b6"
    const TEST_KIMI_WIDTH = "90%";

    let userid = getGV("userid");
    if(isEmpty(userid)){
        userid = guid();
        setGV("userid", userid);

        // 本地调试用，连接本地服务器
    }else{
        if(userid === DEVELOPER_USERID){
            MAX_QUEUE = 15;
            if(testLocalFlag === 1){
                DOMAIN = testDOMAIN;
            }
        }
    }

    setTimeout(developTest, 2000);
    function developTest(){
        // kimi表格太窄，脚本作者自测调大用
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

    // 面板数据
    const CHOSEN_SITE = "chosenSite";
    const panel = document.createElement('div');
    const contentContainer = document.createElement('div');
    let panelDelay = site === ZCHAT ? 500 : 50;

    // 模式切换相关变量
    let isCompactMode = false;
    let originalHTML = contentContainer.innerHTML;

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

    // 从url提取各大模型网站的对话唯一标识
    function getChatId(){
        let url = getUrl();
        if(isEmpty(url)){
            return "";
        }
        if(site === DOUBAO && url.indexOf("local") > -1){
            return "";
        }
        // 各站点 url 里对话ID的正则表达式模式(统一共用版)，16~37位的数字、字母、短横杠
        const GENERAL_PATTERN = /[a-zA-Z0-9-]{16,37}/;
        const regex = new RegExp(GENERAL_PATTERN);
        let ret = url.match(regex);
        if(isEmpty(ret)){
            return "";
        }
        return ret[0];
    }

    function getUrl(){
        return window.location.href;
    }


    // 面板样式集中定义
    const PANEL_STYLES = {
        panel: `cursor:pointer;position:fixed;right:10px;bottom:80px;max-height:400px;background:white;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);z-index:99999999;overflow-y:auto;padding:2px;display:flex;flex-direction:column;`,
        panelCompact: `min-width:120px;`,
        disable: `background:#ec7258;color:white;border-radius:6px;padding:2px 0;`,
        item: `display:flex;align-items:center;padding:3px 0 3px 3px;border-bottom:1px solid #eee;`,
        wordSpan: `flex:1;margin-right:5px;font-size:14px;`,
        checkbox: `margin-right:1px;font-size:20px;`,
        emptyMessage: `padding:1px;text-align:center;color:#888;font-size:14px;`,
        headline: `font-weight:bold;`,
        hint: `color:#275fe6;width:0;height:0;padding-left:3px;margin-top:5px;margin-bottom:5px;border-top:8px solid transparent;border-right:8px solid #3498db;border-bottom:8px solid transparent;`
    };


    // 给发送环节加锁。能否不要这个锁？不能，因为send环节是异步轮询，新问题来时send未必轮询结束
    let sendLock = false;
    // 页面加载发送一次心跳
    setGV(HEART_KEY_PREFIX + site, Date.now());

    let questionBeforeJump = getS("questionBeforeJump");
    if(!isEmpty(questionBeforeJump)){
        console.log("页面刚打开，处理跳转信息");
        receiveNew();
    }

    /**
     * 主从节点的逻辑
     */

    // 发送端
    function masterCheckNew(lastestQ){
        reloadCompactMode();

        if(sendLock){
            return;
        }
        if(isEmpty(lastestQ)){
            return;
        }
        let masterId = getChatId();
        let lastQuestion = hgetS(T + masterId, LAST_Q);

        if(!isEmpty(lastQuestion) && isEqual(lastestQ, lastQuestion)){
            return;
        }
        masterReq(masterId, lastestQ);
    };

    function masterReq(masterId, lastestQ){
        let uid = hgetS(T + masterId, UID_KEY);
        if(isEmpty(uid)){
            uid = guid();
            hsetS(T + masterId, UID_KEY, uid);
        }

        let msg = {
            uid: uid,
            question: lastestQ,
            date: Date.now()
        };
        console.log(msg);
        setGV("msg", msg);
        hsetS(T + masterId, LAST_Q, getQuesOrHash(lastestQ));

        let uidJson = getGV(uid);
        // 若json非空，则其中一定有首次提问的主节点的信息；
        // 故json若空则必为首次，只有首次会走如下逻辑
        if(isEmpty(uidJson)){
            uidJson = {};
            uidJson[site] = masterId;
            console.log("master print uidJson: "+JSON.stringify(uidJson));
            setGV(uid, uidJson);

            // 存储管理（删除与添加）
            dequeue();
            enqueue(masterId);
        }

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

        let openCount = 0;
        sites.forEach(site => {
            let lastHeartbeat = getGV(HEART_KEY_PREFIX + site);
            // 如果从节点 xx 秒没有更新心跳时刻，则认为已经关闭，需打开
            if(isEmpty(lastHeartbeat) || Date.now() - lastHeartbeat > 1000 * HIBERNATE_GAP){
                openCount++;
                setTimeout(function(){
                    window.open(newSites[site], '_blank');
                }, OPEN_GAP);
            }
        });

    }

    function remoteHttp(remoteUrl, data){
        GM_xmlhttpRequest({
            method: "POST",
            url: remoteUrl,
            data: JSON.stringify(data),
            headers: {
                "Content-Type": "application/json"
            },
            onload: function(response) {
                let responseText = response.responseText;
                if(responseText === "1"){
                    setTimeout(showAppreciatePopup, 300);
                }
                // console.log(response.responseText);
            },
            onerror: function(error) {
                console.error('请求失败:', error);
            }
        });
    }


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
            // 假定新的提问出现时，上次的提问已经发送出去，故sendLock是已解锁，可执行receiveNew
            receiveNew();
        }
    });

    function receiveNew(){
        if(sendLock){
            return;
        }
        let msg = getGV("msg");
        let curSlaveId = getChatId();

        let questionBeforeJump = getS("questionBeforeJump");

        // 如果是经跳转而来，无需处理主节点信息，直接从缓存取对话内容
        if(!isEmpty(questionBeforeJump)){
            console.log("questionBeforeJump: " + questionBeforeJump);
            questionBeforeJump = JSON.parse(questionBeforeJump);
            let cachedQuestion = questionBeforeJump[0];
            let cachedUid = questionBeforeJump[1];

            let cachedSlaveId = "";
            if(!isEmpty(curSlaveId)){
                cachedSlaveId = questionBeforeJump[2];
                if(curSlaveId !== cachedSlaveId){
                    setS("questionBeforeJump", "");
                    return;
                }
                hsetS(T + curSlaveId, LAST_Q, getQuesOrHash(cachedQuestion));
            }

            // 清空跳转用的缓存
            setS("questionBeforeJump", "");
            console.log(curDate() + "h1 send");
            abstractSend(cachedQuestion, cachedSlaveId);

            if(isEmpty(curSlaveId)){
                setUid(cachedUid, cachedQuestion);
            }
            return;
        }

        let uid = msg.uid;
        let targetUrl = "";
        let slaveIdFlag = false;
        let slaveId = "";
        let uidJson = getGV(uid);
        let lastQuestionOfComingSlaveId = "";

        let question = msg.question;
        // 来者消息的uid，是否关联了从节点的chatId？
        if(!isEmpty(uidJson)){
            // console.log("uidJson " + JSON.stringify(uidJson));
            slaveId = uidJson[site];
            if(!isEmpty(slaveId)){
                lastQuestionOfComingSlaveId = hgetS(T + slaveId, LAST_Q);
                // console.log("lastQuestionOfComingSlaveId "+lastQuestionOfComingSlaveId);

                if(isEqual(question, lastQuestionOfComingSlaveId)){
                    return;
                }
                slaveIdFlag = true;
            }
        }

        let curIdFlag = !isEmpty(curSlaveId);
        // 从节点已进行过来者的uid对应的对话
        if(slaveIdFlag){
            // 当前页面有chatId
            if(curIdFlag){
                // chatId相同则对话，不同则跳转
                if(curSlaveId === slaveId){
                    console.log("h2 send", curDate());
                    hsetS(T + curSlaveId, LAST_Q, getQuesOrHash(question));
                    abstractSend(question, curSlaveId);
                }else{
                    targetUrl = historySites[site] + slaveId;
                }
                // 当前页面是空白，需跳转
            }else{
                targetUrl = historySites[site] + slaveId;
            }
            // 对从节点而言是新对话
        }else{
            // 当前页面有chatId，则跳转空白页
            if(curIdFlag){
                // setS("gotoNewPage-"+curSlaveId, JSON.stringify(uidJson));
                targetUrl = newSites[site];
                // 当前页面已经是空白页
            }else{
                console.log("h3 send", curDate());
                abstractSend(question, "");
                setUid(uid, question);
            }
        }
        if(!isEmpty(targetUrl)){
            let jumpArray = [question, uid, slaveId];
            setS("questionBeforeJump", JSON.stringify(jumpArray));
            window.location.href = targetUrl;
        }
    }


    /**
     * 异步轮询检查环节
     */

    // 设置uid
    function setUid(uid, question){
        let intervalId;
        let count = 0;
        let waitTime = 15000;
        if(site === CHATGPT){
            waitTime *= 2;
        }

        console.log("ready to setUid");
        intervalId = setInterval(function() {
            count ++;
            if(count > waitTime / checkGap){
                console.log("setUid超时");
                sendLock = false;
                clearInterval(intervalId);
                return;
            }
            let chatId = getChatId();
            if (!isEmpty(chatId)) {

                let uidInterval;
                let innerCount = 0;

                uidInterval = setInterval(function() {
                    innerCount ++;
                    if(innerCount > 5000 / checkGap){
                        clearInterval(uidInterval);
                        return;
                    }
                    let uidLock = getGV("uidLock");
                    if(isEmpty(uidLock) || uidLock === false){
                        clearInterval(uidInterval);

                        // 读取uidJson前加锁
                        setGV("uidLock", true);
                        let uidJson = getGV(uid);
                        if(!isEmpty(uidJson)){
                            if(isEmpty(uidJson[site])){
                                uidJson[site] = chatId;
                            }
                        }else{
                            uidJson = {};
                            uidJson[site] = chatId;
                        }
                        // 更新完uidJson才能解锁
                        setGV(uid, uidJson);
                        setGV("uidLock", false);
                        setS("uid-" + uid, JSON.stringify(uidJson));
                    }else{
                        console.log("uidLock已存在，稍后重试");
                    }
                }, checkGap);

                // 照理说下面的逻辑应在上面的setGV成功后再执行，但这样得写两遍，且理论上一定成功，故放这。
                hsetS(T + chatId, LAST_Q, getQuesOrHash(question));
                hsetS(T + chatId, UID_KEY, uid);

                sendLock = false;
                console.log("setUid finish", curDate());

                // 存储管理（删除与添加）
                dequeue();
                enqueue(chatId);

                clearInterval(intervalId);
            }
        }, checkGap);
    }

    // ① 检查textArea存在 ② 检查sendBtn存在 ③ 检查问题列表长度是否加一
    function abstractSend(content, chatId){
        updateBoxFromStorage();

        let intervalId;
        let count = 0;
        sendLock = true;

        intervalId = setInterval(function() {
            count ++;
            if(count > 5000 / checkGap){
                clearInterval(intervalId);
            }
            const inputArea = getInputArea(site);
            if (!isEmpty(inputArea)) {
                clearInterval(intervalId);
                sendContent(inputArea, content, chatId);
            }
        }, checkGap);
    }

    function sendContent(editor, content, chatId){
        // 当豆包是新对话，元素不可见会异常，故适当延迟
        let sendGap = (site === DOUBAO && isEmpty(chatId)) ? 1500 : 100;
        setTimeout(function(){
            // 输入框粘贴文字，大致分两类处理。其中第一类里 kimi 特殊处理
            //  第一类（lexical）
            if(inputAreaTypes.lexical.includes(site)){
                if([KIMI].includes(site)){
                    editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: content }));
                }else {
                    const pTag = editor.querySelector('p');
                    pTag.textContent = content;
                }
                //  第二类（textarea 标签）
            }else if(inputAreaTypes.textarea.includes(site)){
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype,
                    'value'
                ).set;
                nativeInputValueSetter.call(editor, content);
                // 触发 input 事件
                editor.dispatchEvent(new Event('input', { bubbles: true }));
            }
            clickAndCheck(chatId);
        }, sendGap);
    }

    function clickAndCheck(chatId) {
        let tryCount = 0;
        console.log(curDate() + "h1 click");

        const checkBtnInterval = setInterval(() => {
            // 检查sendBtn存在
            let sendBtn = getSendButton(site);
            if (!isEmpty(sendBtn)) {
                clearInterval(checkBtnInterval);

                // 如果输入有候选词列表，需要先点击页面空白处、再点击发送
                setTimeout(function(){
                    document.body.click();
                    setTimeout(function(){
                        console.log(curDate() + "h2 click");
                        sendBtn.click();
                        setTimeout(function(){
                            let areaCheck = getInputArea(site);
                            let areaCheckContent = getInputContent(areaCheck);
                            if(!isEmpty(areaCheckContent)){
                                console.log(curDate() + "h3 click");
                                sendBtn.click();
                            }
                        }, 1000);
                    }, 300);
                }, 200);
                checkSendStatus();
            } else {
                tryCount++;
                if (tryCount > maxRetries) {
                    clearInterval(checkBtnInterval);
                    sendLock = false;
                    console.log("tryCount "+tryCount + " sendBtn "+isEmpty(sendBtn));
                    console.warn("sendBtn未找到或未发送成功，超时");
                    return;
                }
            }
        }, checkGap);
    }

    function checkSendStatus() {
        let tryCount = 0;

        const checkInterval = setInterval(() => {
            tryCount++;

            let inputArea = getInputArea(site);
            let areaContent = getInputContent(inputArea);
            // 如果输入框内容为空，表明发送成功；否则继续轮询；轮询结束仍未成功则清空
            if(isEmpty(areaContent)){
                clearInterval(checkInterval);
                sendLock = false;

            } else if (tryCount > maxRetries) {
                console.log("tryCount "+tryCount);
                clearInterval(checkInterval);
                console.warn("未符合判据，超时");
                sendLock = false;
                location.reload()
            }
        }, checkGap);


    }

    /**
     * 监听新的提问：监听输入框回车事件、发送按钮点击事件
     */

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

    // 轮询等待masterId非空，最多等待15秒
    function waitForMasterIdAndCall(question) {
        let tryCount = 0;
        const maxTries = 15000 / checkGap; // 15秒 / 轮询间隔

        const intervalId = setInterval(function() {
            tryCount++;
            const masterId = getChatId();

            if (!isEmpty(masterId)) {
                clearInterval(intervalId);
                console.log("masterId已获取: " + masterId);
                masterCheckNew(question);
            } else if (tryCount > maxTries) {
                clearInterval(intervalId);
                console.warn("等待masterId超时，15秒内未获取到");
            }
        }, checkGap);
    }

    // 监听发送按钮点击事件和回车键
    let sendBtnListenerAdded = false;
    let inputAreaListenerAdded = false;
    let pendingQuestion = null; // 临时存储按下时的问题
    let lastUrl = window.location.href; // 记录上次的URL
    let lastChatId = getChatId(); // 记录上次的chatId
    let cachedInputContent = ""; // 缓存的输入框内容

    function addSendButtonListener() {
        const sendBtn = getSendButton(site);
        const inputArea = getInputArea(site);

        if (!isEmpty(sendBtn) && !sendBtnListenerAdded) {
            // 给元素添加标记，用于检测元素是否被替换
            sendBtn.setAttribute('data-listener-added', 'true');

            // 鼠标按下（记录输入框内容）
            sendBtn.addEventListener('mousedown', function() {
                const inputArea = getInputArea(site);
                if (!isEmpty(inputArea)) {
                    const lastestQ = getInputContent(inputArea);
                    console.log("mousedown - lastestQ: "+lastestQ);
                    console.log("mousedown - cachedInputContent: "+cachedInputContent);
                    // 如果lastestQ为空，则使用缓存的内容
                    const questionToUse = isEmpty(lastestQ) ? cachedInputContent : lastestQ;
                    if (!isEmpty(questionToUse)) {
                        pendingQuestion = questionToUse;
                        console.log("mousedown - pendingQuestion: "+pendingQuestion);
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
                        waitForMasterIdAndCall(questionToSend);
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
                // 单纯的 Enter 键，不带任何修饰键
                if (event.key === 'Enter' && !hasModifierKey(event)) {
                    const lastestQ = getInputContent(inputArea);
                    console.log("lastestQ: "+lastestQ);
                    const questionToUse = isEmpty(lastestQ) ? cachedInputContent : lastestQ;
                    if (!isEmpty(questionToUse)) {
                        setTimeout(function() {
                            waitForMasterIdAndCall(questionToUse);
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
        const sendBtn = getSendButton(site);
        const inputArea = getInputArea(site);

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

    // 监听URL变化，重新添加监听器
    function checkUrlChange() {
        const currentUrl = window.location.href;
        const currentChatId = getChatId();

        if (currentUrl !== lastUrl) {
            // 如果之前chatId为空，现在非空，说明是在同一页面生成了chatId，不需要重新添加
            if (isEmpty(lastChatId) && !isEmpty(currentChatId)) {
                console.log("chatId从空变为非空，无需重新添加监听器");
                lastUrl = currentUrl;
                lastChatId = currentChatId;
                return;
            }

            console.log("URL已变化，重新添加监听器");
            lastUrl = currentUrl;
            lastChatId = currentChatId;
            sendBtnListenerAdded = false;
            inputAreaListenerAdded = false;
            pendingQuestion = null;
            setTimeout(addSendButtonListener, 500);
        }
    }

    // 定期检查URL变化和监听器完整性
    setInterval(function() {
        checkUrlChange();
        checkListenerIntegrity();
        setGV(HEART_KEY_PREFIX + site, Date.now());

        if(isEmpty(getChatId())){
            updateNavQuestions();
            return;
        }

        let questions = getQuestionList();
        updateNavQuestions(questions);

    }, 1500);


    /**
     * 多选面板
     */

    // 创建面板容器
    panel.style.cssText = PANEL_STYLES.panel;
    let hint = document.createElement('div');

    const DISABLE = "禁用";
    const ENABLE = "开启";
    let disable = document.createElement('div');
    disable.id = "tool-disable";
    disable.textContent = DISABLE;
    disable.style = PANEL_STYLES.disable;
    panel.appendChild(disable);

    disable.addEventListener('click', (e) => disableEvent(e));

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
            contentContainer.style.color = "lightgray";
            // hint.style.borderRight = "8px solid #ffffff";
        }else{
            setGV("disable", false);
            disable.textContent = DISABLE;
            contentContainer.style.color = "black";
            // hint.style.borderRight = "8px solid #3498db";
        }
    }


    // 存储原始内容的容器
    panel.appendChild(contentContainer);

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

    // 生成单词和选择框
    let headline = document.createElement('div');
    headline.textContent = "全部模型";
    headline.style.cssText = PANEL_STYLES.headline;
    contentContainer.appendChild(headline);

    let sitesAndCurrent = getSitesAndCurrent();

    words.forEach(word => {
        const item = document.createElement('div');
        item.style.cssText = PANEL_STYLES.item;

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

        item.appendChild(wordSpan);
        item.appendChild(checkbox);
        contentContainer.appendChild(item);
    });

    // zchat特殊处理
    if(site === ZCHAT){
        // if(site === ZCHAT && getGV(DEFAULT_DISPLAY_KEY) === true){
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

    /**
     * 输入框的显示/隐藏切换功能
     */
    // 切换按钮样式集中定义
    const TOGGLE_STYLES = {
        button: `font-size:14px;padding:3px;position:fixed;right:10px;bottom:35px;cursor:pointer;background:#ec7258;color:white;border:1px solid #ddd;border-radius:30%;box-shadow:0 4px 12px rgba(0,0,0,0.2);z-index:99999999;display:flex;align-items:center;justify-content:center;`
    };

    const toggleButton = document.createElement('div');
    toggleButton.style.cssText = TOGGLE_STYLES.button;
    toggleButton.textContent = '隐藏';
    toggleButton.title = '临时隐藏输入框获得更大的视野高度';

    const getNthParent = (el, n) => n > 0 ? getNthParent(el?.parentElement, n - 1) : el;

    // 按钮点击事件 - 切换面板显示/隐藏
    toggleButton.addEventListener('click', (e) => {
        let inputArea = getInputArea(site);
        let aroundInputArea = getNthParent(inputArea, inputAreaHideParentLevel[site]);

        e.stopPropagation();
        if (aroundInputArea.style.display === 'none') {
            aroundInputArea.style.display = 'flex';
            toggleButton.textContent = '隐藏';
            toggleButton.style.background = '#ec7258';
        } else {
            aroundInputArea.style.display = 'none';
            toggleButton.textContent = '显示';
            toggleButton.style.background = '#999';
        }
    });


    /**
     * 目录导航功能
     */

    const NAV_ITEM_COLOR = "#333";
    // 目录导航相关常量
    const NAV_HIGHLIGHT_THRESHOLD = 0.3; // 目录高亮阈值（0~30%高亮当前项，30%~100%高亮前一项）
    const NAV_VIEWPORT_THRESHOLD = 0.9; // 可视区域阈值（90%）
    const NAV_NEAR_TOP_THRESHOLD = 24; // 接近顶部阈值（像素）
    const NAV_CLICK_LOCK_DURATION = 1200; // 点击锁定持续时间（毫秒）

    // 样式常量
    const NAV_STYLES = {
        navBar: `position:fixed;visibility:hidden;top:${NAV_TOP};right:15px;max-width:${NAV_MAX_WIDTH};min-width:150px;background:rgba(255,255,255,0.95);border:1px solid #ccc;border-radius:6px;padding:5px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.15);max-height:100vh;overflow-y:auto;box-sizing:border-box;`,
        miniButton: `position:fixed;top:${NAV_TOP};right:15px;color:${NAV_ITEM_COLOR};border:1px solid #ddd;border-radius:8px;padding:2px 8px;font-size:14px;font-weight: bold;cursor:pointer;z-index:2147483647;visibility:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.15);user-select:none;`,
        link: `width:100%;padding:4px 5px;cursor:pointer;color:#333;font-size:14px;line-height:1.5;white-space:normal;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word;max-height:calc(1.9em * 2);box-sizing:border-box;`,
        title: `display:flex;align-items:center;justify-content:flex-start;gap:6px;font-weight:bold;color:#333;padding:4px 5px;border-bottom:1px solid #eaeaea;margin-bottom:4px;`,
        hideBtn: `font-weight:normal;color:#666;font-size:12px;padding:2px 6px;border:1px solid #ddd;border-radius:10px;cursor:pointer;user-select:none;`
    };

    // 弹窗样式常量
    const POPUP_STYLES = {
        overlay: `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:999999999;display:flex;justify-content:center;align-items:center;padding:20px;box-sizing:border-box;`,
        modal: `position:relative;background:white;border-radius:12px;padding:20px;max-width:30vw;max-height:50vh;width:auto;height:auto;box-shadow:0 8px 32px rgba(0,0,0,0.3);display:flex;flex-direction:column;align-items:center;overflow:hidden;box-sizing:border-box;`,
        closeBtn: `position:absolute;top:10px;right:15px;background:none;border:none;font-size:24px;cursor:pointer;color:#666;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:background-color 0.2s;z-index:1;`,
        imgContainer: `width:100%;height:100%;display:flex;justify-content:center;align-items:center;overflow:hidden;`,
        img: `max-width:calc(30vw - 60px);max-height:calc(50vh - 200px);width:auto;height:auto;object-fit:contain;border-radius:8px;display:block;`,
        errorText: `color:#666;text-align:center;`,
        titleText: `font-size:20px;font-weight:bold;color:#333;text-align:center;margin-bottom:15px;padding:10px 15px;border-bottom:1px solid #eee;line-height:1.4;word-wrap:break-word;white-space:normal;max-width:100%;`,
        buttonContainer: `display:flex;justify-content:center;gap:10px;margin-top:15px;padding-top:15px;border-top:1px solid #eee;width:100%;`,
        optionButton: `background:#fff;border:1px solid #ddd;border-radius:6px;padding:8px 16px;font-size:14px;color:#333;cursor:pointer;transition:all 0.2s;min-width:80px;text-align:center;`,
        primaryButton: `background:#ec7258;border:1px solid #ec7258;border-radius:6px;padding:10px 20px;font-size:14px;color:#fff;cursor:pointer;transition:all 0.2s;min-width:90px;text-align:center;font-weight:bold;box-shadow:0 2px 4px rgba(0,123,255,0.3);`,
        secondaryButton: `background:#f8f9fa;border:1px solid #dee2e6;border-radius:6px;padding:8px 16px;font-size:13px;color:#6c757d;cursor:pointer;transition:all 0.2s;min-width:80px;text-align:center;`,
        toast: `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:white;padding:15px 25px;border-radius:8px;font-size:16px;font-weight:bold;z-index:999999999;animation:toastFadeIn 0.3s ease-out;`
    };

    // 创建导航元素
    const navBar = document.createElement('div');
    navBar.id = "tool-nav-bar";
    navBar.style.cssText = NAV_STYLES.navBar;

    const navMiniButton = document.createElement('div');
    navMiniButton.textContent = '目录';
    navMiniButton.style.cssText = NAV_STYLES.miniButton;

    // 状态变量
    let navQuestions, navLinks = [], navIO, elToLink = new Map();
    let clickedTarget = null, clickLockUntil = 0, scrollDebounceTimer;

    // 从localStorage读取最小化状态，默认为false
    let navMinimized = localStorage.getItem(T + 'navMinimized') === 'true';

    // 设置导航链接的样式（高亮或普通状态）
    const setLinkStyle = (link, isActive) => {
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

    // 按位置排序元素（优化性能，减少DOM查询）
    const sortElementsByPosition = (elements) => {
        // 先获取所有rect，避免在排序过程中重复查询
        const elementsWithRect = elements.map(el => ({
            el,
            rect: el.getBoundingClientRect()
        }));

        return elementsWithRect
            .sort((a, b) => a.rect.top - b.rect.top)
            .map(item => item.el);
    };

    // 刷新导航栏的显示状态（显示/隐藏/最小化）
    const refreshNavBarVisibility = () => {
        const root = document.body || document.documentElement;
        if(!root.contains(navMiniButton)) root.appendChild(navMiniButton);

        const linkCount = navBar.querySelectorAll('.tool-nav-link').length;
        if(linkCount === 0) {
            navBar.style.visibility = navMiniButton.style.visibility = "hidden";
            return;
        }

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
        localStorage.setItem(T + 'navMinimized', navMinimized.toString());
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

    // 创建导航链接元素
    const createNavLink = (el, i) => {
        const link = document.createElement('div');
        link.className = 'tool-nav-link';
        link.style.cssText = NAV_STYLES.link;

        const indexSpan = document.createElement('span');
        indexSpan.textContent = (i + 1) + '. ';
        indexSpan.style.color = NAV_ITEM_COLOR;

        const textSpan = document.createElement('span');
        textSpan.textContent = el.textContent;

        link.title = (i + 1) + '. ' + el.textContent;
        link.appendChild(indexSpan);
        link.appendChild(textSpan);

        // 事件监听
        link.addEventListener('mouseenter', () => link.style.backgroundColor = '#f0f0f0');
        link.addEventListener('mouseleave', () => link.style.backgroundColor = '');
        link.addEventListener('click', (e) => {
            e.preventDefault();
            el.scrollIntoView({block: 'start'});
            clickedTarget = el;
            clickLockUntil = Date.now() + NAV_CLICK_LOCK_DURATION;
            clearAllHighlights();
            setLinkStyle(link, true);
        });

        return link;
    };

    // 创建导航栏标题元素（包含隐藏按钮）
    const createTitle = () => {
        const title = document.createElement('div');
        title.style.cssText = NAV_STYLES.title;

        const titleText = document.createElement('span');
        titleText.textContent = '目录';

        const hideBtn = document.createElement('span');
        hideBtn.textContent = '隐藏';
        hideBtn.style.cssText = NAV_STYLES.hideBtn;
        hideBtn.addEventListener('mouseenter', () => hideBtn.style.backgroundColor = '#f5f5f5');
        hideBtn.addEventListener('mouseleave', () => hideBtn.style.backgroundColor = '');
        hideBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setNavMinimized(true);
        });

        title.appendChild(titleText);
        title.appendChild(hideBtn);
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
            }, { root: null, rootMargin: '0px 0px -70% 0px', threshold: [0, 0.1, 0.5, 1] });

            navQuestions.forEach(el => {
                if(el?.tagName) try { navIO.observe(el); } catch(e) {}
            });
        } catch(e) {}
    };

    // 更新导航问题列表（重新构建导航栏）
    const updateNavQuestions = (quesList) => {
        if(isEmpty(quesList)) {
            navBar.innerHTML = makeHTML("");
            navBar.style.visibility = navMiniButton.style.visibility = "hidden";
            return;
        }

        const thisQuestions = Array.from(quesList);
        if(navQuestions && thisQuestions.length === navQuestions.length && thisQuestions[0].textContent === navQuestions[0].textContent) {
            refreshNavBarVisibility();
            return;
        }

        navBar.innerHTML = makeHTML("");
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
            }
        }, 100);
    };

    // 迷你按钮事件
    navMiniButton.addEventListener('click', (e) => {
        e.stopPropagation();
        setNavMinimized(false);
    });

    /**
     * 脚本首次使用的指引
     */
    setTimeout(function(){
        document.body.appendChild(panel);
        document.body.appendChild(toggleButton);
        reloadDisableStatus();

        // 添加发送按钮监听
        setTimeout(addSendButtonListener, 1000);

        setTimeout(function(){
            if(isEmpty(getGV("notice4"))){
                alert("1、网页右下角提供了多选面板。\n点击网页空白处可缩略它；点击缩略后的面板可恢复原样；\n点击“禁用”可一键关闭同步提问。\n\n2、自动提问的前提，是先手动打开其他家大模型网页。\n\n本提示只会出现一次。");
                setGV("notice4", 1);
            }
        }, 800);
    }, panelDelay);


    /**
     * 多选面板
     */

    // 刷新简略模式
    function reloadCompactMode(){
        if (!isCompactMode) return;

        let selectedSites = getSitesAndCurrent();
        let selectedWords = selectedSites.map(site => siteToWord[site])
        drawCompactPanel(selectedWords);

        reloadDisableStatus();
    }


    let policy = "";
    if (window.trustedTypes) {
        policy = trustedTypes.createPolicy("forceInner", {
            createHTML: (to_escape) => to_escape
        });
    }

    function makeHTML(content){
        if(isEmpty(policy)){
            return content;
        }else{
            return policy.createHTML(content);
        }
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

        // 记录选中的项
        const selectedWords = words.filter(word =>
            document.getElementById(`word-${word}`)?.checked
        );

        if (selectedWords.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.textContent = '未选模型';
            emptyMsg.style.cssText = PANEL_STYLES.emptyMessage;
            contentContainer.innerHTML = makeHTML('');
            contentContainer.appendChild(emptyMsg);
        } else {
            drawCompactPanel(selectedWords);
        }

        isCompactMode = true;
        panel.style.cssText = PANEL_STYLES.panel;
    };

    function drawCompactPanel(selectedWords){
        contentContainer.innerHTML = makeHTML('');
        hint.style.cssText = PANEL_STYLES.hint;
        contentContainer.appendChild(hint);

        selectedWords.forEach(word => {
            const item = document.createElement('div');
            item.style.cssText = PANEL_STYLES.item;
            item.dataset.word = word;

            const wordSpan = document.createElement('span');
            let alias = wordToAlias[word];
            wordSpan.textContent = alias;
            wordSpan.style.cssText = PANEL_STYLES.wordSpan;

            // const checkbox = document.createElement('input');
            // checkbox.type = 'checkbox';
            // checkbox.id = `word-${word}`;
            // checkbox.style.cssText = checkboxStyle;
            // checkbox.checked = true;

            // 添加点击事件
            // checkbox.addEventListener('change', () => updateStorageSites(word));

            item.appendChild(wordSpan);
            // item.appendChild(checkbox);
            contentContainer.appendChild(item);
        });
    }

    // 切换到原始模式
    function switchToOriginalMode() {
        if (!isCompactMode) return;

        // 恢复原始内容
        contentContainer.innerHTML = makeHTML(originalHTML);

        // 重新绑定事件
        words.forEach(word => {
            const checkbox = document.getElementById(`word-${word}`);
            if (checkbox) {
                checkbox.addEventListener('change', () => updateStorageSites(word));
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

        // 如果点击的是复选框或按钮，不切换模式
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') {
            return;
        }

        // 切换模式
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


    /**
     * 存储管理
     */

    // 队列头部添加元素
    function enqueue(element) {
        let queue = JSON.parse(localStorage.getItem(QUEUE) || "[]");
        if (queue.length > 0 && queue[0] === element) {
            return;
        }
        queue.unshift(element);
        localStorage.setItem(QUEUE, JSON.stringify(queue));
    }

    // 当队列长度超过阈值，删除队尾元素
    function dequeue() {
        let queue = JSON.parse(localStorage.getItem(QUEUE) || "[]");
        let len = queue.length;
        if(len > MAX_QUEUE){

            let chatIdKey = T + queue[len - 1];
            let valJson = JSON.parse(getS(chatIdKey));
            if(!isEmpty(valJson)){
                let uid = valJson.uid;
                localStorage.removeItem("uid-" + uid);
                GM_deleteValue(uid);
            }

            localStorage.removeItem(chatIdKey);
            queue.pop();
            localStorage.setItem(QUEUE, JSON.stringify(queue));
        }
    }

    // localStorage读写json（hashMap）
    function hgetS(key, jsonKey){
        let json = localStorage.getItem(key);
        if(isEmpty(json)){
            return "";
        }
        json = JSON.parse(json);
        return json[jsonKey];
    }
    function hsetS(key, jsonKey, val){
        let json = JSON.parse(localStorage.getItem(key) || "{}");
        json[jsonKey] = val;
        localStorage.setItem(key, JSON.stringify(json));
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

    function isEqual(latestQ, lastQ){
        if(latestQ.length > MAX_PLAIN){
            if(lastQ.length === HASH_LEN){
                return dHash(latestQ) === lastQ;
            }else{
                return false;
            }
        }else{
            return latestQ === lastQ;
        }
    }

    function getQuesOrHash(ques){
        return ques.length > MAX_PLAIN ? dHash(ques) : ques;
    }

    function isEmpty(item){
        if(item===null || item===undefined || item.length===0 || item === "null"){
            return true;
        }else{
            return false;
        }
    }

    // 自定义哈希
    function dHash(str, length = HASH_LEN) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = (hash * 33) ^ str.charCodeAt(i);
        }

        const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
        let result = '';
        let h = hash >>> 0; // 转为无符号整数

        // 简单的伪随机数生成器（带种子）
        function pseudoRandom(seed) {
            let value = seed;
            return () => {
                value = (value * 1664525 + 1013904223) >>> 0; // 常见的 LCG 参数
                return value / 4294967296; // 返回 [0,1) 的浮点数
            };
        }

        const rand = pseudoRandom(hash); // 使用 hash 作为种子

        for (let i = 0; i < length; i++) {
            if (h > 0) {
                result += chars[h % chars.length];
                h = Math.floor(h / chars.length);
            } else {
                // 使用伪随机数生成字符
                const randomIndex = Math.floor(rand() * chars.length);
                result += chars[randomIndex];
            }
        }

        return result;
    }

    function guid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0,
                v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function getRand(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * 绑定快捷键
     * @param {string} combo 组合键格式，如 "ctrl+q"
     * @param {Function} callback 触发回调
     * @param {boolean} preventDefault 是否阻止默认行为
     */
    function bindShortcut(combo, callback, preventDefault = true) {
        const keys = combo.toLowerCase().split('+');
        const requiredKeys = {
            ctrl: false,
            alt: false,
            shift: false,
            key: null
        };

        keys.forEach(key => {
            if (key === 'ctrl') requiredKeys.ctrl = true;
            else if (key === 'alt') requiredKeys.alt = true;
            else if (key === 'shift') requiredKeys.shift = true;
            else requiredKeys.key = key;
        });

        document.addEventListener('keydown', (event) => {
            if (
                event.ctrlKey === requiredKeys.ctrl &&
                event.altKey === requiredKeys.alt &&
                event.shiftKey === requiredKeys.shift &&
                event.key.toLowerCase() === requiredKeys.key
            ) {
                if (preventDefault) event.preventDefault();
                callback(event);
            }
        });
    }

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

    function showAppreciatePopup() {
        // 检查是否选择了不再提醒
        let neverRemind = getGV('never_remind_appreciate');
        if (neverRemind === true) {
            return;
        }

        // 直接使用图片URL创建弹窗
        createPopupModal(DOMAIN + "/appreciate.jpg");
    }

    function createPopupModal(imageUrl) {
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.style.cssText = POPUP_STYLES.overlay;

        // 创建弹窗容器
        const modal = document.createElement('div');
        modal.style.cssText = POPUP_STYLES.modal;

        // 创建顶部文字
        const titleText = document.createElement('div');
        titleText.innerHTML = makeHTML('如果有帮到你一些，可以请作者喝杯咖啡吗<br>（微信扫码）');
        titleText.style.cssText = POPUP_STYLES.titleText;

        // 创建关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = makeHTML('×');
        closeBtn.style.cssText = POPUP_STYLES.closeBtn;

        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.backgroundColor = '#f0f0f0';
        });

        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.backgroundColor = 'transparent';
        });

        // 创建图片容器
        const imgContainer = document.createElement('div');
        imgContainer.style.cssText = POPUP_STYLES.imgContainer;

        // 创建图片元素
        const img = document.createElement('img');
        img.src = imageUrl;
        img.style.cssText = POPUP_STYLES.img;

        // 创建底部按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = POPUP_STYLES.buttonContainer;

        // 创建三个选项按钮
        const buttons = [
            { text: '不再提醒', value: 'never_remind', style: 'secondary' },
            { text: '已打赏', value: 'donated', style: 'primary' },
            { text: '以后再说', value: 'next_time', style: 'secondary' },
        ];

        buttons.forEach(buttonData => {
            const button = document.createElement('button');
            button.textContent = buttonData.text;

            // 根据按钮类型应用不同样式
            if (buttonData.style === 'primary') {
                button.style.cssText = POPUP_STYLES.primaryButton;
            } else {
                button.style.cssText = POPUP_STYLES.secondaryButton;
            }

            button.dataset.value = buttonData.value;

            // 添加点击事件
            button.addEventListener('click', function() {
                handleOptionClick(buttonData.value);
            });

            // 添加鼠标悬停效果
            button.addEventListener('mouseenter', function() {
                if (buttonData.style === 'primary') {
                    this.style.backgroundColor = '#d65137';
                    this.style.transform = 'translateY(-1px)';
                    this.style.boxShadow = '0 4px 8px rgba(236,114,88,0.4)';
                } else {
                    this.style.backgroundColor = '#e9ecef';
                    this.style.borderColor = '#adb5bd';
                }
            });

            button.addEventListener('mouseleave', function() {
                if (buttonData.style === 'primary') {
                    this.style.backgroundColor = '#ec7258';
                    this.style.transform = 'translateY(0)';
                    this.style.boxShadow = '0 2px 4px rgba(236,114,88,0.3)';
                } else {
                    this.style.backgroundColor = '#f8f9fa';
                    this.style.borderColor = '#dee2e6';
                }
            });

            buttonContainer.appendChild(button);
        });

        // 图片加载失败处理
        img.onerror = function() {
            const errorMsg = document.createElement('p');
            errorMsg.textContent = '图片加载失败';
            errorMsg.style.cssText = POPUP_STYLES.errorText;

            modal.innerHTML = makeHTML('');
            modal.appendChild(errorMsg);
            modal.appendChild(closeBtn);
        };

        // 组装弹窗
        modal.appendChild(closeBtn);
        modal.appendChild(titleText);
        imgContainer.appendChild(img);
        modal.appendChild(imgContainer);
        modal.appendChild(buttonContainer);
        overlay.appendChild(modal);

        // 处理选项按钮点击事件
        function handleOptionClick(value) {
            console.log('用户选择:', value);

            // 根据不同的选择处理逻辑和显示提示
            let message = '';
            switch(value) {
                case 'donated':
                    console.log('用户已打赏');
                    message = '感谢资瓷！';
                    setGV('never_remind_appreciate', true);
                    break;
                case 'next_time':
                    console.log('用户选择下次一定');
                    message = '有缘再见哦~';
                    break;
                case 'never_remind':
                    console.log('用户选择不再提醒');
                    message = '收到嘞';
                    // 设置不再提醒标记
                    setGV('never_remind_appreciate', true);
                    break;
            }

            // 显示提示弹窗
            showToast(message);

            // 关闭主弹窗
            closePopup();
        }

        // 显示提示消息
        function showToast(message) {
            const toast = document.createElement('div');
            toast.textContent = message;
            toast.style.cssText = POPUP_STYLES.toast;

            // 添加CSS动画
            if (!document.getElementById('toast-animation')) {
                const style = document.createElement('style');
                style.id = 'toast-animation';
                style.textContent = `
                @keyframes toastFadeIn {
                    from {
                        opacity: 0;
                        transform: translate(-50%, -50%) scale(0.8);
                    }
                    to {
                        opacity: 1;
                        transform: translate(-50%, -50%) scale(1);
                    }
                }
                @keyframes toastFadeOut {
                    from {
                        opacity: 1;
                        transform: translate(-50%, -50%) scale(1);
                    }
                    to {
                        opacity: 0;
                        transform: translate(-50%, -50%) scale(0.8);
                    }
                }
            `;
                document.head.appendChild(style);
            }

            document.body.appendChild(toast);

            // 2秒后自动消失
            setTimeout(() => {
                toast.style.animation = 'toastFadeOut 0.3s ease-in';
                setTimeout(() => {
                    if (document.body.contains(toast)) {
                        document.body.removeChild(toast);
                    }
                }, 300);
            }, 1500);
        }

        // 关闭弹窗的函数
        function closePopup() {
            document.body.removeChild(overlay);
        }

        // 绑定关闭事件
        closeBtn.addEventListener('click', closePopup);

        // 点击遮罩层也可以关闭
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                closePopup();
            }
        });

        // ESC键关闭
        const escHandler = function(e) {
            if (e.key === 'Escape') {
                closePopup();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // 添加到页面
        document.body.appendChild(overlay);
    }

})();

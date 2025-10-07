// ==UserScript==
// @name         多家大模型网页同时回答
// @namespace    http://tampermonkey.net/
// @version      1.7.0
// @description  只需输入一次问题，就能自动去各家大模型官网提问，省却了各处粘贴提问并等待的麻烦。支持范围：DS，Kimi，千问，豆包，ChatGPT，Gemini，Claude，其他更多介绍见本页面下方。
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
    console.log("ai script, start");

    let MAX_QUEUE = 15; // 历史对话的记忆数量
    const version = "1.7.0";
    let testLocalFlag = 0;

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

    // 选择器配置（问题列表、输入框、发送按钮）
    const selectors = {
        questionList: {
            [KIMI]: () => document.getElementsByClassName("user-content"),
            [DEEPSEEK]: () => filterQuestions(document.getElementsByClassName("ds-message")),
            [TONGYI]: () => document.querySelectorAll('[class^="bubble-"]'),
            [CHATGPT]: () => document.querySelectorAll('[data-message-author-role="user"]'),
            [ZCHAT]: () => document.querySelectorAll('[data-message-author-role="user"]'),
            [DOUBAO]: () => filterQuestions(document.querySelectorAll('[data-testid="message_text_content"]')),
            [GEMINI]: () => document.getElementsByTagName('user-query'),
            [QWEN]: () => document.getElementsByClassName("user-message-content"),
            [CLAUDE]: () => document.querySelectorAll('[data-testid="user-message"]')
        },
        inputArea: {
            [KIMI]: () => document.getElementsByClassName('chat-input-editor')[0],
            [DEEPSEEK]: () => document.getElementsByTagName('textarea')[0],
            [TONGYI]: () => document.getElementsByTagName('textarea')[0],
            [CHATGPT]: () => document.getElementById('prompt-textarea'),
            [ZCHAT]: () => document.getElementById('prompt-textarea'),
            [DOUBAO]: () => document.getElementsByTagName('textarea')[0],
            [GEMINI]: () => document.getElementsByClassName('textarea')[0],
            [QWEN]: () => document.getElementsByTagName('textarea')[0],
            [CLAUDE]: () => document.querySelector('[role="textbox"]')
        },
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
            [CLAUDE]: () => document.querySelector('[aria-label^="Send"]')
        }
    };

    // 表示当前站点的变量
    let site = 0;
    let url = window.location.href;

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
        "claude": CLAUDE
    };

    // 根据当前网址关键词，设置site值
    for (const keyword in keywords) {
        if (url.indexOf(keyword) > -1) {
            site = keywords[keyword];
            break;
        }
    }

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
    };
    const newSites = Object.fromEntries(
        Object.entries(webSites).map(([key, [baseUrl]]) => [key, baseUrl])
    );
    const historySites = Object.fromEntries(
        Object.entries(webSites).map(([key, [baseUrl, suffix]]) => [key, baseUrl + suffix])
    );

    // 各大模型url里对话ID的正则表达式模式
    const PATTERN_KIMI = "[0-9a-z]{20}";
    const PATTERN_UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    const PATTERN_MD5 = "[0-9a-f]{32}";
    const PATTERN_HEX16 = "[0-9a-f]{16}";
    const PATTERN_HEX17 = "[0-9a-f]{17}";

    const pattern ={
        [KIMI]: PATTERN_KIMI,
        [DEEPSEEK]: PATTERN_UUID,
        [TONGYI]: PATTERN_MD5,
        [CHATGPT]: PATTERN_UUID,
        [DOUBAO]: PATTERN_HEX17,
        [ZCHAT]: PATTERN_UUID,
        [GEMINI]: PATTERN_HEX16,
        [QWEN]: PATTERN_UUID,
        [CLAUDE]: PATTERN_UUID
    }

    // 多选面板配置（各站点的全称、简称）
    let wordConfig = [
        { site: DEEPSEEK, word: 'DeepSeek', alias: 'D'},
        { site: KIMI, word: 'Kimi', alias: 'K' },
        { site: ZCHAT, word: 'ChatGPT (zchat)', alias: 'Z' },
        { site: CHATGPT, word: 'ChatGPT (官网)', alias: 'C' },
        { site: TONGYI, word: '通义千问', alias: '通' },
        { site: DOUBAO, word: '豆包', alias: '豆' },
        { site: GEMINI, word: 'Gemini', alias: 'G' },
        { site: QWEN, word: 'Qwen', alias: 'Q' },
        { site: CLAUDE, word: 'Claude', alias: 'Cl' }
    ];

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

    // 存储时的特征词
    const T = "tool-";
    const QUEUE = "tool-queue";
    const LEN = "len";
    const LAST_Q = "lastQ";
    const UID_KEY = "uid";
    const DEFAULT_DISPLAY_KEY = "defaultDisplay";
    const HEART_KEY_PREFIX ="lastHeartbeat-";

    let DOMAIN = "https://www.ratetend.com:5001";
    // let testDOMAIN = "https://www.ratetend.com:5002";
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
            MAX_QUEUE = 3;
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
        const regex = new RegExp(pattern[site]);
        let ret = url.match(regex);
        if(isEmpty(ret)){
            return "";
        }
        return ret[0];
    }

    function getUrl(){
        return window.location.href;
    }


    // 面板样式
    const panelStyle = `
        cursor: pointer;
        position: fixed;
        right: 10px;
        bottom: 80px;
        max-height: 400px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        z-index: 99999999;
        overflow-y: auto;
        padding: 5px;
        display: flex;
        flex-direction: column;
    `;
    const panelCompact = `
        min-width: 120px;
    `;
    const itemStyle = `
            display: flex;
            align-items: center;
            padding: 3px 0;
            border-bottom: 1px solid #eee;
    `;
    const wordSpanStyle = `
            flex: 1;
            margin-right: 5px;
            font-size: 14px;
    `;
    const checkboxStyle = `
            margin-right: 1px;
            font-size: 20px;
    `;
    const emptyMessage = `
            padding: 1px;
            text-align: center;
            color: #888;
            font-size: 14px;
        `;
    const headlineStyle =`
            font-weight: bold;

    `;
    const hintStyle =`
            color: #275fe6;
            width: 0;
            height: 0;
            margin-top: 5px;
            margin-bottom: 5px;
            border-top: 8px solid transparent;
            border-right: 8px solid #3498db; /* 箭头颜色 */
            border-bottom: 8px solid transparent;
    `;


    // 给发送环节加锁。能否不要这个锁？不能，因为send环节是异步轮询，新问题来时send未必轮询结束
    let sendLock = false;
    // 页面加载发送一次心跳
    setGV(HEART_KEY_PREFIX + site, Date.now());

    let questionBeforeJump = getS("questionBeforeJump");
    if(!isEmpty(questionBeforeJump)){
        console.log("页面刚打开，处理跳转信息");
        receiveNew();
    }

    setInterval(function(){
        masterCheckNew();
    }, 1000);

    /**
     * 主从节点的逻辑
     */

        // 发送端
    let isHistoryChat = false; // 用于标记历史对话
    function masterCheckNew(){
        setGV(HEART_KEY_PREFIX + site, Date.now());
        reloadCompactMode();

        if(sendLock){
            return;
        }
        let masterId = getChatId();
        if(isEmpty(masterId)){
            isHistoryChat = false;
            return;
        }

        let questions = getQuestionList();
        let lenNext = questions.length;
        if(lenNext > 0){
            let len = hgetS(T + masterId, LEN) || 0;
            // 历史对话且无需映射同步问答的，终止流程
            if(len === 0 && isHistoryChat === true){
                return;
            }
            isHistoryChat = true;
            if(lenNext > len){
                let lastestQ = questions[lenNext - 1].textContent;
                let lastQuestion = hgetS(T + masterId, LAST_Q);

                if(!isEmpty(lastQuestion) && isEqual(lastestQ, lastQuestion)){
                    return;
                }
                hsetS(T + masterId, LEN, lenNext);
                masterReq(masterId, lastestQ);
            }
        }
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
        let lastUrl = getUrl();
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
                hsetS(T + chatId, LEN, 1);
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
            // 输入框粘贴文字：富文本编辑器 Lexical 和 React的不同处理
            if([KIMI].includes(site)){
                editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: content }));
            }else if([CLAUDE, GEMINI, CHATGPT, ZCHAT].includes(site)){
                const paragraph = editor.querySelector('p');
                editor.focus();
                paragraph.textContent = '';

                const span = document.createElement('span');
                span.setAttribute('data-lexical-text', 'true');
                span.textContent = content;
                paragraph.appendChild(span);

                editor.dispatchEvent(new Event('input', { bubbles: true }));
            }else{
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype,
                    'value'
                ).set;
                nativeInputValueSetter.call(editor, content);
                // 触发 input 事件
                editor.dispatchEvent(new Event('input', { bubbles: true }));
            }
            clickAndCheckLen(chatId);
        }, sendGap);
    }

    function clickAndCheckLen(chatId) {
        let tryCount = 0;

        const checkBtnInterval = setInterval(() => {
            let quesFlag = false;
            if(isEmpty(chatId)){
                quesFlag = true;
            }else{
                let len = getQuestionList().length;
                if(len > 0){
                    quesFlag = true;
                }
            }

            // ① 检查sendBtn存在 ② checkQuesList()检查问题列表长度是否增加
            let sendBtn = getSendButton(site);
            if (quesFlag && !isEmpty(sendBtn)) {
                clearInterval(checkBtnInterval);

                // 如果输入有候选词列表，需要先点击页面空白处、再点击发送
                setTimeout(function(){
                    document.body.click();
                    setTimeout(function(){
                        sendBtn.click();
                        setTimeout(function(){
                            let areaCheck = getInputArea(site);
                            if(!isEmpty(areaCheck) && !isEmpty(areaCheck.textContent)){
                                sendBtn.click();
                            }
                        }, 1000);
                    }, 300);
                }, 200);
                checkQuesList(chatId);
            } else {
                tryCount++;
                if (tryCount > maxRetries) {
                    clearInterval(checkBtnInterval);
                    sendLock = false;
                    console.log("tryCount "+tryCount + ", quesFlag "+quesFlag+", sendBtn "+isEmpty(sendBtn));
                    console.warn("sendBtn或问题列表未找到，超时");
                    return;
                }
            }
        }, checkGap);
    }

    function checkQuesList(chatId) {
        console.log("check ques list", curDate());
        let tryCount = 0;
        let cachedLen = hgetS(T + chatId, LEN);
        let newChatFlag = isEmpty(chatId) || isEmpty(cachedLen) || cachedLen === 0;

        const checkInterval = setInterval(() => {
            tryCount++;

            // 定时器：检查问题列表长度大于上次，则停止，并设置sendLock
            // 注意，若是chat首个问题，则只要求len=1
            let len = getQuestionList().length;

            let questionDisplayFlag = false;
            if(newChatFlag){
                if(len === 1){
                    questionDisplayFlag = true;
                }
            }else{
                if(len > cachedLen){
                    questionDisplayFlag = true;
                }
            }

            if (questionDisplayFlag) {
                console.log("question has displayed", curDate());
                clearInterval(checkInterval);
                if(!isEmpty(chatId)){
                    hsetS(T + chatId, LEN, len);
                    sendLock = false; // 解锁(如果chatId空，有setUid方法负责解锁)
                }
            } else if (tryCount > maxRetries) {
                console.log("tryCount "+tryCount + ", len "+len+", cachedLen "+cachedLen+", newChatFlag "+newChatFlag);
                clearInterval(checkInterval);
                console.warn("问题列表长度未符合判据，超时");
                sendLock = false;
                let areaContent = getInputArea(site).textContent;
                if(!isEmpty(areaContent)){
                    location.reload();
                }
            }
        }, checkGap);
    }


    /**
     * 多选面板
     */

    // 创建面板容器
    panel.style.cssText = panelStyle;
    let hint = document.createElement('div');

    const DISABLE = "禁用";
    const ENABLE = "开启";
    let disable = document.createElement('div');
    disable.id = "tool-disable";
    disable.textContent = DISABLE;
    disable.style.background = "#ec7258";
    disable.style.color = "white";
    disable.style.borderRadius = "6px";
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
    headline.style.cssText = headlineStyle;
    contentContainer.appendChild(headline);

    let sitesAndCurrent = getSitesAndCurrent();

    words.forEach(word => {
        const item = document.createElement('div');
        item.style.cssText = itemStyle;

        const wordSpan = document.createElement('span');
        wordSpan.textContent = word;
        wordSpan.style.cssText = wordSpanStyle;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `word-${word}`;
        checkbox.style.cssText = checkboxStyle;

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


    // 添加到页面
    setTimeout(function(){
        document.body.appendChild(panel);
        reloadDisableStatus();

        setTimeout(function(){
            if(isEmpty(getGV("notice4"))){
                alert("1、网页右下角提供了多选面板。\n点击网页空白处可缩略它；点击缩略后的面板可恢复原样；\n点击“禁用”可一键关闭同步提问。\n\n2、自动提问的前提，是先手动打开其他家大模型网页。\n\n本提示只会出现一次。");
                setGV("notice4", 1);
            }
        }, 800);
    }, panelDelay);

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
            emptyMsg.style.cssText = emptyMessage;
            contentContainer.innerHTML = makeHTML('');
            contentContainer.appendChild(emptyMsg);
        } else {
            drawCompactPanel(selectedWords);
        }

        isCompactMode = true;
        panel.style.cssText = panelStyle;
    };

    function drawCompactPanel(selectedWords){
        contentContainer.innerHTML = makeHTML('');
        hint.style.cssText = hintStyle;
        contentContainer.appendChild(hint);

        selectedWords.forEach(word => {
            const item = document.createElement('div');
            item.style.cssText = itemStyle;
            item.dataset.word = word;

            const wordSpan = document.createElement('span');
            let alias = wordToAlias[word];
            wordSpan.textContent = alias;
            wordSpan.style.cssText = wordSpanStyle;

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
        panel.style.cssText = panelStyle;
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
        overlay.style.cssText = styles.overlay;

        // 创建弹窗容器
        const modal = document.createElement('div');
        modal.style.cssText = styles.modal;

        // 创建顶部文字
        const titleText = document.createElement('div');
        titleText.innerHTML = '如果有帮到你一些，可以请作者喝杯咖啡吗<br>（微信扫码）';
        titleText.style.cssText = styles.titleText;

        // 创建关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = styles.closeBtn;

        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.backgroundColor = '#f0f0f0';
        });

        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.backgroundColor = 'transparent';
        });

        // 创建图片容器
        const imgContainer = document.createElement('div');
        imgContainer.style.cssText = styles.imgContainer;

        // 创建图片元素
        const img = document.createElement('img');
        img.src = imageUrl;
        img.style.cssText = styles.img;

        // 创建底部按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = styles.buttonContainer;

        // 创建三个选项按钮
        const buttons = [
            { text: '不再提醒', value: 'never_remind', style: 'secondary' },
            { text: '已打赏', value: 'donated', style: 'primary' },
            { text: '下次一定', value: 'next_time', style: 'secondary' },
        ];

        buttons.forEach(buttonData => {
            const button = document.createElement('button');
            button.textContent = buttonData.text;

            // 根据按钮类型应用不同样式
            if (buttonData.style === 'primary') {
                button.style.cssText = styles.primaryButton;
            } else {
                button.style.cssText = styles.secondaryButton;
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
            errorMsg.style.cssText = styles.errorText;

            modal.innerHTML = '';
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
            toast.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            z-index: 999999999;
            animation: toastFadeIn 0.3s ease-out;
        `;

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

// CSS样式集中定义
    const styles = {
        overlay: `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        z-index: 999999999;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20px;
        box-sizing: border-box;
    `,
        modal: `
        position: relative;
        background: white;
        border-radius: 12px;
        padding: 20px;
        max-width: 30vw;
        max-height: 50vh;
        width: auto;
        height: auto;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        display: flex;
        flex-direction: column;
        align-items: center;
        overflow: hidden;
        box-sizing: border-box;
    `,
        closeBtn: `
        position: absolute;
        top: 10px;
        right: 15px;
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #666;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background-color 0.2s;
        z-index: 1;
    `,
        imgContainer: `
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
    `,
        img: `
        max-width: calc(30vw - 60px);
        max-height: calc(50vh - 200px);
        width: auto;
        height: auto;
        object-fit: contain;
        border-radius: 8px;
        display: block;
    `,
        errorText: `
        color: #666;
        text-align: center;
    `,
        titleText: `
        font-size: 20px;
        font-weight: bold;
        color: #333;
        text-align: center;
        margin-bottom: 15px;
        padding: 10px 15px;
        border-bottom: 1px solid #eee;
        line-height: 1.4;
        word-wrap: break-word;
        white-space: normal;
        max-width: 100%;
    `,
        buttonContainer: `
        display: flex;
        justify-content: center;
        gap: 10px;
        margin-top: 15px;
        padding-top: 15px;
        border-top: 1px solid #eee;
        width: 100%;
    `,
        optionButton: `
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 14px;
        color: #333;
        cursor: pointer;
        transition: all 0.2s;
        min-width: 80px;
        text-align: center;
    `,
        primaryButton: `
        background: #ec7258;
        border: 1px solid #ec7258;
        border-radius: 6px;
        padding: 10px 20px;
        font-size: 14px;
        color: #fff;
        cursor: pointer;
        transition: all 0.2s;
        min-width: 90px;
        text-align: center;
        font-weight: bold;
        box-shadow: 0 2px 4px rgba(0,123,255,0.3);
    `,
        secondaryButton: `
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 13px;
        color: #6c757d;
        cursor: pointer;
        transition: all 0.2s;
        min-width: 80px;
        text-align: center;
    `
    };
})();

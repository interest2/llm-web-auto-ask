// ==UserScript==
// @name         多家大模型网页同时回答
// @namespace    http://tampermonkey.net/
// @version      1.5.13
// @description  只需输入一次问题，就能自动去各家大模型官网提问，省却了反复粘贴问题到各家网页并等待的麻烦。支持范围：DeepSeek，Kimi，通义千问，豆包，ChatGPT，Gemini，更多介绍见本页面下方。
// @author       interest2
// @match        https://www.kimi.com/*
// @match        https://chat.deepseek.com/*
// @match        https://www.tongyi.com/*
// @match        https://chatgpt.com/*
// @match        https://www.doubao.com/*
// @match        https://chat.zchat.tech/*
// @match        https://gemini.google.com/*
// @match        https://chat.qwen.ai/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @connect      www.ratetend.com
// @license      GPL-3.0-only
// @downloadURL https://update.greasyfork.org/scripts/536504/%E5%A4%9A%E5%AE%B6%E5%A4%A7%E6%A8%A1%E5%9E%8B%E5%90%8C%E6%97%B6%E5%9B%9E%E7%AD%94%EF%BC%8C%E5%8E%9F%E7%AB%99%E6%A0%B7%E5%BC%8F%E5%B1%95%E7%A4%BA.user.js
// @updateURL https://update.greasyfork.org/scripts/536504/%E5%A4%9A%E5%AE%B6%E5%A4%A7%E6%A8%A1%E5%9E%8B%E5%90%8C%E6%97%B6%E5%9B%9E%E7%AD%94%EF%BC%8C%E5%8E%9F%E7%AB%99%E6%A0%B7%E5%BC%8F%E5%B1%95%E7%A4%BA.meta.js
// ==/UserScript==

(function () {
    'use strict';
    console.log("ai script, start");

    let MAX_QUEUE = 10; // 历史对话的记忆数量
    const version = "1.5.13";

    const MAX_PLAIN = 50; // localStorage存储的问题原文的最大长度。超过则存哈希
    const HASH_LEN = 16; // 问题的哈希长度
    const checkGap = 100;
    const maxRetries = 150;
    const OPEN_GAP = 300; // 打开网页的间隔

    let testLocalFlag = 0;
    const HIBERNATE_GAP = 600; // 单位：秒

    // 存储时的特征词
    const T = "tool-";
    const QUEUE = "tool-queue";
    const LEN = "len";
    const LAST_Q = "lastQ";
    const UID_KEY = "uid";
    const DEFAULT_DISPLAY_KEY = "defaultDisplay";

    let DOMAIN = "https://www.ratetend.com:5001";
    let testDOMAIN = "https://www.ratetend.com:5002";
    // let testDOMAIN = "http://localhost:8002";
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

    let site = 0;
    let url = window.location.href;
    const HEART_KEY_PREFIX ="lastHeartbeat-";

    const keywords = {
        "kimi": 0,
        "deepseek": 1,
        "tongyi": 2,
        "chatgpt": 3,
        "doubao": 4,
        "zchat": 5,
        "gemini": 6,
        "qwen": 7
    };
    // 根据当前网址关键词，设置site值
    for (const keyword in keywords) {
        if (url.indexOf(keyword) > -1) {
            site = keywords[keyword];
            break;
        }
    }

    setTimeout(developTest, 2000);
    function developTest(){
        // kimi表格太窄，脚本作者自测调大用
        if(DEVELOPER_USERID === userid && site === 0){
            // let kimiPage = document.getElementsByClassName("chat-content-list")[0];
            // kimiPage.style.maxWidth = TEST_KIMI_WIDTH;
        }
    }

    // 各家大模型的网址（新对话，历史对话的前缀）
    const webSites = {
        0: ["https://www.kimi.com/", "chat/"],
        1: ["https://chat.deepseek.com/", "a/chat/s/"],
        2: ["https://www.tongyi.com/", "?sessionId="],
        3: ["https://chatgpt.com/", "c/"],
        4: ["https://www.doubao.com/chat", "/"],
        5: ["https://chat.zchat.tech/", "c/"],
        6: ["https://gemini.google.com/app", "/"],
        7: ["https://chat.qwen.ai/", "c/"]
    };
    const newSites = Object.fromEntries(
        Object.entries(webSites).map(([key, [baseUrl]]) => [key, baseUrl])
    );
    const historySites = Object.fromEntries(
        Object.entries(webSites).map(([key, [baseUrl, suffix]]) => [key, baseUrl + suffix])
    );


    let pat0 = "[0-9a-z]{20}";
    let pat1 = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    let pat2 = "[0-9a-f]{32}";
    let pat3 = "[0-9a-f]{16}";

    const pattern ={
        0: pat0,
        1: pat1,
        2: pat2,
        3: pat1,
        4: pat3,
        5: pat1,
        6: pat3,
        7: pat1
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
    let panelDelay = site === 5 ? 500 : 50;

    // 模式切换相关变量
    let isCompactMode = false;
    let originalHTML = contentContainer.innerHTML;

    const wordConfig = [
        { site: 1, word: 'DeepSeek', alias: 'D'},
        { site: 0, word: 'Kimi', alias: 'K' },
        { site: 5, word: 'ChatGPT (zchat)', alias: 'Z' },
        { site: 3, word: 'ChatGPT (官网)', alias: 'C' },
        { site: 2, word: '通义千问', alias: '通' },
        { site: 4, word: '豆包', alias: '豆' },
        { site: 6, word: 'Gemini', alias: 'G' },
        { site: 7, word: 'qwen', alias: 'q' }
    ];

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
        if(site === 4 && url.indexOf("local") > -1){
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
        max-height: 300px;
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
    function masterCheckNew(){
        setGV(HEART_KEY_PREFIX + site, Date.now());
        reloadCompactMode();

        if(sendLock){
            return;
        }
        let masterId = getChatId();
        if(isEmpty(masterId)){
            return;
        }

        let questions = getQuestionList();
        let lenNext = questions.length;
        if(lenNext > 0){
            let len = hgetS(T + masterId, LEN) || 0;
            if(lenNext > len){
                let lastestQ = questions[lenNext - 1].textContent;
                let lastQuestion = hgetS(T + masterId, LAST_Q);

                if(!isEmpty(lastQuestion) && isEqual(lastestQ, lastQuestion)){
                    return;
                }
                masterReq(masterId, lastestQ);
                hsetS(T + masterId, LEN, lenNext);
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

        let remoteUrl = DOMAIN + "/masterQ";
        let sites = getSitesExcludeCurrent();
        let data = {
                "userid": userid,
                "sites": sites,

            };
        remoteHttp(remoteUrl, data);

        let isDisable = getGV("disable");
        if(isDisable){
            return;
        }

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
        if(site === 3){
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
            const textarea = getTextArea(site);
            if (!isEmpty(textarea)) {
                clearInterval(intervalId);
                sendContent(textarea, content, chatId);
            }
        }, checkGap);
    }

    function sendContent(textarea, content, chatId){
        // 当豆包是新对话，元素不可见会异常，故适当延迟
        let sendGap = (site === 4 && isEmpty(chatId)) ? 1500 : 100;
        setTimeout(function(){
            textarea.focus();
            document.execCommand('insertText', false, content);
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
            let sendBtn = getBtn(site);
            if (quesFlag && !isEmpty(sendBtn)) {
                clearInterval(checkBtnInterval);

                // 如果输入有候选词列表，需要先点击页面空白处、再点击发送
                setTimeout(function(){
                    document.body.click();
                    setTimeout(function(){
                        sendBtn.click();
                        setTimeout(function(){
                            let areaCheck = getTextArea(site);
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
                let areaContent = getTextArea(site).textContent;
                if(!isEmpty(areaContent)){
                    location.reload();
                }
            }
        }, checkGap);
    }

    // 不同网站分别处理css元素
    function getQuestionList() {
        let questions = [];
        switch (site) {
            case 0:
                questions = document.getElementsByClassName("user-content");
                break;
            case 1:
                {
                    let list = document.getElementsByClassName("ds-message");
                    if (!isEmpty(list)) {
                        let elementsArray = Array.from(list);
                        questions = elementsArray.filter((item, index) => index % 2 === 0);
                    }
                }
                break;
            case 2:
                questions = document.querySelectorAll('[class^="bubble-"]');
                break;
            case 3:
            case 5:
                questions = document.querySelectorAll('[data-message-author-role="user"]');
                break;
            case 4:
                {
                    let list = document.querySelectorAll('[data-testid="message_text_content"]');
                    let elementsArray = Array.from(list);
                    questions = elementsArray.filter((item, index) => index % 2 === 0);
                }
                break;
            case 6:
                questions = document.getElementsByTagName('user-query');
                break;
            case 7:
                questions = document.getElementsByClassName("user-message-content");;
                break;
            default:
                break;
        }
        return questions;
    }

    function getTextArea(site) {
        switch (site) {
            case 0:
                return document.getElementsByClassName('chat-input-editor')[0];
            case 1:
            case 2:
            case 4:
            case 7:
                return document.getElementsByTagName('textarea')[0];
            case 3:
            case 5:
                return document.getElementById('prompt-textarea');
            case 6:
                return document.getElementsByClassName('textarea')[0];
            default:
                return null;
        }
    }

	function getBtn(site){
        switch(site){
            case 0:
                return document.getElementsByClassName('send-button')[0];
            case 1:
                var btns = document.querySelectorAll('[role="button"]');
                return btns[btns.length - 1];
            case 2:
                return document.querySelectorAll('[class^="operateBtn-"], [class*=" operateBtn-"]')[0];
            case 3:
            case 5:
                return document.getElementById('composer-submit-button');
            case 4:
                return document.getElementById('flow-end-msg-send');
            case 6:
                return document.querySelector('button.send-button');
            case 7:
                return document.getElementById('send-message-button');
        }
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
    if(site === 5){
    // if(site === 5 && getGV(DEFAULT_DISPLAY_KEY) === true){
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

})();
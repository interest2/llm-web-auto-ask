// ==UserScript==
// @name         多家大模型网页同时回答
// @namespace    http://tampermonkey.net/
// @version      2.2.0
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
    const NAV_TOP = "20%"; // 目录栏top位置（相对网页整体）
    let MAX_QUEUE = 20; // 历史对话的记忆数量

    const version = "2.2.0";

    /******************************************************************************
     * ═══════════════════════════════════════════════════════════════════════
     * ║                                                                      ║
     * ║  🔧 1、适配各站点相关代码  🔧                                      ║
     * ║                                                                      ║
     * ═══════════════════════════════════════════════════════════════════════
     ******************************************************************************/

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
        textarea: [DEEPSEEK, TONGYI, DOUBAO, QWEN],
        lexical: [KIMI, CHATGPT, ZCHAT, GEMINI, CLAUDE, GROK]
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
            [KIMI]: () => document.getElementsByClassName('send-button')[0],
            [DEEPSEEK]: () => ((btns) => btns[btns.length - 1])(document.querySelectorAll('[role="button"]')),
            [TONGYI]: () => document.querySelector('[class^="operateBtn-"], [class*=" operateBtn-"]'),
            [CHATGPT]: () => document.getElementById('composer-submit-button'),
            [ZCHAT]: () => document.getElementById('composer-submit-button'),
            [DOUBAO]: () => document.getElementById('flow-end-msg-send'),
            [GEMINI]: () => document.querySelector('button.send-button'),
            [QWEN]: () => document.getElementById('send-message-button'),
            [CLAUDE]: () => document.querySelector('[aria-label^="Send"]'),
            [GROK]: () => document.querySelector('button[type="submit"]')
        },
        // 已提问的列表（官网样式变更不会影响同步提问功能，只影响目录功能）
        questionList: {
            [KIMI]: () => document.getElementsByClassName("user-content"),
            [DEEPSEEK]: () => filterQuestions(document.getElementsByClassName("ds-message")),
            [TONGYI]: () => document.querySelectorAll('[class^="bubble-"]'),
            [CHATGPT]: () => document.querySelectorAll('[data-message-author-role="user"]'),
            [ZCHAT]: () => document.querySelectorAll('[data-message-author-role="user"]'),
            [DOUBAO]: () => Array.from(document.querySelectorAll('[data-testid="message_text_content"]')).filter(el => !el.children || el.children.length === 0),
            [GEMINI]: () => document.getElementsByTagName('user-query'),
            [QWEN]: () => document.getElementsByClassName("user-message-content"),
            [CLAUDE]: () => document.querySelectorAll('[data-testid="user-message"]'),
            [GROK]: () => document.querySelectorAll('div.items-end .message-bubble')
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

    // 多选面板里，各站点的全称、简称
    let wordConfig = [
        { site: DEEPSEEK, word: 'DeepSeek', alias: 'D'},
        { site: KIMI, word: 'Kimi', alias: 'K' },
        { site: TONGYI, word: '通义千问', alias: '通' },
        { site: QWEN, word: 'Qwen', alias: 'Q' },
        { site: DOUBAO, word: '豆包', alias: '豆' },
        { site: ZCHAT, word: 'ZCHAT-GPT', alias: 'Z' },
        { site: CHATGPT, word: 'ChatGPT', alias: 'C' },
        { site: GEMINI, word: 'Gemini', alias: 'G' },
        { site: CLAUDE, word: 'Claude', alias: 'Cl' },
        { site: GROK, word: 'Grok', alias: 'Gr' }
    ];

    // （可选）隐藏输入框及周边区域，所需隐藏的元素，是输入框本体的第几层父元素？以下数字即层数（后续应改为可视化配置）
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

	// 通用chatId正则：16~37位的数字、字母、短横杠
	const GENERAL_PATTERN = /[a-zA-Z0-9-]{16,37}/;

    const MARKER_CHAT = "chat/";
    const MARKER_C = "c/";

	// （可选）各站点的chatId提取所需特征词（由于正则匹配结果可能有多个，故需精准识别）
    // Gemini和DS暂用默认兜底规则
	const CHAT_ID_PREFIX = {
		[KIMI]: [MARKER_CHAT],
		[TONGYI]: ["sessionId="],
		[QWEN]: [MARKER_C],
		[DOUBAO]: [MARKER_CHAT],
		[CHATGPT]: [MARKER_C],
		[ZCHAT]: [MARKER_C],
		[CLAUDE]: [MARKER_CHAT],
		[GROK]: ["chat=", MARKER_C]
	};

	// 从url提取各大模型网站的对话唯一标识
	function getChatId(){
        let url = getUrl();
        if(isEmpty(url)){
            return "";
        }
        if(site === DOUBAO && url.indexOf("local") > -1){
            return "";
        }
		// 特征词规则：若定义了站点规则且能提取出匹配GENERAL_PATTERN的内容，则直接返回；否则走通用匹配
		const markers = CHAT_ID_PREFIX[site];
		if(markers && Array.isArray(markers)){
			// 优先选择在 URL 中出现位置更靠前且能命中的 marker
			const candidates = markers
				.map(m => ({ m, idx: url.indexOf(m) }))
				.filter(x => x.idx !== -1)
				.sort((a,b) => a.idx - b.idx);
			for(const { m } of candidates){
				const id = matchAfterMarker(url, m, GENERAL_PATTERN);
				if(!isEmpty(id)){
					return id;
				}
			}
			return ""; // 指定站点但无特征词或无法匹配时视为空
		}
		// 其他站点：通用匹配（如有多个匹配，取最后一个，兼容性更好）
		const globalRegex = new RegExp(GENERAL_PATTERN.source, 'g');
		const all = url.match(globalRegex);
		if(isEmpty(all)){
			return "";
		}
		return all[all.length - 1];
    }
    
	// 工具：匹配 marker 后第一个符合 pattern 的内容（捕获分组法）
	function escapeRegex(text){
		return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
	function matchAfterMarker(fullUrl, marker, pattern){
		const regex = new RegExp(escapeRegex(marker) + '(' + pattern.source + ')');
		const m = fullUrl.match(regex);
		return (m && m[1]) ? m[1] : "";
	}

    const newSites = Object.fromEntries(
        Object.entries(webSites).map(([key, [baseUrl]]) => [key, baseUrl])
    );
    const historySites = Object.fromEntries(
        Object.entries(webSites).map(([key, [baseUrl, suffix]]) => [key, baseUrl + suffix])
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


    // 系统功能配置
    const MAX_PLAIN = 50; // localStorage存储的问题原文的最大长度。超过则存哈希
    const HASH_LEN = 16; // 问题的哈希长度
    const checkGap = 100;
    const HISTORY_WAIT_ROUNDS = Math.ceil(3000 / checkGap);
    const maxRetries = 200;
    const OPEN_GAP = 300; // 打开网页的间隔
    const HIBERNATE_GAP = 600; // 单位：秒
    let testLocalFlag = 0;

    // 存储时的特征词
    const T = "tool-";
    const HAS_IMAGE_BEFORE_JUMP = "hasImageBeforeJump";
    const QUEUE = "tool-queue";
    const LAST_Q = "lastQ";
    const UID_KEY = "uid";
    const UID_KEY_PREFIX = "uid-";
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

    let questionBeforeJump = getS("questionBeforeJump");
    if(!isEmpty(questionBeforeJump)){
        console.log("页面刚打开，处理跳转信息");
        receiveNew();
    }

    // 发送端
    function masterCheck(lastestQ){
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
        masterHandle(masterId, lastestQ);
    };

    function masterHandle(masterId, lastestQ){
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
            sendQuestion(cachedQuestion, cachedSlaveId);

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
                    sendQuestion(question, curSlaveId);
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
                sendQuestion(question, "");
                setUid(uid, question);
            }
        }
        if(!isEmpty(targetUrl)){
            let jumpArray = [question, uid, slaveId];
            setS("questionBeforeJump", JSON.stringify(jumpArray));
            window.location.href = targetUrl;
        }
    }


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
    function sendQuestion(content, chatId){
        updateBoxFromStorage();

        let intervalId;
        let count = 0;
        sendLock = true;

        intervalId = setInterval(function() {
            count ++;
            if(count > 10000 / checkGap){
                console.log("监测输入框存在超时");
                clearInterval(intervalId);
            }
            const inputArea = getInputArea();
            // 输入框元素存在
            if (!isEmpty(inputArea)) {
                let noChatId = isEmpty(chatId);
                // 要求是新空白对话，或者 非新但问题列表非空（或超时）
                const questionReady = !isEmpty(getQuestionList());
                const waitTimeout = count >= HISTORY_WAIT_ROUNDS;
                if(noChatId || (!noChatId && (questionReady || waitTimeout)) ){
                    clearInterval(intervalId);
                    pasteContent(inputArea, content, chatId);
                }
            }
        }, checkGap);
    }

    /**
     * 输入框粘贴提问内容
     */
    async function pasteContent(editor, content, chatId){

        if(!isEmpty(getS(T + HAS_IMAGE_BEFORE_JUMP))){
            console.log("有跳转前的图片待粘贴");
            // 粘贴图片到输入框，并等待完成
            await doPasteImage();
            console.log("粘贴完成");
            setS(T + HAS_IMAGE_BEFORE_JUMP, "");
        }else{
            console.log("无需粘贴图片");
        }

        // 当豆包是新对话，元素不可见会异常，故适当延迟
        let pasteDelay = (site === DOUBAO && isEmpty(chatId)) ? 1500 : 100;
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
            // 点击发送
            sendAndCheck();
        }, pasteDelay);
    }

    /**
     * 等待发送按钮出现，并执行发送动作
     */
    function sendAndCheck() {
        let tryCount = 0;
        console.log(curDate() + "h1 click");
        const pollInterval = checkGap;

        const checkBtnInterval = setInterval(() => {
            const sendBtn = getSendButton();
            if (!isEmpty(sendBtn)) {
                clearInterval(checkBtnInterval);
                
                // 执行发送动作：点击页面空白处，然后点击发送按钮
                setTimeout(() => {
                    document.body.click();
                    setTimeout(() => {
                        console.log(curDate() + "h2 click");
                        sendBtn.click();
                        // 轮询是否发送成功
                        pollSendStatus(sendBtn);
                    }, 300);
                }, 200);
            } else {
                tryCount++;
                if (tryCount > maxRetries) {
                    clearInterval(checkBtnInterval);
                    sendLock = false;
                    console.log("tryCount " + tryCount + " sendBtn " + isEmpty(sendBtn));
                    console.warn("sendBtn未找到或未发送成功，超时");
                }
            }
        }, pollInterval);
    }

    /**
     * 轮询检查输入框是否已清空（发送成功）
     * 如果输入框仍有内容，则继续点击发送按钮
     */
    function pollSendStatus(sendBtn) {
        const maxPollTime = maxRetries * checkGap - 2000;
        const pollInterval = checkGap * 2;
        const startTime = Date.now();
        let pollTryCount = 0;

        function checkInputArea() {
            const elapsed = Date.now() - startTime;
            pollTryCount++;
            const inputArea = getInputArea();
            const areaContent = getInputContent(inputArea);

            // 输入框为空，表明发送成功
            if (isEmpty(areaContent)) {
                sendLock = false;
                return;
            }

            // 超时，解锁并返回
            if (elapsed >= maxPollTime || pollTryCount > maxRetries) {
                console.log("tryCount " + pollTryCount);
                console.warn("未符合判据，超时");
                sendLock = false;
                return;
            }

            // 输入框仍有内容，继续点击发送按钮
            console.log(curDate() + "h3 click");
            console.log(sendBtn);
            sendBtn.click();
            setTimeout(checkInputArea, pollInterval);
        }

        setTimeout(checkInputArea, pollInterval);
    }

    /**
     * 设置uid
     */
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
                        setS(UID_KEY_PREFIX + uid, JSON.stringify(uidJson));
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
        // 仅当输入框处于聚焦状态时才继续处理
        const inputArea = getInputArea();
        if (!inputArea) return;
        const activeElement = document.activeElement;
        // gemini, grok检测的activeElement为空，不支持聚焦判断
        if(![GEMINI, GROK].includes(site)){
            if (activeElement !== inputArea && !inputArea.contains(activeElement)) {
                return;
            }
        }

        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                if (!blob) continue;

                // 转为 Base64
                const base64 = await blobToBase64(blob);

                // 时序注意：先设置 chatId 和 site，最后设置 image 来触发监听器
                let thisChatId = getChatId();
                GM_setValue(imageKey + "-chatId", thisChatId);
                GM_setValue(imageKey + "-site", site);
                GM_setValue(imageKey, base64);
                setS(T + currentAskHasImage, "1");

                break; // 手动粘贴图片后，脚本读取最后一张图，存入共享存储
            }
        }
    });

    // 其他站点粘贴图片
    async function pasteImage() {
        if(!shouldPasteImageNow()){
            setS(T + HAS_IMAGE_BEFORE_JUMP, "1");
            return;
        }

        return doPasteImage();
    }

    // 判断当前页面是否应当处理粘贴的图片（基于 chatId 绑定关系）
    function shouldPasteImageNow(){
        const sourceSite = GM_getValue(imageKey + "-site");
        const masterChatId = GM_getValue(imageKey + "-chatId");
        const curChatId = getChatId();

        const empty1 = isEmpty(masterChatId);
        const empty2 = isEmpty(curChatId);
        const bothEmpty = empty1 && empty2;

        let pairdChatId = false;
        const uid = hgetS(T + curChatId, UID_KEY);
        const uidJson = getGV(uid);
        if(!isEmpty(uidJson)){
            const expectedChatId = uidJson[sourceSite];
            if(!empty1 && !empty2 && expectedChatId === masterChatId){
                pairdChatId = true;
            }
        }

        return bothEmpty || pairdChatId;
    }

    // 模拟将 base64 图片粘贴到输入框（返回在实际触发粘贴后才 resolve）
    function doPasteImage() {
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
                const interval = setInterval(() => {
                    if (targetElement && typeof targetElement.focus === 'function') {
                        clearInterval(interval);
                        targetElement.focus();

                        // 粘贴
                        const dispatched = targetElement.dispatchEvent(pasteEvent);
                        console.log('模拟粘贴图片成功');
                        resolve(!!dispatched);
                    }
                }, 100);
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
                masterCheck(question);
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

        if(isEmpty(getChatId())){
            updateNavQuestions();
            return;
        }

        let questions = getQuestionList();
        updateNavQuestions(questions);

    }, 1500);


    /******************************************************************************
     * ═══════════════════════════════════════════════════════════════════════
     * ║                                                                      ║
     * ║  🎨 7、trusted HTML & 首次使用指引 & 输入框的显示/隐藏切换 🎨                        ║
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
            if(isEmpty(getGV(FIRST_RUN_KEY))){
                setGV(FIRST_RUN_KEY, 1);

                let updateHint = "脚本使用提示：\n网页右下角的多选面板可勾选提问范围，\n点击\"禁用\"可一键关闭同步提问";

                if(!isEmpty(getGV("notice4"))){
                    setGV("notice4", "");

                    updateHint = "脚本近期更新：\n支持带图片（粘贴方式）提问的自动同步；\n进一步降低核心功能对官网样式的依赖";
                }

                alert(updateHint);
            }
        }, 800);
    }, panelDelay);


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
        let inputArea = getInputArea();
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

    /******************************************************************************
     * ═══════════════════════════════════════════════════════════════════════
     * ║                                                                      ║
     * ║  📑 8、目录导航功能  📑                                              ║
     * ║                                                                      ║
     * ═══════════════════════════════════════════════════════════════════════
     ******************************************************************************/

    const NAV_ITEM_COLOR = "#333";
    // 目录导航相关常量
    const NAV_HIGHLIGHT_THRESHOLD = 0.3; // 目录高亮阈值（0~30%高亮当前项，30%~100%高亮前一项）
    const NAV_VIEWPORT_THRESHOLD = 0.9; // 可视区域阈值（90%）
    const NAV_NEAR_TOP_THRESHOLD = 24; // 接近顶部阈值（像素）
    const NAV_CLICK_LOCK_DURATION = 1200; // 点击锁定持续时间（毫秒）
    // 副目录标题级别配置（可配置为 h2~h4 或 h2~h3）
    const SUB_NAV_HEADING_LEVELS = [2, 3, 4]; // 支持 h2, h3, h4，如需只支持 h2~h3，改为 [2, 3]
    const SUB_NAV_HEADING_SELECTOR = SUB_NAV_HEADING_LEVELS.map(level => `h${level}`).join(', '); // 生成选择器字符串，如 "h2, h3, h4"
    const SUB_NAV_HEADING_TAGS = SUB_NAV_HEADING_LEVELS.map(level => `H${level}`); // 生成标签数组，如 ["H2", "H3", "H4"]

    // 样式常量
    const NAV_STYLES = {
        navBar: `position:fixed;visibility:hidden;top:${NAV_TOP};right:15px;max-width:${NAV_MAX_WIDTH};min-width:150px;background:rgba(255,255,255,0.95);border:1px solid #ccc;border-radius:6px;padding:5px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.15);max-height:100vh;overflow-y:auto;box-sizing:border-box;`,
        miniButton: `position:fixed;top:${NAV_TOP};right:15px;color:${NAV_ITEM_COLOR};border:1px solid #ddd;border-radius:8px;padding:2px 8px;font-size:14px;font-weight: bold;cursor:pointer;z-index:2147483647;visibility:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.15);user-select:none;`,
        link: `width:100%;padding:4px 5px;cursor:pointer;color:#333;font-size:14px;line-height:1.5;white-space:normal;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word;max-height:calc(1.9em * 2);box-sizing:border-box;`,
        linkContainer: `display:flex;align-items:center;gap:4px;width:100%;`,
        waveIcon: `font-size:12px;cursor:pointer;color:#666;padding:2px 4px;border-radius:3px;user-select:none;flex-shrink:0;transition:background-color 0.2s;`,
        title: `display:flex;align-items:center;justify-content:flex-start;gap:6px;font-weight:bold;color:#333;padding:4px 5px;border-bottom:1px solid #eaeaea;margin-bottom:4px;`,
        hideBtn: `font-weight:normal;color:#666;font-size:12px;padding:2px 6px;border:1px solid #ddd;border-radius:10px;cursor:pointer;user-select:none;`,
        subNavBar: `position:fixed;left:270px;top:5%;width:270px;max-height:94vh;background:rgba(255,255,255,0.95);border:1px solid #ccc;border-radius:6px;padding:8px;z-index:2147483646;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.15);overflow-y:auto;box-sizing:border-box;display:none;`,
        subNavTitle: `font-weight:bold;color:#111;padding:4px 0;border-bottom:1px solid #eaeaea;margin-bottom:6px;font-size:14px;`,
        subNavItem: `padding:4px 8px;cursor:pointer;color:#333;font-size:13px;line-height:1.6;border-radius:3px;margin:2px 0;transition:background-color 0.2s;word-break:break-word;`,
        subNavItemH2: `padding-left:8px;font-weight:600;`,
        subNavItemH3: `padding-left:16px;font-weight:500;`,
        subNavItemH4: `padding-left:24px;font-weight:400;`,
        subNavCloseBtn: `position:absolute;top:6px;right:8px;font-size:16px;cursor:pointer;color:#777;width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:3px;transition:background-color 0.2s;`,
        levelBtn: `padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #ddd;border-radius:4px;background:#fff;color:#333;transition:all 0.2s;user-select:none;`,
        levelBtnActive: `background:#0066cc;color:#fff;border-color:#0066cc;`,
        levelBtnGroup: `display:flex;gap:4px;align-items:center;`
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

    // 创建副目录栏元素
    const subNavBar = document.createElement('div');
    subNavBar.id = "tool-sub-nav-bar";
    subNavBar.style.cssText = NAV_STYLES.subNavBar;

    // 状态变量
    let navQuestions, navLinks = [], navIO, elToLink = new Map();
    let clickedTarget = null, clickLockUntil = 0, scrollDebounceTimer;
    let currentSubNavQuestionIndex = -1; // 当前显示的副目录对应的主目录索引
    let currentSubNavLevel = 3; // 当前副目录显示的层级（默认 h3）
    let currentSubNavHeadings = []; // 当前副目录的所有标题数据（未过滤）

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

    // 刷新导航栏的显示状态（显示/隐藏/最小化）
    const refreshNavBarVisibility = () => {
        const root = document.body || document.documentElement;
        if(!root.contains(navMiniButton)) root.appendChild(navMiniButton);

        const linkCount = navBar.querySelectorAll('.tool-nav-link').length;
        if(linkCount === 0) {
            navBar.style.visibility = navMiniButton.style.visibility = "hidden";
            return;
        }

        // 如果条目数量超过7条，则将navBar的top改为5%
        if(linkCount > 7) {
            navBar.style.top = "5%";
            navMiniButton.style.top = "5%";
        } else {
            navBar.style.top = NAV_TOP;
            navMiniButton.style.top = NAV_TOP;
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
            while (nextSibling && checkedCount < 30) {
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
            while (current && depth < 10) {
                // 查找当前元素的父元素
                let parent = current.parentElement;
                if (!parent) break;
                
                // 查找父元素的兄弟元素
                let sibling = parent.nextElementSibling;
                let checkedCount = 0;
                while (sibling && checkedCount < 20) {
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
            while (current && depth < 10) {
                // 查找当前元素的父元素
                let parent = current.parentElement;
                if (!parent) break;
                
                // 查找父元素的兄弟元素，直到找到下一个问题
                let sibling = parent.nextElementSibling;
                let checkedCount = 0;
                while (sibling && checkedCount < 50) {
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
        while (nextSibling && checkedCount < 30) {
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

    // 在回答内容区域中查找所有配置的标题级别
    const findHeadingsInContent = (contentEl) => {
        if (!contentEl) return [];
        
        const headingList = [];
        
        // 1. 查找现有的 h2~h4 标签标题
        const headings = contentEl.querySelectorAll(SUB_NAV_HEADING_SELECTOR);
        Array.from(headings).forEach(h => {
            // 确保标题是可见的
            const rect = h.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            // 确保标题级别在配置的范围内
            const level = parseInt(h.tagName.substring(1));
            if (!SUB_NAV_HEADING_LEVELS.includes(level)) return;
            
            let text = h.textContent.trim();
            
            // 移除开头的空格和 emoji，但保留数字编号
            // 先移除开头的连续空格
            text = text.replace(/^\s+/, '');
            
            // 关键优化：先检查第一个字符是否是数字，避免某些环境将数字误识别为 emoji
            const firstChar = text.charAt(0);
            if (/[0-9]/.test(firstChar)) {
                // 第一个字符是数字，不做任何处理，保留完整的数字编号
                // 例如："8. ..."、"8.1 ..."、"1. ..." 等
            } else {
                // 第一个字符不是数字，可能是 emoji 或其他字符
                // 检查是否是 emoji 开头，且后面紧跟数字（可能含空格）
                if (/^\p{Emoji}\s*[0-9]/u.test(text)) {
                    // emoji 后面是数字，只移除 emoji 和空格，保留数字
                    // 例如："✅ 1. ..." → "1. ..."
                    text = text.replace(/^\p{Emoji}+\s*/u, '');
                } else if (/^\p{Emoji}/u.test(text)) {
                    // emoji 后面不是数字，安全移除 emoji
                    // 再次确认第一个字符不是数字（双重检查，防止误识别）
                    if (!/[0-9]/.test(text.charAt(0))) {
                        text = text.replace(/^\p{Emoji}+\s*/u, '');
                    }
                    // 如果第一个字符是数字，说明被误识别为 emoji，不做处理
                }
            }
            
            // 移除末尾的冒号（中英文）
            text = text.replace(/[:：]+$/, '');
            
            headingList.push({
                element: h,
                tagName: h.tagName,
                text: text,
                level: level,
                position: rect.top
            });
        });
        
        // 2. 查找文本中以 "## " 或 "### " 开头的 Markdown 标题
        // 支持标题被分割在多个元素中的情况（如 <span>## 五、</span><span>标题内容</span>）
        const markdownHeadingPatterns = [
            { level: 2, prefix: '## ' },  // h2: ## 标题
            { level: 3, prefix: '### ' }  // h3: ### 标题
        ];

        // 检查纯文本节点（包括合并后的文本，如分割在多个span中的标题在textContent中会合并成一行）
        const walker = document.createTreeWalker(
            contentEl,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let textNode;
        let domOrder = 0; // 记录DOM遍历顺序
        while (textNode = walker.nextNode()) {
            const text = textNode.textContent;
            if (!text) continue;
            
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
        
        // 3. 去重并排序（按DOM顺序，保持文档中的原始顺序）
        const uniqueHeadings = [];
        const seenKeys = new Set();
        
        // 按DOM顺序排序（TreeWalker遍历的顺序）
        headingList.sort((a, b) => a.domOrder - b.domOrder);
        
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
                item.style.backgroundColor = '#f0f0f0';
                item.style.color = '#0066cc';
            });
            item.addEventListener('mouseleave', () => {
                item.style.backgroundColor = 'transparent';
                item.style.color = '#333';
            });
            
            // 点击跳转
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (heading.element && document.body.contains(heading.element)) {
                    heading.element.scrollIntoView({ block: 'start' });
                } else {
                    console.warn('标题元素不存在');
                }
            });
            
            subNavBar.appendChild(item);
        });
    };

    // 显示副目录栏
    const showSubNavBar = (questionIndex, headings) => {
        if (!headings || headings.length === 0) {
            console.log('未找到标题');
            return;
        }
        
        // 保存标题数据和状态
        currentSubNavHeadings = headings;
        currentSubNavQuestionIndex = questionIndex;
        
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
        
        // 创建层级按钮（只显示配置中包含的层级）
        SUB_NAV_HEADING_LEVELS.forEach(level => {
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
                    btn.style.backgroundColor = '#f0f0f0';
                    btn.style.borderColor = '#ccc';
                }
            });
            btn.addEventListener('mouseleave', () => {
                if (level !== currentSubNavLevel) {
                    btn.style.backgroundColor = '#fff';
                    btn.style.borderColor = '#ddd';
                    btn.style.color = '#333';
                }
            });
            
            // 点击切换层级
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // 更新当前层级
                currentSubNavLevel = level;
                
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
            });
            
            levelBtnGroup.appendChild(btn);
        });
        
        // 组装左侧（标题和按钮组）
        titleLeft.appendChild(titleText);
        titleLeft.appendChild(levelBtnGroup);
        titleRow.appendChild(titleLeft);
        titleContainer.appendChild(titleRow);
        
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
            hideSubNavBar();
        });
        titleContainer.appendChild(closeBtn);
        
        // 添加到副目录栏
        subNavBar.appendChild(titleContainer);
        
        // 渲染标题项
        renderSubNavItems();
        
        // 显示副目录栏
        subNavBar.style.display = 'block';
    };

    // 隐藏副目录栏
    const hideSubNavBar = () => {
        subNavBar.style.display = 'none';
        currentSubNavQuestionIndex = -1;
    };

    // 根据问题索引自动显示对应的副目录
    const autoShowSubNav = (questionIndex) => {
        if (questionIndex < 0 || !navQuestions || questionIndex >= navQuestions.length) {
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
        showSubNavBar(questionIndex, headings);
    };

    // 创建导航链接元素
    const createNavLink = (el, i) => {
        // 创建链接容器
        const linkContainer = document.createElement('div');
        linkContainer.className = 'tool-nav-link-container';
        linkContainer.style.cssText = NAV_STYLES.linkContainer;

        // 创建波浪图标
        const waveIcon = document.createElement('span');
        waveIcon.textContent = '~';
        waveIcon.style.cssText = NAV_STYLES.waveIcon;
        waveIcon.title = '显示副目录';
        waveIcon.addEventListener('mouseenter', () => {
            waveIcon.style.backgroundColor = '#f0f0f0';
            waveIcon.style.color = '#0066cc';
        });
        waveIcon.addEventListener('mouseleave', () => {
            waveIcon.style.backgroundColor = 'transparent';
            waveIcon.style.color = '#333';
        });
        waveIcon.addEventListener('click', (e) => {
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
        textSpan.textContent = el.textContent;

        link.title = (i + 1) + '. ' + el.textContent;
        link.appendChild(indexSpan);
        link.appendChild(textSpan);

        // 事件监听
        link.addEventListener('mouseenter', () => link.style.backgroundColor = '#f0f0f0');
        link.addEventListener('mouseleave', () => link.style.backgroundColor = '');
        link.addEventListener('click', (e) => {
            e.preventDefault();
            // 验证元素是否存在，如果不存在则尝试重新获取
            let targetEl = el;
            if (!targetEl || !document.body.contains(targetEl)) {
                // 元素可能已被移除或重新渲染，尝试重新获取
                const questions = getQuestionList();
                if (questions && questions.length > i) {
                    targetEl = questions[i];
                }
            }
            
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
        linkContainer.appendChild(waveIcon);
        linkContainer.appendChild(link);

        return linkContainer;
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
            return;
        }

        const thisQuestions = Array.from(quesList);
        if(navQuestions && thisQuestions.length === navQuestions.length && thisQuestions[0].textContent === navQuestions[0].textContent) {
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
     * ║  🎛️ 9、多选面板  🎛️                                                  ║
     * ║                                                                      ║
     * ═══════════════════════════════════════════════════════════════════════
     ******************************************************************************/

    // 面板样式集中定义
    const PANEL_STYLES = {
        panel: `cursor:pointer;position:fixed;right:10px;bottom:80px;max-height:400px;background:white;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);z-index:99999999;overflow-y:auto;padding:2px;display:flex;flex-direction:column;`,
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
    let hint = document.createElement('div');

    const DISABLE = "禁用";
    const ENABLE = "开启";
    let disable = document.createElement('div');
    disable.id = "tool-disable";
    disable.textContent = DISABLE;
    disable.style = PANEL_STYLES.disable;

    disable.addEventListener('click', (e) => disableEvent(e));

    // 生成单词和选择框
    let headline = document.createElement('div');
    headline.textContent = "全部模型";
    headline.style.cssText = PANEL_STYLES.headline;

    let sitesAndCurrent = getSitesAndCurrent();
    const items = []; // 收集所有item元素

    words.forEach(word => {
        const item = document.createElement('div');
        item.style.cssText = PANEL_STYLES.item;
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
            contentContainer.style.color = "lightgray";
        }else{
            setGV("disable", false);
            disable.textContent = DISABLE;
            contentContainer.style.color = "black";
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
        let selectedWords = selectedSites.map(site => siteToWord[site])
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
            selectedWords = selectedSites.map(site => siteToWord[site]).filter(word => word);
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

        selectedWords.forEach(word => {
            const item = document.createElement('div');
            item.style.cssText = PANEL_STYLES.item;
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
     * ║  ⚠️ 10、一些工具函数  ⚠️                       ║
     * ║                                                                      ║
     * ═══════════════════════════════════════════════════════════════════════
     ******************************************************************************/

    // 获取当前URL
    function getUrl(){
        return window.location.href;
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
                let responseText = response.responseText;
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
                localStorage.removeItem(UID_KEY_PREFIX + uid);
                GM_deleteValue(uid);
            }

            localStorage.removeItem(chatIdKey);
            queue.pop();
            localStorage.setItem(QUEUE, JSON.stringify(queue));
        }
    }

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

    // localStorage 读写json（hashMap）
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
        // 提问内容相同，如果带图片则允许继续，不带图则终止。且注意清除缓存标记。
        let currentHasImageflag = getS(T + currentAskHasImage);
        if(!isEmpty(currentHasImageflag)){
            setS(T + currentAskHasImage, "");
            return false;
        }

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

    // 通用判空函数
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

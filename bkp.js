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


(function () {
    "use strict";
    const content = window.STM_GUIDE_CONTENT;
    if (!content || window.STM_FIELD_MANUAL) return;

    let opener = null;
    const el = {};
    const make = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };

    function build() {
        el.overlay = make("div", "stm-guide");
        el.overlay.id = "stmFieldManual";
        el.overlay.hidden = true;
        el.overlay.setAttribute("role", "dialog");
        el.overlay.setAttribute("aria-modal", "true");
        el.overlay.setAttribute("aria-labelledby", "stmGuideTitle");

        const shell = make("div", "stm-guide-shell");
        const head = make("header", "stm-guide-head");
        const title = make("h1", "stm-guide-title", content.title);
        title.id = "stmGuideTitle";
        el.close = make("button", "stm-guide-close", "CLOSE");
        el.close.type = "button";
        head.append(title, el.close);

        const main = make("div", "stm-guide-main");
        const nav = make("nav", "stm-guide-nav");
        nav.setAttribute("aria-label", "Guide sections");
        const toc = make("div", "stm-guide-toc");
        el.scroller = make("main", "stm-guide-content");
        el.scroller.tabIndex = 0;

        content.sections.forEach((section, index) => {
            const button = make("button", "", `${String(index + 1).padStart(2, "0")} // ${section.title}`);
            button.type = "button";
            button.addEventListener("click", () => {
                document.getElementById(`guide-${section.id}`)?.scrollIntoView({ block: "start" });
            });
            toc.append(button);
            const article = make("section", "stm-guide-block");
            article.id = `guide-${section.id}`;
            article.append(make("h2", "", section.title));
            section.paragraphs.forEach(paragraph => article.append(make("p", "", paragraph)));
            el.scroller.append(article);
        });

        nav.append(toc);
        main.append(nav, el.scroller);
        shell.append(head, main);
        el.overlay.append(shell);
        document.body.append(el.overlay);
        bind();
    }

    function open() {
        opener = document.activeElement;
        document.body.classList.add("stm-guide-scroll-lock");
        el.overlay.hidden = false;
        el.scroller.scrollTop = 0;
        el.close.focus();
    }

    function close() {
        el.overlay.hidden = true;
        document.body.classList.remove("stm-guide-scroll-lock");
        opener?.focus?.();
    }

    function trapFocus(event) {
        if (event.key !== "Tab") return;
        const nodes = [...el.overlay.querySelectorAll("button,[tabindex='0']")].filter(node => node.getClientRects().length);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function bind() {
        el.close.addEventListener("click", close);
        el.overlay.addEventListener("pointerdown", event => {
            if (event.target === el.overlay) close();
        });
        document.addEventListener("keydown", event => {
            if (el.overlay.hidden) return;
            if (event.key === "Escape") {
                event.preventDefault();
                close();
            } else trapFocus(event);
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        build();
        document.getElementById("guideTrigger")?.addEventListener("click", open);
    }, { once: true });

    window.STM_FIELD_MANUAL = Object.freeze({ open, close });
}());

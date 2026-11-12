/**
 * codeblock-nodeview.js
 * NodeView de Bloque de Código para el WebView móvil de Veyra
 * Soporta selector de lenguaje, botón de ajuste de línea (Word Wrap) y botón de copiar en 1 clic
 */

const LANGUAGES = [
    { value: 'auto', label: 'Texto plano' },
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'python', label: 'Python' },
    { value: 'html', label: 'HTML' },
    { value: 'css', label: 'CSS' },
    { value: 'json', label: 'JSON' },
    { value: 'sql', label: 'SQL' },
    { value: 'bash', label: 'Bash / Shell' },
    { value: 'c', label: 'C' },
    { value: 'cpp', label: 'C++' },
    { value: 'csharp', label: 'C#' },
    { value: 'java', label: 'Java' },
    { value: 'rust', label: 'Rust' },
    { value: 'go', label: 'Go' },
    { value: 'php', label: 'PHP' },
    { value: 'markdown', label: 'Markdown' },
];

export class CodeBlockNodeView {
    constructor(node, view, getPos) {
        this.node = node;
        this.view = view;
        this.getPos = getPos;

        this.initDOM();
        this.syncUI();
    }

    initDOM() {
        this.dom = document.createElement('div');
        this.dom.className = 'veyra-code-block-wrapper';

        // Cabecera superior
        this.header = document.createElement('div');
        this.header.className = 'veyra-code-header';
        this.header.setAttribute('contenteditable', 'false');

        // Izquierda: Contenedor del selector de lenguaje
        this.langContainer = document.createElement('div');
        this.langContainer.className = 'veyra-code-lang-container';

        this.langBtn = document.createElement('button');
        this.langBtn.type = 'button';
        this.langBtn.className = 'veyra-code-lang-btn';
        this.langBtn.innerHTML = `
            <span class="veyra-code-lang-text">Auto</span>
            <span class="veyra-code-chevron">▾</span>
        `;

        this.langMenu = document.createElement('div');
        this.langMenu.className = 'veyra-code-lang-menu';
        this.langMenu.style.display = 'none';

        LANGUAGES.forEach(lang => {
            const item = document.createElement('div');
            item.className = 'veyra-code-lang-item';
            item.textContent = lang.label;
            item.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.setLanguage(lang.value);
                this.closeLangMenu();
            });
            this.langMenu.appendChild(item);
        });

        this.langBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleLangMenu();
        });

        this.langContainer.appendChild(this.langBtn);
        this.langContainer.appendChild(this.langMenu);

        // Derecha: Acciones (Wrap y Copiar)
        const actions = document.createElement('div');
        actions.className = 'veyra-code-actions';

        // Botón Ajuste de línea (Word Wrap)
        this.wrapBtn = document.createElement('button');
        this.wrapBtn.type = 'button';
        this.wrapBtn.className = 'veyra-code-action-btn veyra-code-wrap-btn';
        this.wrapBtn.title = 'Ajuste de línea';
        this.wrapBtn.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <path d="M3 12h15a3 3 0 1 1 0 6h-4"></path>
                <polyline points="16 16 14 18 16 20"></polyline>
                <line x1="3" y1="18" x2="10" y2="18"></line>
            </svg>
        `;
        this.wrapBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleWrap();
        });

        // Botón Copiar
        this.copyBtn = document.createElement('button');
        this.copyBtn.type = 'button';
        this.copyBtn.className = 'veyra-code-action-btn veyra-code-copy-btn';
        this.copyBtn.title = 'Copiar código';
        this.copyBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span class="veyra-copy-label">Copiar</span>
        `;
        this.copyBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.copyCode();
        });

        actions.appendChild(this.wrapBtn);
        actions.appendChild(this.copyBtn);

        this.header.appendChild(this.langContainer);
        this.header.appendChild(actions);

        // Pre y Code para el contenido de sintaxis
        this.pre = document.createElement('pre');
        this.code = document.createElement('code');
        this.pre.appendChild(this.code);

        this.dom.appendChild(this.header);
        this.dom.appendChild(this.pre);

        this.contentDOM = this.code;

        this._onDocClick = (e) => {
            if (this.langContainer && !this.langContainer.contains(e.target)) {
                this.closeLangMenu();
            }
        };
        document.addEventListener('pointerdown', this._onDocClick);
    }

    setLanguage(langVal) {
        if (typeof this.getPos !== 'function') return;
        const pos = this.getPos();
        const tr = this.view.state.tr.setNodeMarkup(pos, null, {
            ...this.node.attrs,
            language: langVal === 'auto' ? null : langVal,
        });
        this.view.dispatch(tr);
    }

    toggleWrap() {
        if (typeof this.getPos !== 'function') return;
        const pos = this.getPos();
        const isWrapped = !this.node.attrs.wrap;
        const tr = this.view.state.tr.setNodeMarkup(pos, null, {
            ...this.node.attrs,
            wrap: isWrapped,
        });
        this.view.dispatch(tr);
    }

    copyCode() {
        const text = this.node.textContent || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }

        const label = this.copyBtn.querySelector('.veyra-copy-label');
        if (label) label.textContent = '✓';
        this.copyBtn.classList.add('is-copied');

        setTimeout(() => {
            if (label) label.textContent = 'Copiar';
            this.copyBtn.classList.remove('is-copied');
        }, 1800);
    }

    toggleLangMenu() {
        if (this.langMenu.style.display === 'none') {
            this.langMenu.style.display = 'block';
        } else {
            this.closeLangMenu();
        }
    }

    closeLangMenu() {
        if (this.langMenu) this.langMenu.style.display = 'none';
    }

    syncUI() {
        const currentLangVal = this.node.attrs.language || 'auto';
        const langObj = LANGUAGES.find(l => l.value === currentLangVal) || LANGUAGES[0];
        const textEl = this.langBtn.querySelector('.veyra-code-lang-text');
        if (textEl) textEl.textContent = langObj.label;

        const isWrapped = Boolean(this.node.attrs.wrap);
        if (isWrapped) {
            this.pre.classList.add('is-wrapped');
            this.wrapBtn.classList.add('is-active');
        } else {
            this.pre.classList.remove('is-wrapped');
            this.wrapBtn.classList.remove('is-active');
        }
    }

    update(node) {
        if (node.type !== this.node.type) return false;
        this.node = node;
        this.syncUI();
        return true;
    }

    ignoreMutation(mutation) {
        return this.header.contains(mutation.target);
    }

    stopEvent(event) {
        return this.header.contains(event.target);
    }

    destroy() {
        if (this._onDocClick) {
            document.removeEventListener('pointerdown', this._onDocClick);
        }
    }
}

